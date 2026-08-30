"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-outer-head-bottleneck-audit.json"
);
const OUTPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-outer-head-role-qualification-audit.json"
);

const EXPECTED_FOCUS = "inspect-head-role-qualification-blockers";
const MINIMUM_SAMPLE = 20;
const MINIMUM_QUALIFICATION_COUNT = 10;
const MINIMUM_QUALIFICATION_RATE = 40;
const MINIMUM_DOWNSTREAM_COUNT = 10;

const QUALIFICATION_PRIMARY = new Set([
  "support-visible-no-head-role",
  "position-1-not-eligible",
  "head-intent-missing",
  "explicit-head-contract-missing",
  "no-saved-outer-head-evidence"
]);

const DOWNSTREAM_ROUTES = Object.freeze({
  "downstream-scenario-promotion": "audit-outer-head-scenario-promotion",
  "downstream-selected-ranking": "audit-outer-head-selected-ranking",
  "downstream-final-handoff": "audit-outer-head-final-handoff"
});

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total > 0 ? round1(Number(count || 0) / total * 100) : null;
}

function increment(map, key, amount = 1) {
  const normalized = String(key || "unknown");
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function sortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
  );
}

function scoreBand(score) {
  const value = Number(score?.value ?? score);
  if (!Number.isFinite(value)) return "unavailable";
  if (value >= 80) return "80plus";
  if (value >= 65) return "65to79";
  if (value >= 50) return "50to64";
  return "under50";
}

function positionPattern(values) {
  const positions = [...new Set(arr(values)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 3))]
    .sort((a, b) => a - b);
  return positions.length ? positions.join(",") : "none";
}

function normalizeSignal(flag) {
  const value = String(flag || "");
  const mapping = {
    "support-visible-but-no-head-role": "support-visible-no-head-role",
    "support-role-only": "support-role-only",
    "position-1-not-eligible": "position-1-not-eligible",
    "role-intent-without-head": "head-intent-missing",
    "candidate-rejected-or-not-selected": "candidate-rejected-or-unselected",
    "no-explicit-head-role-contract": "explicit-head-contract-missing",
    "head-candidate-not-promoted": "downstream-scenario-promotion",
    "head-scenario-not-selected": "downstream-selected-ranking",
    "selected-head-not-final-handoff": "downstream-final-handoff"
  };
  return mapping[value] || value || "unknown";
}

function primaryBlocker(example = {}) {
  const classification = String(example.classification || "");
  const flags = new Set(arr(example.blockerFlags).map(String));

  if (classification === "final-correct") return "already-final-correct";
  if (classification === "selected-head-not-final") {
    return "downstream-final-handoff";
  }
  if (classification === "scenario-head-not-selected") {
    return "downstream-selected-ranking";
  }
  if (classification === "candidate-head-not-promoted") {
    return "downstream-scenario-promotion";
  }
  if (
    flags.has("support-visible-but-no-head-role") ||
    classification === "support-only-not-head-eligible"
  ) {
    return "support-visible-no-head-role";
  }
  if (flags.has("position-1-not-eligible")) {
    return "position-1-not-eligible";
  }
  if (flags.has("role-intent-without-head")) {
    return "head-intent-missing";
  }
  if (flags.has("candidate-rejected-or-not-selected")) {
    return "candidate-rejected-or-unselected";
  }
  if (flags.has("no-explicit-head-role-contract")) {
    return "explicit-head-contract-missing";
  }
  if (classification === "no-saved-outer-head-evidence") {
    return "no-saved-outer-head-evidence";
  }
  return "unclassified";
}

function selectDominant(counts, keys) {
  return keys
    .map((key) => ({ key, count: Number(counts[key] || 0) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))[0];
}

function decideNextStep({
  applicable,
  sampleCount,
  primaryCounts,
  qualificationSideCount
}) {
  const qualificationSideRate = rate(qualificationSideCount, sampleCount);

  if (!applicable) {
    return {
      nextStep: "follow-upstream-diagnosis-focus",
      reason: "上流の固定診断焦点が頭役割資格の監査ではないため、この判定は適用しない。"
    };
  }

  if (sampleCount < MINIMUM_SAMPLE) {
    return {
      nextStep: "continue-collecting-role-qualification-evidence",
      reason: `対象${sampleCount}Rで、固定した最低${MINIMUM_SAMPLE}Rに未到達。`
    };
  }

  if (
    qualificationSideCount >= MINIMUM_QUALIFICATION_COUNT &&
    qualificationSideRate >= MINIMUM_QUALIFICATION_RATE
  ) {
    return {
      nextStep: "build-outer-head-eligibility-counterfactual-grid",
      reason: `頭役割資格側の主要因が${qualificationSideCount}R・${qualificationSideRate}%で、固定条件（${MINIMUM_QUALIFICATION_COUNT}R以上かつ${MINIMUM_QUALIFICATION_RATE}%以上）を満たした。`
    };
  }

  const dominantDownstream = selectDominant(
    primaryCounts,
    Object.keys(DOWNSTREAM_ROUTES)
  );
  if (dominantDownstream.count >= MINIMUM_DOWNSTREAM_COUNT) {
    return {
      nextStep: DOWNSTREAM_ROUTES[dominantDownstream.key],
      reason: `${dominantDownstream.key}が${dominantDownstream.count}Rで、固定した下流監査条件${MINIMUM_DOWNSTREAM_COUNT}R以上を満たした。`
    };
  }

  return {
    nextStep: "continue-collecting-role-qualification-evidence",
    reason: "頭役割資格側・下流側とも、事前固定した次工程条件に未到達。"
  };
}

function build(inputReport = {}) {
  const report = object(inputReport);
  const examples = arr(report.examples);
  const sampleCount = examples.length;
  const applicable = report.diagnosisFocus === EXPECTED_FOCUS;

  const primary = new Map();
  const allSignals = new Map();
  const byBoat = new Map();
  const byCondition = new Map();
  const byVenue = new Map();
  const byScoreBand = new Map();
  const byPositionPattern = new Map();
  const roleTokens = new Map();
  const primaryByBoat = new Map();
  const primaryByCondition = new Map();
  const primaryByVenue = new Map();
  const normalizedExamples = [];

  for (const example of examples) {
    const primaryKey = primaryBlocker(example);
    const boat = String(example.actualHead || "unknown");
    const condition = String(example.conditionBand || "unknown");
    const venue = String(example.venue || example.jcd || "unknown");
    const score = scoreBand(example.strongestScore);
    const positionKey = positionPattern(example.eligiblePositionsSeen);

    increment(primary, primaryKey);
    increment(byBoat, boat);
    increment(byCondition, condition);
    increment(byVenue, venue);
    increment(byScoreBand, score);
    increment(byPositionPattern, positionKey);
    increment(primaryByBoat, `${primaryKey}|${boat}`);
    increment(primaryByCondition, `${primaryKey}|${condition}`);
    increment(primaryByVenue, `${primaryKey}|${venue}`);

    const normalizedSignals = [...new Set(arr(example.blockerFlags)
      .map(normalizeSignal)
      .filter(Boolean))];
    for (const signal of normalizedSignals) increment(allSignals, signal);
    for (const role of arr(example.roles)) {
      const token = String(role || "").trim().toLowerCase();
      if (token) increment(roleTokens, token);
    }

    normalizedExamples.push({
      date: example.date || null,
      jcd: example.jcd || null,
      raceNo: Number(example.raceNo || 0),
      venue: example.venue || "",
      conditionBand: condition,
      actualHead: Number(example.actualHead || 0) || null,
      finalHead: Number(example.finalHead || 0) || null,
      upstreamClassification: example.classification || null,
      primaryBlocker: primaryKey,
      blockerSignals: normalizedSignals,
      strongestScoreBand: score,
      eligiblePositionPattern: positionKey,
      roles: arr(example.roles),
      reasons: arr(example.reasons).slice(0, 8)
    });
  }

  const primaryCounts = sortedObject(primary);
  const primaryRates = Object.fromEntries(
    Object.entries(primaryCounts).map(([key, count]) => [key, rate(count, sampleCount)])
  );
  const qualificationSideCount = Object.entries(primaryCounts)
    .filter(([key]) => QUALIFICATION_PRIMARY.has(key))
    .reduce((sum, [, count]) => sum + count, 0);
  const decision = decideNextStep({
    applicable,
    sampleCount,
    primaryCounts,
    qualificationSideCount
  });

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-role-qualification-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "#717の保存済み例だけを使い、実5・6号艇勝利を頭役割資格・シナリオ昇格・選択順位・最終引き渡しへ固定分類する。結果後に新しい特徴量を作らない。",
    sourceVersion: report.version || null,
    sourceGeneratedAt: report.generatedAt || null,
    sourceDiagnosisFocus: report.diagnosisFocus || null,
    expectedDiagnosisFocus: EXPECTED_FOCUS,
    applicable,
    sampleCount,
    gates: {
      minimumSample: MINIMUM_SAMPLE,
      qualificationSideMinimumCount: MINIMUM_QUALIFICATION_COUNT,
      qualificationSideMinimumRate: MINIMUM_QUALIFICATION_RATE,
      downstreamMinimumCount: MINIMUM_DOWNSTREAM_COUNT,
      qualificationPrimaryCategories: [...QUALIFICATION_PRIMARY],
      downstreamRoutes: DOWNSTREAM_ROUTES
    },
    primaryBlockerCounts: primaryCounts,
    primaryBlockerRates: primaryRates,
    qualificationSideCount,
    qualificationSideRate: rate(qualificationSideCount, sampleCount),
    allBlockerSignalCounts: sortedObject(allSignals),
    actualHeadByBoat: sortedObject(byBoat),
    actualHeadByConditionBand: sortedObject(byCondition),
    actualHeadByVenue: sortedObject(byVenue),
    strongestScoreBands: sortedObject(byScoreBand),
    eligiblePositionPatterns: sortedObject(byPositionPattern),
    roleTokenCounts: sortedObject(roleTokens),
    primaryByBoat: sortedObject(primaryByBoat),
    primaryByConditionBand: sortedObject(primaryByCondition),
    primaryByVenue: sortedObject(primaryByVenue),
    nextStep: decision.nextStep,
    decisionReason: decision.reason,
    examples: normalizedExamples.slice(-60)
  };
}

function main() {
  const input = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const output = build(input);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    applicable: output.applicable,
    sampleCount: output.sampleCount,
    primaryBlockerCounts: output.primaryBlockerCounts,
    qualificationSideCount: output.qualificationSideCount,
    qualificationSideRate: output.qualificationSideRate,
    nextStep: output.nextStep
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  scoreBand,
  positionPattern,
  normalizeSignal,
  primaryBlocker,
  decideNextStep,
  build
};
