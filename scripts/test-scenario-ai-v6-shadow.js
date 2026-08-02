"use strict";
const assert = require("node:assert/strict");
const v6 = require("../js/scenario-ai-v6-shadow");

const report = v6.build({ verificationEvidence: {
  scenarios: [
    { type: "escape", label: "1逃げ→2残し→4追走", score: 62, attacker: 1 },
    { type: "sashi", label: "2差し→1残し→4追走", score: 24, attacker: 2 },
    { type: "makuri", label: "3攻め→4展開突き", score: 14, attacker: 3, blockedBoats: [2] }
  ],
  marks: { rival: { boatNo: 2 }, third: { boatNo: 4 } }
}});

assert.equal(report.version, "6.0.0-shadow");
assert.equal(report.status, "shadow-ready");
assert.equal(report.scenarios.length, 3);
assert.equal(report.totalLikelihood, 100);
assert.equal(report.mainScenario.representativeTicket, "1-2-4");
assert.equal(report.scenarios[1].representativeTicket, "2-1-4");
assert.equal(report.scenarios[2].representativeTicket, "3-4-1");
assert.equal(report.usableForPrediction, false);
assert.equal(report.automaticApplication, false);

const empty = v6.build({});
assert.equal(empty.status, "insufficient-evidence");
assert.deepEqual(empty.scenarios, []);
console.log("scenario AI v6 shadow tests passed");
