"use strict";
const fs = require("node:fs");
const path = require("node:path");
const restore = require("./restore-daily-prediction-source");
const builder = require("./build-improvement-review");
const review = require("../js/improvement-review");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "data", "predictions");
const STATS = path.join(ROOT, "data", "stats", "improvement-review.json");
const ts = value => Date.parse(value?.capturedAt || value?.selectedAt || "") || 0;
const ready = s => s?.complete === true && s?.calibrationEligible === true && String(s?.status || "").trim().toLowerCase() === "ready";

restore.restorePredictionSources({ rootDirectory: ROOT, all: true });
const config = JSON.parse(fs.readFileSync(STATS, "utf8"));
const collected = builder.collectPredictionRecords(DIR);
const options = {
  activeGeneration: config.activeGeneration,
  activeSelectorCohortKey: config.activeSelectorCohortKey,
  activeTheorySetFingerprint: config.activeTheorySetFingerprint,
  activeSelectionThreshold: config.activeSelectionThreshold,
  generatedAt: "2000-01-01T00:00:00.000Z"
};
const baseline = review.buildImprovementReview(collected.records, options);

const maps = new Map();
for (const fileName of collected.files) {
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, fileName), "utf8"));
  const byRace = new Map();
  for (const s of Array.isArray(doc?.shadowV2Predictions) ? doc.shadowV2Predictions : []) {
    const raceKey = String(s?.raceKey || "");
    if (!raceKey) continue;
    if (!byRace.has(raceKey)) byRace.set(raceKey, []);
    byRace.get(raceKey).push(s);
  }
  maps.set(fileName, byRace);
}

const counts = {
  unresolvedBaseline: 0,
  durableReferencePresent: 0,
  uniqueExactTimestamp: 0,
  uniqueExactTimestampReady: 0,
  uniqueExactTimestampReadyScoreMismatch: 0,
  ambiguousExactTimestamp: 0,
  noExactTimestamp: 0,
  safeRecovered: 0
};
const examples = {};
const add = (key, value) => {
  if (!examples[key]) examples[key] = [];
  if (examples[key].length < 3) examples[key].push(value);
};

const recovered = collected.records.map(record => {
  if (record?.shadowV2) return record;
  counts.unresolvedBaseline++;
  if (record?.shadowV2Reference?.recordKey) counts.durableReferencePresent++;
  const fileName = String(record?.improvementReviewSource?.fileName || "");
  const raceKey = String(record?.raceKey || "");
  const recordTs = Date.parse(record?.selectedAt || record?.capturedAt || "") || 0;
  const snapshots = maps.get(fileName)?.get(raceKey) || [];
  const exact = recordTs ? snapshots.filter(s => ts(s) === recordTs) : [];
  if (exact.length === 0) {
    counts.noExactTimestamp++;
    add("noExactTimestamp", raceKey);
    return record;
  }
  if (exact.length !== 1) {
    counts.ambiguousExactTimestamp++;
    add("ambiguousExactTimestamp", raceKey);
    return record;
  }
  counts.uniqueExactTimestamp++;
  const candidate = exact[0];
  if (!ready(candidate)) return record;
  counts.uniqueExactTimestampReady++;
  const recordScore = Number(record?.selection?.score);
  const shadowScore = Number(candidate?.evaluation?.totalScore);
  if (Number.isFinite(recordScore) && Number.isFinite(shadowScore) && Math.abs(recordScore - shadowScore) >= 0.000001) {
    counts.uniqueExactTimestampReadyScoreMismatch++;
    add("uniqueExactTimestampReadyScoreMismatch", raceKey);
  }
  counts.safeRecovered++;
  return { ...record, shadowV2: candidate };
});

const safe = review.buildImprovementReview(recovered, options);
console.log(JSON.stringify({
  productionChanged: false,
  activeGenerationKey: config.activeGenerationKey,
  counts,
  baseline: { source: baseline.source, progress: baseline.progress },
  safeUniqueTimestampFallback: { source: safe.source, progress: safe.progress },
  examples
}, null, 2));
