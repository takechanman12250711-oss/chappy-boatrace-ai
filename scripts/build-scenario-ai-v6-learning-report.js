"use strict";

const fs = require("node:fs");
const path = require("node:path");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");

const ROOT = path.resolve(__dirname, "..");
const PREDICTIONS_DIR = path.join(ROOT, "data", "predictions");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-learning-report.json");

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(hit, total) {
  return total ? Math.round(hit / total * 1000) / 10 : 0;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function predictionFiles(directory = PREDICTIONS_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .map(name => path.join(directory, name));
}

function scenarioRows(doc = {}) {
  return (Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : [])
    .filter(record =>
      record?.scenarioAiV6Verification?.status === "verified" &&
      record?.scenarioAiV6Verification?.logicFingerprint ===
        scenarioAiV6.LOGIC_FINGERPRINT &&
      record?.scenarioAiV6ShadowAb?.candidateSetFingerprint === "none"
    )
    .flatMap(record => {
      const verification = record.scenarioAiV6Verification;
      return (Array.isArray(verification?.scenarios) ? verification.scenarios : []).map(scenario => ({
        raceKey: String(record?.raceKey || ""),
        date: String(record?.date || doc?.date || ""),
        selectedAt: String(record?.selectedAt || ""),
        inputSourceKind: String(
          verification?.inputSourceKind ||
          record?.scenarioAiV6Shadow?.inputSourceKind ||
          ""
        ),
        jcd: String(record?.jcd || "").padStart(2, "0"),
        place: String(record?.place || ""),
        rank: number(scenario?.rank),
        scenarioType: String(scenario?.scenarioType || "unknown"),
        likelihood: number(scenario?.likelihood),
        exact: scenario?.exact === true,
        firstHit: scenario?.firstHit === true,
        top2Hit: scenario?.top2Hit === true,
        winningMethodMatch: scenario?.winningMethodMatch,
        breakReasons: Array.isArray(scenario?.breakReasons) ? scenario.breakReasons.map(String) : []
      }));
    });
}

function activeTrainingRows(rows = []) {
  const eligible = rows.filter(row =>
    row?.selectedAt &&
    Number.isFinite(Date.parse(row.selectedAt)) &&
    row?.inputSourceKind
  );
  const latest = [...eligible].sort((left, right) =>
    Date.parse(left.selectedAt) - Date.parse(right.selectedAt) ||
    String(left.raceKey).localeCompare(String(right.raceKey))
  ).at(-1) || null;
  const activeInputSourceKind = String(latest?.inputSourceKind || "");
  return {
    activeInputSourceKind,
    rows: activeInputSourceKind
      ? eligible.filter(row => row.inputSourceKind === activeInputSourceKind)
      : []
  };
}

function createBucket(key, label = key) {
  return {
    key,
    label,
    sampleCount: 0,
    exactCount: 0,
    firstHitCount: 0,
    top2HitCount: 0,
    methodComparableCount: 0,
    methodMatchCount: 0,
    likelihoodTotal: 0
  };
}

function add(bucket, row) {
  bucket.sampleCount += 1;
  if (row.exact) bucket.exactCount += 1;
  if (row.firstHit) bucket.firstHitCount += 1;
  if (row.top2Hit) bucket.top2HitCount += 1;
  if (typeof row.winningMethodMatch === "boolean") {
    bucket.methodComparableCount += 1;
    if (row.winningMethodMatch) bucket.methodMatchCount += 1;
  }
  bucket.likelihoodTotal += row.likelihood;
}

function finalize(bucket) {
  return {
    ...bucket,
    exactRate: rate(bucket.exactCount, bucket.sampleCount),
    firstHitRate: rate(bucket.firstHitCount, bucket.sampleCount),
    top2HitRate: rate(bucket.top2HitCount, bucket.sampleCount),
    winningMethodMatchRate: rate(bucket.methodMatchCount, bucket.methodComparableCount),
    averageLikelihood: bucket.sampleCount
      ? Math.round(bucket.likelihoodTotal / bucket.sampleCount * 10) / 10
      : 0
  };
}

function aggregate(rows, keyBuilder, labelBuilder = keyBuilder) {
  const map = new Map();
  rows.forEach(row => {
    const key = String(keyBuilder(row));
    const bucket = map.get(key) || createBucket(key, String(labelBuilder(row)));
    add(bucket, row);
    map.set(key, bucket);
  });
  return [...map.values()].map(finalize).sort((a, b) =>
    b.sampleCount - a.sampleCount || b.exactRate - a.exactRate || a.key.localeCompare(b.key)
  );
}

function buildBreakReasonSummary(rows) {
  const counts = new Map();
  rows.forEach(row => row.breakReasons.forEach(reason => {
    counts.set(reason, number(counts.get(reason)) + 1);
  }));
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function proposalFor(row, minimumSample) {
  if (row.sampleCount < minimumSample) {
    return { action: "collect", adjustment: 0, reason: `サンプル${minimumSample}件未満` };
  }
  if (row.exactRate >= 20 && row.firstHitRate >= 45 && row.winningMethodMatchRate >= 55) {
    return { action: "raise", adjustment: 2, reason: "完全一致・1着一致・決まり手が同方向で良好" };
  }
  if (row.exactRate <= 8 && row.firstHitRate <= 30 && row.winningMethodMatchRate <= 40) {
    return { action: "lower", adjustment: -2, reason: "完全一致・1着一致・決まり手が同方向で低調" };
  }
  return { action: "maintain", adjustment: 0, reason: "指標が混在しているため現状維持" };
}

function buildReport(documents = []) {
  const allRows = documents.flatMap(scenarioRows);
  const training = activeTrainingRows(allRows);
  const rows = training.rows;
  const raceKeys = new Set(rows.map(row => row.raceKey).filter(Boolean));
  const byScenarioType = aggregate(rows, row => row.scenarioType);
  const byCandidateRank = aggregate(rows, row => `rank-${row.rank}`, row => `候補${row.rank}位`);
  const byVenueScenarioType = aggregate(
    rows,
    row => `${row.jcd}:${row.scenarioType}`,
    row => `${row.place || row.jcd} × ${row.scenarioType}`
  );

  const proposals = [
    ...byScenarioType.map(row => ({ scope: "scenario-type", ...row, ...proposalFor(row, 50) })),
    ...byVenueScenarioType.map(row => ({ scope: "venue-scenario-type", ...row, ...proposalFor(row, 30) }))
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "scenarioAiV6Verification",
    logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
    candidateTrainingMode: "pre-candidate-only",
    activeInputSourceKind: training.activeInputSourceKind,
    excludedOtherInputSourceCount: allRows.length - rows.length,
    verifiedRaceCount: raceKeys.size,
    evaluatedScenarioCount: rows.length,
    byScenarioType,
    byCandidateRank,
    byVenueScenarioType,
    breakReasonSummary: buildBreakReasonSummary(rows),
    proposals,
    proposalSummary: {
      raise: proposals.filter(row => row.action === "raise").length,
      maintain: proposals.filter(row => row.action === "maintain").length,
      lower: proposals.filter(row => row.action === "lower").length,
      collect: proposals.filter(row => row.action === "collect").length
    },
    proposalOnly: true,
    usableForPrediction: false,
    automaticApplication: false
  };
}

function writeReport(report, outputPath = OUTPUT_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function main() {
  const documents = predictionFiles().map(file => readJson(file, {}));
  const report = buildReport(documents);
  writeReport(report);
  console.log(`展開AI v6学習：${report.verifiedRaceCount}R／${report.evaluatedScenarioCount}シナリオ`);
}

if (require.main === module) main();

module.exports = {
  buildReport,
  scenarioRows,
  aggregate,
  proposalFor,
  buildBreakReasonSummary,
  activeTrainingRows
};
