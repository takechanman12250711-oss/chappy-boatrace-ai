"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const normal = {
  flowPriority: { attackBoatNo: 4 },
  motorEngineSupport: {
    mode: "normal",
    newEngineMode: false,
    centerBoatNo: 4,
    centerMotorRate: 48.7,
    confirmations: ["4号艇はモーター実績上位で展開を補助"],
    cautions: []
  }
};
assert.equal(snapshot.motorEvidence(normal).formal, true);
assert.ok(snapshot.motorClaimForTicket(normal, "1-4-3"));
assert.equal(snapshot.motorClaimForTicket(normal, "1-2-3"), null);

const newEngine = {
  flowPriority: { attackBoatNo: 4 },
  motorEngineSupport: {
    mode: "new-engine",
    newEngineMode: true,
    centerBoatNo: 4,
    centerMotorRate: 48.7,
    confirmations: ["新エンジン期は展示・今節ST・技量を優先"],
    cautions: ["モーター実績の比重を下げて過信しない"]
  }
};
assert.equal(snapshot.motorEvidence(newEngine).formal, false, "新エンジン期は通常モーター理論へ帰属しない");
assert.equal(snapshot.motorClaimForTicket(newEngine, "1-4-3"), null);

const neutral = {
  flowPriority: { attackBoatNo: 4 },
  motorEngineSupport: {
    mode: "normal",
    newEngineMode: false,
    centerBoatNo: 4,
    centerMotorRate: 40,
    confirmations: [],
    cautions: []
  }
};
assert.equal(snapshot.motorEvidence(neutral).formal, false, "モーター数値があるだけでは正式証拠にしない");
console.log("motor formal evidence tests passed");
