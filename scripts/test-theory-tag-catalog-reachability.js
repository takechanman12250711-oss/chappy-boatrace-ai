"use strict";

const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

function basePrediction() {
  return {
    flowPriority: { attackBoatNo: 4 },
    flowSupport: {
      attackBoatNo: 4,
      attackSTRank: 1,
      attackExhibitionRank: 1,
      dataCoverage: { st: 6, exhibition: 6 },
      confirms: [
        "4号艇がST・スリットで先行",
        "4号艇は展示・足の気配上位"
      ],
      alerts: []
    },
    venueWaterSupport: {
      venue: "多摩川",
      wind: 3,
      wave: 2,
      tide: "",
      confirms: ["風3m・波2cmの水面条件を補助評価"]
    },
    skillLocalSupport: {
      attackBoatNo: 4,
      boats: [{
        boatNo: 4,
        grade: "A1",
        nationalWinRate: 7.1,
        avgST: 0.14,
        firstRate: 32
      }],
      confirms: ["4号艇はA1級・全国勝率上位で技量を確認"]
    },
    frameRiseSinkSupport: {
      applied: true,
      approved: true,
      frameNo: 4,
      type: "rise",
      samples: 20,
      rate: 60,
      source: "approved-frame-rise-sink-test"
    },
    doubleTimeSupport: {
      approved: true,
      applied: true,
      isDouble: true,
      topBoat: 4,
      confidence: 80,
      exhibitionGap: 0.08,
      lapGap: 0.12,
      source: "approved-double-time-test"
    },
    aiCore: {
      formations: {
        evidence: {
          branches: [{
            id: "independent-course-4",
            kind: "independent-scenario",
            phaseEvidence: {
              kind: "alternate-head",
              attack: { boatNo: 4, course: 4, score: 88 }
            },
            evidenceChecks: []
          }]
        }
      },
      wallTheory: {
        attackerNo: 4,
        wallCandidateNo: 3,
        wallBoat: 3,
        state: "壁成立",
        score: 82,
        grade: "A"
      }
    },
    verificationEvidence: {
      tickets: [{
        ticket: "1-4-3",
        category: "本線",
        branchIds: ["independent-course-4"],
        theoryClaims: [
          {
            theoryKey: "flow",
            label: "展開理論",
            theoryVersion: "evaluated-scenarios-v1",
            formal: true,
            source: "structured-purchase-branch"
          },
          {
            theoryKey: "holdPickup",
            label: "残し・拾い理論",
            theoryVersion: "structured-role-evidence-v1",
            formal: true,
            source: "structured-role-claim"
          }
        ]
      }]
    }
  };
}

const normal = basePrediction();
normal.motorEngineSupport = {
  centerBoatNo: 4,
  newEngineMode: false,
  mode: "normal",
  centerMotorRate: 42.5,
  confirms: ["4号艇はモーター実績上位"]
};

const normalSnapshot = snapshot.build(normal, [
  { ticket: "1-4-3", category: "本線" }
]);

const normalKeys = new Set(normalSnapshot.theories.map(row => row.theoryKey));
[
  "flow",
  "holdPickup",
  "course",
  "stSlit",
  "exhibitionFoot",
  "localWater",
  "skill",
  "motor",
  "wallBoat",
  "frameRiseSink",
  "doubleTime"
].forEach(key => {
  assert.ok(normalKeys.has(key), `${key} が正式証拠から保存タグへ到達する`);
});

const newEngine = basePrediction();
newEngine.newEnvironmentTheory = {
  isActive: true,
  source: "ai-core-new-environment-theory-v1"
};
newEngine.aiCore = {
  newEnvironmentTheory:
    newEngine.newEnvironmentTheory,
  analyses: Array.from(
    { length: 6 },
    (_, index) => ({
      boatNo: index + 1,
      indexes: { total: 80 - index }
    })
  )
};
newEngine.motorEngineSupport = {
  centerBoatNo: 4,
  newEngineMode: true,
  mode: "new-engine",
  effectiveScoreContract: {
    version: "ai-core-effective-score-contract-v1",
    scope: "aiCore.analyses[].indexes.total",
    finalTotalCoefficients: {
      raceFlow: 0.25,
      courseIndex: 0.24,
      roleAttack: 0.11,
      st: 0.10,
      exhibition: 0.09,
      roleHold: 0.08,
      rolePickup: 0.03,
      local: 0.05,
      turn: 0.025,
      national: 0.02,
      motor: 0.005
    },
    newEngineAdjustments: {
      applied: true,
      modeSource:
        "ai-core-new-environment-theory-v1",
      motorIndexDeviationFrom50Multiplier: 0.45,
      raceFlowStThresholdInclusive: 72,
      raceFlowStBonus: 3,
      raceFlowTurnThresholdInclusive: 72,
      raceFlowTurnBonus: 3
    }
  },
  confirms: [
    "新エンジン期",
    "モーター実績の比重を下げ、展示・今節ST・技量を優先"
  ]
};

const newEngineSnapshot = snapshot.build(newEngine, [
  { ticket: "1-4-3", category: "本線" }
]);
const newEngineKeys = new Set(newEngineSnapshot.theories.map(row => row.theoryKey));
assert.ok(newEngineKeys.has("newEngine"), "新エンジン理論が正式証拠から保存タグへ到達する");
assert.equal(newEngineKeys.has("motor"), false, "新エンジン期に通常モーター理論を水増ししない");

const allKeys = new Set([...normalKeys, ...newEngineKeys]);
assert.equal(allKeys.size, 12, "正式証拠化対象12理論すべてに保存タグ到達経路がある");

assert.equal(normalSnapshot.usableForPrediction, false);
assert.equal(normalSnapshot.automaticApplication, false);
assert.equal(newEngineSnapshot.usableForPrediction, false);
assert.equal(newEngineSnapshot.automaticApplication, false);

console.log("12-theory tag reachability tests passed");
