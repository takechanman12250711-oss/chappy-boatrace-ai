"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const prediction = {
  flowPriority: { attackBoatNo: 4 },
  motorEngineSupport: {
    mode: "new-engine",
    newEngineMode: true,
    centerBoatNo: 4,
    weights: {
      st: 0.22,
      exhibition: 0.23,
      motor: 0.05,
      local: 0.14,
      skill: 0.10,
      attack: 0.14,
      raceFlow: 0.08,
      turn: 0.04
    },
    confirmations: [
      "新エンジン期は展示・今節ST・技量を優先",
      "4号艇は展示気配を最終確認"
    ],
    cautions: ["モーター実績の比重を下げて過信しない"]
  }
};

const evidence = snapshot.newEngineEvidence(prediction);
assert.equal(evidence.formal, true, "新エンジンモード＋正式重み切替を証拠化する");
const claim = snapshot.newEngineClaimForTicket(prediction, "1-4-3");
assert.ok(claim);
assert.equal(claim.theoryKey, "newEngine");
assert.equal(snapshot.newEngineClaimForTicket(prediction, "1-2-3"), null, "中心艇を含まない買い目へ水増し帰属しない");

const normal = snapshot.newEngineEvidence({
  flowPriority: { attackBoatNo: 4 },
  motorEngineSupport: {
    mode: "normal",
    newEngineMode: false,
    centerBoatNo: 4,
    weights: { st: 0.18, exhibition: 0.18, motor: 0.12 },
    confirmations: ["4号艇はモーター実績上位で展開を補助"]
  }
});
assert.equal(normal.formal, false, "通常エンジン期を新エンジン理論へ帰属しない");

const wrongWeights = snapshot.newEngineEvidence({
  ...prediction,
  motorEngineSupport: {
    ...prediction.motorEngineSupport,
    weights: { ...prediction.motorEngineSupport.weights, motor: 0.12 }
  }
});
assert.equal(wrongWeights.formal, false, "新エンジン用の重み切替が実際に適用されていなければ正式証拠にしない");

console.log("new engine formal evidence tests passed");
