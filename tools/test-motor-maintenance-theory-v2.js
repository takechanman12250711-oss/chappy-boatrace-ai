"use strict";

const assert = require("assert");

global.window = {};
const motorApi = require("../js/motor-maintenance-insights.js");

let received = null;
window.ChappyAICore = {
  isNewEngineMode(data) {
    return Boolean(data?.isNewEngine);
  },
  buildPredictionData(data) {
    received = data;
    return { ok: true };
  },
  buildBoatAnalyses(data) {
    received = data;
    return [];
  }
};

function entries(overrides = {}) {
  return [1, 2, 3, 4, 5, 6].map((boatNo) => ({
    boatNo,
    averageSt: 0.13 + boatNo * 0.005,
    exhibitionTime: 6.75 + boatNo * 0.02,
    lapTime: 36.9 + boatNo * 0.04,
    exhibitionSt: 0.04 + boatNo * 0.01,
    currentResults: [1, 2, 3],
    thisTermSt: [0.12, 0.14],
    motorRate: boatNo === 1 ? 45 : 30,
    motor3Rate: boatNo === 1 ? 65 : 45,
    boatRate: 30,
    ...overrides
  }));
}

const source = { entries: entries() };
const originalJson = JSON.stringify(source);
const result = window.ChappyAICore.buildPredictionData(source);
assert.strictEqual(result.ok, true);
assert.strictEqual(JSON.stringify(source), originalJson, "元データを変更しない");
assert(result.motorMaintenanceTheoryV2.isFormal, "正式評価を返す");
assert(received.entries[0].motorMaintenanceTheoryV2.isFormal, "展示・今節根拠で正式評価");
assert.notStrictEqual(received.entries[0].motorRate, source.entries[0].motorRate, "既存motor入力を置換する");
assert.strictEqual(received.entries[0].motorMaintenanceTheoryV2.weightPolicy, "既存motor枠内・追加加点なし");

const newEngine = motorApi.enhanceData({ isNewEngine: true, entries: entries() }, window.ChappyAICore);
const normal = motorApi.enhanceData({ entries: entries() }, window.ChappyAICore);
assert(
  newEngine.theory.rows[0].components.motorRecord < normal.theory.rows[0].components.motorRecord,
  "新エンジン期はモーター実績を弱める"
);

const noEvidenceEntries = entries({
  exhibitionTime: null,
  lapTime: null,
  exhibitionSt: null,
  currentResults: [],
  thisTermSt: []
});
const noEvidence = motorApi.enhanceData({ entries: noEvidenceEntries }, window.ChappyAICore);
assert.strictEqual(noEvidence.theory.rows[0].isFormal, false, "実際の足・今節根拠なしは反映しない");
assert.strictEqual(noEvidence.data.entries[0].motorRate, noEvidenceEntries[0].motorRate, "暫定時は元モーター値を維持");

const exchangedWeak = motorApi.enhanceData({
  entries: entries({
    partsExchange: "リング交換",
    exhibitionTime: 7.20,
    lapTime: 39.0,
    currentResults: [5, 6, 6],
    thisTermSt: [0.20, 0.28]
  })
}, window.ChappyAICore);
assert.strictEqual(exchangedWeak.theory.rows[0].components.maintenanceEffect, 0, "交換した事実だけでは加点しない");

assert.strictEqual(window.ChappyAICore.__motorMaintenanceTheoryV2Installed, true, "1回だけ接続する");
console.log("Motor/Maintenance Theory V2 tests passed");
