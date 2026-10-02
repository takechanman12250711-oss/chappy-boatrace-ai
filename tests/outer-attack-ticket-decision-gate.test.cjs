"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const gate = require("../js/outer-attack-ticket-decision-gate.js");

const rootDir = path.resolve(__dirname, "..");
const frozenConfig = JSON.parse(
  fs.readFileSync(
    path.join(rootDir, "config", "outer-attack-ticket-decision-gate-v1.json"),
    "utf8"
  )
);

function outcome(hit, returnYen, stake = 900) {
  return {
    hit,
    investmentYen: stake,
    returnYen,
    profitYen: returnYen - stake,
    roiPercent: returnYen / stake * 100
  };
}

function settlementRow(index, type = "neutral", options = {}) {
  const instant = new Date(
    Date.UTC(2026, 8, 1 + Math.floor(index / 20), 0, index % 20)
  );
  const date = [
    instant.getUTCFullYear(),
    String(instant.getUTCMonth() + 1).padStart(2, "0"),
    String(instant.getUTCDate()).padStart(2, "0")
  ].join("");
  const sourceRaceKey = `${date}-05-${index % 12 + 1}`;
  let a = outcome(false, 0);
  let cover = outcome(false, 0);
  if (type === "b-only") cover = outcome(true, 3000);
  else if (type === "a-only") a = outcome(true, 2500);
  else if (type === "both") {
    a = outcome(true, 1000);
    cover = outcome(true, 1000);
  }
  const neutral = { ...a };
  return {
    status: "settled-shadow-only",
    settlementVersion: "outer-attack-ticket-settlement-v1",
    sourceRaceKey,
    shadowCaptureAt: options.shadowCaptureAt || instant.toISOString(),
    settledAt: "2026-10-01T00:00:00.000Z",
    captureOrder: options.captureOrder || "prediction-before-result",
    comparisonEligible: options.comparisonEligible !== false,
    resultUsedForGeneration: options.resultUsedForGeneration === true,
    variantMetadata: {
      cover: { status: "ready", targetBoatNo: 3, targetPosition: 3 },
      flow: { status: "ready", targetBoatNo: 3, targetPosition: 3 },
      hole: { status: "ready", targetBoatNo: 3, targetPosition: 2 }
    },
    comparison: {
      a,
      variants: {
        cover: { status: "ready", outcome: cover },
        flow: { status: "ready", outcome: neutral },
        hole: { status: "ready", outcome: neutral }
      }
    }
  };
}

function passingRows(count = 500) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const halfIndex = index % 250;
    const type = halfIndex < 10
      ? "b-only"
      : halfIndex < 12
        ? "a-only"
        : halfIndex < 30
          ? "both"
          : "neutral";
    rows.push(settlementRow(index, type));
  }
  return rows;
}

assert.equal(gate.VERSION, "outer-attack-ticket-decision-gate-v1");
assert.equal(gate.STORAGE_KEY, "chappy_outer_attack_ticket_decision_gate_v1");
assert.deepEqual(gate.CONFIG, frozenConfig, "実装条件と事前登録JSONを一致させる");
assert.equal(Object.isFrozen(gate.CONFIG), true);
assert.equal(Object.isFrozen(gate.CONFIG.finalGate), true);
assert.equal(gate.CONFIG.safety.automaticApplication, false);
assert.equal(gate.CONFIG.safety.uiChanged, false);
assert.equal(gate.pairedOneSidedPValue(4, 1), 0.1875);
assert.equal(gate.pairedOneSidedPValue(0, 0), null);

const beforeStart = settlementRow(0, "b-only", {
  shadowCaptureAt: "2026-08-31T01:59:59.000Z"
});
assert.equal(gate.classifySettlement(beforeStart), "before-prospective-start");
assert.equal(
  gate.classifySettlement(settlementRow(0, "b-only", {
    captureOrder: "result-before-prediction"
  })),
  "result-first"
);
assert.equal(
  gate.classifySettlement(settlementRow(0, "b-only", {
    captureOrder: "unknown"
  })),
  "unknown-capture-order"
);
assert.equal(
  gate.classifySettlement({
    ...settlementRow(0),
    settlementVersion: "future-version"
  }),
  "settlement-version-mismatch"
);
assert.equal(
  gate.classifySettlement(settlementRow(0, "b-only", {
    resultUsedForGeneration: true
  })),
  "not-comparison-eligible"
);

const rows = passingRows();
const report = gate.buildDecisionReport(rows, {
  now: "2026-10-01T00:00:00.000Z"
});
const cover = report.variants.cover;
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.humanApprovalRequired, true);
assert.equal(report.thresholdSearchPerformed, false);
assert.equal(report.diagnostics.prospectiveForwardCount, 500);
assert.equal(cover.sampleCount, 500);
assert.equal(cover.distinctDateCount, 25);
assert.equal(cover.metrics.sameStakeCoveragePercent, 100);
assert.equal(cover.metrics.hitCountDelta, 16);
assert.equal(cover.metrics.hitRatePointDelta, 3.2);
assert.equal(cover.metrics.profitDeltaYen, 50000);
assert.equal(cover.metrics.roiPointDelta, 11.1);
assert.equal(cover.metrics.jackknifeProfitDeltaYen, 47000);
assert.ok(cover.metrics.oneSidedPairedPValue <= 0.05);
assert.equal(cover.halves.first.hitCountDelta, 8);
assert.equal(cover.halves.second.hitCountDelta, 8);
assert.equal(cover.halves.first.profitDeltaYen, 25000);
assert.equal(cover.halves.second.profitDeltaYen, 25000);
assert.equal(cover.finalGate.passed, true);
assert.equal(cover.status, "approval-candidate-human-review");
assert.equal(report.variants.flow.status, "continue-monitoring-no-approval");
assert.equal(report.variants.hole.status, "continue-monitoring-no-approval");
assert.equal(report.recommendedVariant, "cover");
assert.equal(report.recommendationStatus, "approval-candidate-human-review");
assert.equal(report.nextStep, "human-review-one-ticket-outer-attack-variant");

const interim = gate.buildDecisionReport(rows.slice(0, 250));
assert.equal(interim.variants.cover.interimGate.passed, true);
assert.equal(interim.variants.cover.status, "interim-candidate-hold-to-500");
assert.equal(interim.recommendedVariant, null);
assert.equal(interim.nextStep, "continue-to-500-with-frozen-rules");

const collecting = gate.buildDecisionReport(rows.slice(0, 99));
assert.equal(collecting.variants.cover.status, "collecting-to-100");
assert.equal(collecting.variants.cover.remainingToNextMilestone, 1);
assert.equal(collecting.recommendedVariant, null);

const harmRows = [];
for (let index = 0; index < 100; index += 1) {
  harmRows.push(settlementRow(index, index < 5 ? "a-only" : "neutral"));
}
const harm = gate.buildDecisionReport(harmRows);
assert.equal(harm.variants.cover.metrics.hitCountDelta, -5);
assert.ok(harm.variants.cover.metrics.roiPointDelta <= -10);
assert.equal(harm.variants.cover.harmReview.triggered, true);
assert.equal(harm.variants.cover.status, "harm-review");
assert.equal(harm.nextStep, "review-harm-without-changing-frozen-thresholds");

const unequalStakeRows = passingRows();
unequalStakeRows[0] = JSON.parse(JSON.stringify(unequalStakeRows[0]));
unequalStakeRows[0].comparison.variants.cover.outcome.investmentYen = 800;
const unequalStake = gate.buildDecisionReport(unequalStakeRows);
assert.equal(unequalStake.variants.cover.metrics.sameStakeCoveragePercent, 99.8);
assert.equal(unequalStake.variants.cover.finalGate.checks.sameStakeCoverage, false);
assert.equal(unequalStake.variants.cover.status, "continue-monitoring-no-approval");

const dominatedMetrics = {
  ...cover.metrics,
  jackknifeProfitDeltaYen: 0
};
const dominatedChecks = gate.gateChecks(
  dominatedMetrics,
  cover.halves,
  gate.CONFIG.finalGate,
  cover.distinctDateCount,
  gate.CONFIG.minimumDistinctDates.final
);
assert.equal(dominatedChecks.checks.jackknifeProfit, false);
assert.equal(dominatedChecks.passed, false, "単一高配当だけの改善を承認しない");

const mixed = gate.buildDecisionReport([
  ...rows,
  beforeStart,
  settlementRow(700, "b-only", { captureOrder: "result-before-prediction" }),
  settlementRow(701, "b-only", { captureOrder: "unknown" })
]);
assert.equal(mixed.diagnostics.sourceSettlementCount, 503);
assert.equal(mixed.diagnostics.prospectiveForwardCount, 500);
assert.equal(mixed.diagnostics.exclusionCounts["before-prospective-start"], 1);
assert.equal(mixed.diagnostics.exclusionCounts["result-first"], 1);
assert.equal(mixed.diagnostics.exclusionCounts["unknown-capture-order"], 1);

const values = new Map();
const listeners = new Map();
const memoryRoot = {
  localStorage: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
  },
  addEventListener(name, callback) { listeners.set(name, callback); }
};
memoryRoot.localStorage.setItem(
  "chappy_outer_attack_ticket_settlements_v1",
  JSON.stringify(rows)
);
assert.equal(gate.install(memoryRoot), true);
assert.equal(gate.install(memoryRoot), false, "判定イベントを二重装着しない");
assert.equal(gate.readDecision(memoryRoot).recommendedVariant, "cover");
assert.equal(typeof listeners.get("chappy:stats-requested"), "function");
listeners.get("chappy:stats-requested")();
assert.equal(gate.readDecision(memoryRoot).diagnostics.prospectiveForwardCount, 500);

const statsLoader = fs.readFileSync(
  path.join(rootDir, "js", "stats-runtime-loader.js"),
  "utf8"
);
const appLoader = fs.readFileSync(
  path.join(rootDir, "js", "app-runtime-loader.js"),
  "utf8"
);
const shadowIndex = statsLoader.indexOf('"js/outer-attack-ticket-shadow.js"');
const settlementIndex = statsLoader.indexOf('"js/outer-attack-ticket-settlement.js"');
const gateIndex = statsLoader.indexOf('"js/outer-attack-ticket-decision-gate.js"');
assert.ok(
  shadowIndex >= 0 && shadowIndex < settlementIndex && settlementIndex < gateIndex,
  "成績分析の任意読込でshadow→settlement→gateの順を固定する"
);
assert.equal(
  appLoader.includes("outer-attack-ticket-decision-gate.js"),
  false,
  "判定ゲートを予想開始の必須経路へ入れない"
);

console.log("outer attack ticket decision gate tests passed");
