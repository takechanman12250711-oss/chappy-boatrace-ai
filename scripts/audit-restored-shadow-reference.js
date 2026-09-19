"use strict";
const fs = require("node:fs");
const path = require("node:path");
const restore = require("./restore-daily-prediction-source");
const builder = require("./build-improvement-review");
const review = require("../js/improvement-review");
const calibration = require("../js/prediction-calibration");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "data", "predictions");
const STATS = path.join(ROOT, "data", "stats", "improvement-review.json");
const ts = value => Date.parse(value?.capturedAt || value?.selectedAt || "") || 0;
const recordTs = record => [record?.selectedAt, record?.capturedAt, record?.deadlineAt, record?.result?.settledAt].map(v => Date.parse(v || "")).find(Number.isFinite) || 0;
const ready = s => s?.complete === true && s?.calibrationEligible === true && String(s?.status || "").trim().toLowerCase() === "ready";
const evidenceOf = record => record?.prediction?.verificationEvidence || record?.prediction?.practicalSelection?.verificationEvidence || null;

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
  safeRecovered: 0,
  assessmentEligible: 0,
  assessmentEligibleActiveGeneration: 0,
  assessmentEligibleNonActiveGeneration: 0,
  activeIdentityDirect: 0,
  activeIdentityDirectSettled: 0,
  activeIdentityDirectReasons: {}
};
const examples = {};
const generationStats = new Map();
const add = (key, value) => {
  if (!examples[key]) examples[key] = [];
  if (examples[key].length < 3) examples[key].push(value);
};
const addReason = reason => {
  counts.activeIdentityDirectReasons[reason] = Number(counts.activeIdentityDirectReasons[reason] || 0) + 1;
};
const directParts = record => {
  const evidence = evidenceOf(record);
  const generation = calibration.normalizeGeneration?.(evidence?.generation) || {};
  const predictionKey = calibration.generationKey?.(generation) || "";
  const selectorKey = String(record?.shadowV2?.cohortKey || record?.shadowV2Reference?.cohortKey || "");
  const theoryKey = String(evidence?.theorySetFingerprint || "");
  const threshold = Number(record?.selection?.threshold);
  const fullKey = review.reviewGenerationKey(predictionKey, selectorKey, theoryKey, threshold);
  return { predictionKey, selectorKey, theoryKey, threshold: Number.isFinite(threshold) ? threshold : null, fullKey };
};

for (const record of collected.records) {
  const assessment = review.assessReviewRecord(record);
  if (assessment.eligible) {
    counts.assessmentEligible++;
    if (assessment.sample.generationKey === config.activeGenerationKey) counts.assessmentEligibleActiveGeneration++;
    else counts.assessmentEligibleNonActiveGeneration++;
  }
  const parts = directParts(record);
  if (parts.fullKey) {
    const current = generationStats.get(parts.fullKey) || {
      key: parts.fullKey,
      predictionKey: parts.predictionKey,
      selectorKey: parts.selectorKey,
      theoryKey: parts.theoryKey,
      threshold: parts.threshold,
      count: 0,
      settled: 0,
      assessmentEligible: 0,
      latestTimestamp: 0,
      sampleRaceKey: ""
    };
    current.count++;
    if (record?.result?.settled === true || record?.officialResult?.settled === true) current.settled++;
    if (assessment.eligible) current.assessmentEligible++;
    const rt = recordTs(record);
    if (rt >= current.latestTimestamp) {
      current.latestTimestamp = rt;
      current.sampleRaceKey = String(record?.raceKey || "");
    }
    generationStats.set(parts.fullKey, current);
  }
  if (parts.fullKey && parts.fullKey === config.activeGenerationKey) {
    counts.activeIdentityDirect++;
    if (record?.result?.settled === true || record?.officialResult?.settled === true) counts.activeIdentityDirectSettled++;
    addReason(assessment.eligible ? "eligible" : String(assessment.reason || "unknown"));
    if (!assessment.eligible) add(`activeIdentity:${assessment.reason || "unknown"}`, String(record?.raceKey || ""));
  }
}

const recovered = collected.records.map(record => {
  if (record?.shadowV2) return record;
  counts.unresolvedBaseline++;
  if (record?.shadowV2Reference?.recordKey) counts.durableReferencePresent++;
  const fileName = String(record?.improvementReviewSource?.fileName || "");
  const raceKey = String(record?.raceKey || "");
  const rt = Date.parse(record?.selectedAt || record?.capturedAt || "") || 0;
  const snapshots = maps.get(fileName)?.get(raceKey) || [];
  const exact = rt ? snapshots.filter(s => ts(s) === rt) : [];
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
const observedGenerationKeys = [...generationStats.values()]
  .sort((a, b) => b.latestTimestamp - a.latestTimestamp || b.count - a.count)
  .slice(0, 8)
  .map(row => ({ ...row, latestAt: row.latestTimestamp ? new Date(row.latestTimestamp).toISOString() : null }));

console.log(JSON.stringify({
  productionChanged: false,
  active: {
    generationKey: config.activeGenerationKey,
    predictionGenerationKey: config.activePredictionGenerationKey,
    selectorCohortKey: config.activeSelectorCohortKey,
    theorySetFingerprint: config.activeTheorySetFingerprint,
    selectionThreshold: config.activeSelectionThreshold
  },
  counts,
  observedGenerationKeys,
  baseline: { source: baseline.source, progress: baseline.progress },
  safeUniqueTimestampFallback: { source: safe.source, progress: safe.progress },
  examples
}, null, 2));
