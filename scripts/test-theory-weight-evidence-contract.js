"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const aiCoreSource = fs.readFileSync(path.join(root, "js/ai-core.js"), "utf8");
const motorSupportSource = fs.readFileSync(path.join(root, "js/prediction-motor-engine-support.js"), "utf8");

const expectedFinalTotalCoefficients = {
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
};
const expectedNewEngineAdjustments = {
  motorIndexDeviationFrom50Multiplier: 0.45,
  raceFlowStThresholdInclusive: 72,
  raceFlowStBonus: 3,
  raceFlowTurnThresholdInclusive: 72,
  raceFlowTurnBonus: 3
};
const newEnvironmentTheorySource = "ai-core-new-environment-theory-v1";
const plain = value => JSON.parse(JSON.stringify(value));

function loadMotorSupport() {
  const window = { addEventListener() {} };
  const document = { addEventListener() {} };
  vm.runInNewContext(motorSupportSource, { window, document }, {
    filename: "prediction-motor-engine-support.js"
  });
  return window.ChappyPredictionMotorEngineSupport;
}

function loadAiCore() {
  const window = {};
  const silentConsole = { log() {}, error() {}, warn() {} };
  vm.runInNewContext(aiCoreSource, { window, console: silentConsole }, {
    filename: "ai-core.js"
  });
  return window.ChappyAICore;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}

function coefficientFrom(block, expression) {
  const match = block.match(
    new RegExp(`${escapeRegExp(expression)}\\s*\\*\\s*([0-9.]+)`)
  );
  assert.ok(match, `最終式から ${expression} の係数を取得できる`);
  return Number(match[1]);
}

function actualFinalTotalCoefficients() {
  const match = aiCoreSource.match(
    /indexes\.total\s*=\s*clamp\(\s*round\(([\s\S]*?)\)\s*,\s*INDEX_LIMIT\.min\s*,\s*INDEX_LIMIT\.max\s*\);/
  );
  assert.ok(match, "AIコアの返却用最終総合式を取得できる");
  const block = match[1];
  return {
    raceFlow: coefficientFrom(block, "indexes.raceFlow"),
    courseIndex: coefficientFrom(block, "courseIndex"),
    roleAttack: coefficientFrom(block, "roleScores.attack"),
    st: coefficientFrom(block, "indexes.st"),
    exhibition: coefficientFrom(block, "indexes.exhibition"),
    roleHold: coefficientFrom(block, "roleScores.hold"),
    rolePickup: coefficientFrom(block, "roleScores.pickup"),
    local: coefficientFrom(block, "indexes.local"),
    turn: coefficientFrom(block, "indexes.turn"),
    national: coefficientFrom(block, "indexes.national"),
    motor: coefficientFrom(block, "indexes.motor")
  };
}

function actualNewEngineAdjustments() {
  const motorFunction = aiCoreSource.match(
    /function calcMotorIndex\([\s\S]*?(?=\n\s*function calcLocalIndex\()/
  )?.[0] || "";
  const flowFunction = aiCoreSource.match(
    /function calcRaceFlowIndex\([\s\S]*?(?=\n\s*function calcTotalIndex\()/
  )?.[0] || "";
  const motorGuard = motorFunction.match(
    /if\s*\(isNewEngineMode\(data\)\)\s*\{([\s\S]*?)\}/
  );
  const flowGuard = flowFunction.match(
    /if\s*\(isNewEngineMode\(data\)\)\s*\{([\s\S]*?)\}/
  );
  assert.ok(motorGuard && flowGuard, "新エンジン補正が実計算モード内にある");
  const motor = motorGuard[1].match(
    /score\s*=\s*50\s*\+\s*\(score\s*-\s*50\)\s*\*\s*([0-9.]+)/
  );
  const st = flowGuard[1].match(
    /if\s*\(stIndex\s*>=\s*([0-9.]+)\)\s*score\s*\+=\s*([0-9.]+)/
  );
  const turn = flowGuard[1].match(
    /if\s*\(turnIndex\s*>=\s*([0-9.]+)\)\s*score\s*\+=\s*([0-9.]+)/
  );
  assert.ok(motor && st && turn, "AIコアの新エンジン実補正を取得できる");
  return {
    motorIndexDeviationFrom50Multiplier: Number(motor[1]),
    raceFlowStThresholdInclusive: Number(st[1]),
    raceFlowStBonus: Number(st[2]),
    raceFlowTurnThresholdInclusive: Number(turn[1]),
    raceFlowTurnBonus: Number(turn[2])
  };
}

function scoredAiCore(theory) {
  return {
    newEnvironmentTheory: theory,
    analyses: Array.from({ length: 6 }, (_, index) => ({
      boatNo: index + 1,
      indexes: { total: 80 - index }
    }))
  };
}

const supportApi = loadMotorSupport();
const activeTheory = { isActive: true, source: newEnvironmentTheorySource };
const stableTheory = { isActive: false, source: newEnvironmentTheorySource };
const entries = Array.from({ length: 6 }, (_, index) => ({
  boatNo: index + 1,
  motor2Rate: 40 - index,
  exhibitionTime: 6.70 + index * 0.01,
  currentST: 0.12 + index * 0.01,
  class: index === 3 ? "A1" : "B1"
}));

const activePrediction = {
  flowPriority: { attackBoatNo: 4 },
  newEnvironmentTheory: activeTheory,
  aiCore: scoredAiCore(activeTheory)
};
const activeSupport = supportApi.build(activePrediction, { entries });
assert.equal(activeSupport.newEngineMode, true, "AIコアの実適用モードを新エンジン期の正本にする");
assert.equal(activeSupport.mode, "new-engine");
assert.equal("weights" in activeSupport, false, "適用されない旧weight profileを新規証拠へ記録しない");
assert.equal(activeSupport.effectiveScoreContract.version, "ai-core-effective-score-contract-v1");
assert.equal(activeSupport.effectiveScoreContract.scope, "aiCore.analyses[].indexes.total");
assert.deepEqual(
  plain(activeSupport.effectiveScoreContract.finalTotalCoefficients),
  expectedFinalTotalCoefficients
);
assert.deepEqual(
  Object.fromEntries(Object.keys(expectedNewEngineAdjustments).map(key => [
    key,
    activeSupport.effectiveScoreContract.newEngineAdjustments[key]
  ])),
  expectedNewEngineAdjustments
);
assert.equal(activeSupport.effectiveScoreContract.newEngineAdjustments.applied, true);
assert.equal(
  activeSupport.effectiveScoreContract.newEngineAdjustments.modeSource,
  newEnvironmentTheorySource
);

const stableSupport = supportApi.build({
  flowPriority: { attackBoatNo: 4 },
  newEnvironmentTheory: stableTheory,
  aiCore: scoredAiCore(stableTheory)
}, {
  entries,
  title: "新エンジン導入"
});
assert.equal(stableSupport.newEngineMode, false, "文言よりAIコアの安定期判定を優先する");
assert.equal(stableSupport.effectiveScoreContract.newEngineAdjustments.applied, false);

const topLevelOnlySupport = supportApi.build({
  flowPriority: { attackBoatNo: 4 },
  newEnvironmentTheory: activeTheory
}, { entries });
assert.equal(topLevelOnlySupport.newEngineMode, true, "トップレベル互換モードは表示用に維持する");
assert.equal(
  topLevelOnlySupport.effectiveScoreContract.newEngineAdjustments.applied,
  false,
  "AIコア実採点なしの互換モードを正式な適用済み証拠にしない"
);

const invalidAiCore = scoredAiCore(activeTheory);
invalidAiCore.analyses[5].indexes.total = null;
const invalidScoreSupport = supportApi.build({
  flowPriority: { attackBoatNo: 4 },
  aiCore: invalidAiCore
}, { entries });
assert.equal(
  invalidScoreSupport.effectiveScoreContract.newEngineAdjustments.applied,
  false,
  "有限な6艇totalがなければ適用済み証拠にしない"
);

const canonicalStableSupport = supportApi.build({
  flowPriority: { attackBoatNo: 4 },
  newEnvironmentTheory: activeTheory,
  aiCore: scoredAiCore(stableTheory)
}, {
  entries,
  title: "新エンジン導入"
});
assert.equal(
  canonicalStableSupport.newEngineMode,
  false,
  "互換フィールドと矛盾した場合はcanonical AIコアを優先する"
);

const unverifiedSupport = supportApi.build(
  { flowPriority: { attackBoatNo: 4 } },
  { entries, title: "新エンジン導入" }
);
assert.equal(unverifiedSupport.newEngineMode, true, "旧表示用の文言fallbackは維持する");
assert.equal(
  unverifiedSupport.effectiveScoreContract.newEngineAdjustments.applied,
  false,
  "AIコア未確認のfallbackを適用済み証拠にしない"
);

const sourceCoefficients = actualFinalTotalCoefficients();
assert.deepEqual(sourceCoefficients, expectedFinalTotalCoefficients);
assert.deepEqual(
  plain(activeSupport.effectiveScoreContract.finalTotalCoefficients),
  sourceCoefficients
);
assert.ok(
  Math.abs(Object.values(sourceCoefficients).reduce((sum, value) => sum + value, 0) - 1) < 1e-12,
  "最終総合係数の合計は1である"
);

const sourceAdjustments = actualNewEngineAdjustments();
assert.deepEqual(sourceAdjustments, expectedNewEngineAdjustments);
assert.deepEqual(
  Object.fromEntries(Object.keys(sourceAdjustments).map(key => [
    key,
    activeSupport.effectiveScoreContract.newEngineAdjustments[key]
  ])),
  sourceAdjustments
);

const aiCore = loadAiCore();
const motorFixture = { motorRate: 50, motor3Rate: 45, boat2Rate: 55 };
const stableMotor = aiCore.calcMotorIndex(
  motorFixture,
  { venueName: "大村", date: "20260101" }
);
const activeMotor = aiCore.calcMotorIndex(
  motorFixture,
  { venueName: "大村", date: "20250601" }
);
assert.equal(stableMotor, 70);
assert.equal(activeMotor, 59);
assert.equal(
  (activeMotor - 50) / (stableMotor - 50),
  0.45,
  "実行時もモーター指数の50点からの偏差を45%へ圧縮する"
);

function raceFlowDifference(target) {
  const flowEntries = Array.from({ length: 6 }, (_, index) => ({
    boatNo: index + 1,
    averageSt: 0.20,
    className: "B2",
    thisTermResults: []
  }));
  flowEntries[5] = { boatNo: 6, ...target };
  const stableData = {
    venueName: "大村",
    date: "20260101",
    entries: flowEntries
  };
  const activeData = { ...stableData, date: "20250601" };
  return (
    aiCore.calcRaceFlowIndex(
      flowEntries[5],
      flowEntries,
      aiCore.getVenueFeature(activeData),
      activeData
    ) -
    aiCore.calcRaceFlowIndex(
      flowEntries[5],
      flowEntries,
      aiCore.getVenueFeature(stableData),
      stableData
    )
  );
}

assert.equal(
  raceFlowDifference({ averageSt: 0.10, className: "B2", thisTermResults: [] }),
  3,
  "新エンジン期だけST閾値加点を適用する"
);
assert.equal(
  raceFlowDifference({
    averageSt: 0.28,
    className: "A1",
    thisTermResults: [1, 1, 1]
  }),
  3,
  "新エンジン期だけターン閾値加点を適用する"
);
assert.equal(
  raceFlowDifference({
    averageSt: 0.10,
    className: "A1",
    thisTermResults: [1, 1, 1]
  }),
  6,
  "ST・ターン両条件成立時だけ新エンジン期に合計6点を適用する"
);

const unchangedPrediction = {
  flowPriority: { attackBoatNo: 4, confirmations: ["展開確認"], cautions: [] },
  newEnvironmentTheory: activeTheory,
  aiCore: scoredAiCore(activeTheory),
  ranking: [{ boatNo: 4, score: 88 }],
  mainSheet: { honmei: { boatNo: 4 }, tickets: ["4-1-2"] },
  formations: { main: ["4-1-2"] },
  aiTicketList: ["4-1-2"],
  practicalSelection: { tickets: [{ ticket: "4-1-2" }] }
};
const beforeDecision = {
  ranking: unchangedPrediction.ranking,
  mainSheet: unchangedPrediction.mainSheet,
  formations: unchangedPrediction.formations,
  aiTicketList: unchangedPrediction.aiTicketList,
  practicalSelection: unchangedPrediction.practicalSelection
};
const enhanced = supportApi.enhance(unchangedPrediction, { entries });
assert.deepEqual({
  ranking: enhanced.ranking,
  mainSheet: enhanced.mainSheet,
  formations: enhanced.formations,
  aiTicketList: enhanced.aiTicketList,
  practicalSelection: enhanced.practicalSelection
}, beforeDecision, "証拠付与で順位・印・買い目・実戦厳選を変更しない");

console.log("theory weight evidence contract tests passed");
