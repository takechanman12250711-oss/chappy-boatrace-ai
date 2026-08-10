"use strict";

const assert = require("node:assert/strict");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const {
  buildReport,
  proposalFor
} = require("./build-scenario-ai-v6-learning-report");

function record(
  raceKey,
  jcd,
  place,
  scenarios,
  {
    selectedAt = "2026-08-01T00:00:00.000Z",
    inputSourceKind = "live-verification-evidence",
    candidateSetFingerprint = "none"
  } = {}
) {
  return {
    raceKey,
    date: raceKey.slice(0, 8),
    selectedAt,
    jcd,
    place,
    scenarioAiV6Shadow: {
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind
    },
    scenarioAiV6ShadowAb: { candidateSetFingerprint },
    scenarioAiV6Verification: {
      status: "verified",
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      inputSourceKind,
      scenarios
    }
  };
}

const scenarios = [];
for (let i = 0; i < 50; i += 1) {
  scenarios.push(record(
    `20260801-01-${i + 1}`,
    "01",
    "桐生",
    [
      {
        rank: 1,
        scenarioType: "escape",
        likelihood: 60,
        exact: i < 12,
        firstHit: i < 30,
        top2Hit: i < 35,
        winningMethodMatch: i < 32,
        breakReasons: i < 12 ? [] : ["想定頭1号艇が1着ではなかった"]
      }
    ]
  ));
}

const report = buildReport([{ date: "20260801", verificationPredictions: scenarios }]);
assert.equal(report.verifiedRaceCount, 50);
assert.equal(report.evaluatedScenarioCount, 50);
assert.equal(report.byScenarioType.length, 1);
assert.equal(report.byScenarioType[0].exactRate, 24);
assert.equal(report.byScenarioType[0].firstHitRate, 60);
assert.equal(report.byScenarioType[0].winningMethodMatchRate, 64);
assert.equal(report.proposals[0].action, "raise");
assert.equal(report.proposals[0].adjustment, 2);
assert.equal(report.usableForPrediction, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.proposalOnly, true);
assert.ok(report.breakReasonSummary[0].count > 0);

const activeVariant = record(
  "20260802-01-1",
  "01",
  "桐生",
  [{
    rank: 1,
    scenarioType: "escape",
    likelihood: 60,
    exact: false,
    firstHit: false,
    top2Hit: false,
    winningMethodMatch: false,
    breakReasons: ["評価中Bの結果"]
  }],
  {
    selectedAt: "2026-08-02T00:00:00.000Z",
    candidateSetFingerprint: "scenario-type:escape:-2"
  }
);
const otherSource = record(
  "20260731-01-1",
  "01",
  "桐生",
  scenarios[0].scenarioAiV6Verification.scenarios,
  {
    selectedAt: "2026-07-31T00:00:00.000Z",
    inputSourceKind: "stored-v5-pre-race"
  }
);
const isolated = buildReport([{
  date: "20260802",
  verificationPredictions: [...scenarios, activeVariant, otherSource]
}]);
assert.equal(isolated.verifiedRaceCount, 50, "候補評価中の結果を再学習へ混ぜない");
assert.equal(isolated.evaluatedScenarioCount, 50);
assert.equal(isolated.activeInputSourceKind, "live-verification-evidence");
assert.equal(isolated.excludedOtherInputSourceCount, 1);

assert.equal(proposalFor({ sampleCount: 10 }, 50).action, "collect");
assert.equal(proposalFor({ sampleCount: 50, exactRate: 5, firstHitRate: 20, winningMethodMatchRate: 30 }, 50).action, "lower");
assert.equal(proposalFor({ sampleCount: 50, exactRate: 15, firstHitRate: 40, winningMethodMatchRate: 50 }, 50).action, "maintain");

const empty = buildReport([]);
assert.equal(empty.verifiedRaceCount, 0);
assert.deepEqual(empty.byScenarioType, []);
assert.equal(empty.usableForPrediction, false);

console.log("展開AI v6学習レポートテスト成功");
