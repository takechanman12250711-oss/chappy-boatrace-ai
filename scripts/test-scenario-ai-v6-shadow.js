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

assert.equal(report.version, "6.1.0-shadow");
assert.equal(report.logicFingerprint, v6.LOGIC_FINGERPRINT);
assert.equal(report.status, "shadow-ready");
assert.equal(report.scenarios.length, 3);
assert.equal(report.totalLikelihood, 100);
assert.equal(report.mainScenario.representativeTicket, "1-2-4");
assert.equal(report.scenarios[1].representativeTicket, "2-1-4");
assert.equal(report.scenarios[2].representativeTicket, "3-4-1");
assert.equal(report.usableForPrediction, false);
assert.equal(report.automaticApplication, false);

const practicalReport = v6.build({
  verificationEvidence: {
    mainScenario: {
      type: "threeAttack",
      label: "3コース攻め",
      headBoatNo: 3,
      attackerBoatNo: 3
    },
    tickets: [
      { ticket: "3-1-5", categories: ["本線"] },
      { ticket: "1-2-4", categories: ["押さえ"] }
    ]
  },
  aiCore: {
    raceScenarios: {
      scenarios: [
        { type: "threeAttack", label: "3コース攻め", score: 64, attacker: 3 },
        { type: "escape", label: "1号艇逃げ", score: 22, attacker: 1 },
        { type: "fourAttack", label: "4カド攻め", score: 14, attackerBoatNo: 4 }
      ]
    }
  },
  marks: { main: { boatNo: 1 }, rival: { boatNo: 2 }, third: { boatNo: 4 } }
});
assert.equal(practicalReport.source, "race-scenarios");
assert.equal(practicalReport.scenarios.length, 3);
assert.equal(practicalReport.mainScenario.keyBoat, 3);
assert.equal(practicalReport.mainScenario.representativeTicket, "3-1-5");
assert.equal(Number(practicalReport.mainScenario.representativeTicket.split("-")[0]), practicalReport.mainScenario.keyBoat);

const fourAttack = v6.build({ verificationEvidence: {
  scenarios: [
    { type: "fourAttack", label: "4カド攻め", score: 80, headBoatNo: 4 },
    { type: "escape", label: "1号艇逃げ", score: 20, headBoatNo: 1 }
  ],
  tickets: [{ ticket: "4-1-6" }, { ticket: "1-2-3" }]
}});
assert.equal(fourAttack.mainScenario.keyBoat, 4);
assert.equal(fourAttack.mainScenario.representativeTicket, "4-1-6");

const unmatched = v6.build({ verificationEvidence: {
  mainScenario: {
    type: "threeAttack",
    label: "3コース攻め",
    headBoatNo: 3,
    representativeTicket: "3-1-5"
  },
  tickets: [{ ticket: "1-2-4" }]
}});
assert.equal(unmatched.mainScenario.keyBoat, 3);
assert.equal(unmatched.mainScenario.representativeTicket, "");

const zeroHead = v6.build({ verificationEvidence: {
  mainScenario: { type: "threeAttack", label: "3コース攻め", headBoatNo: 0, attackerBoatNo: 3 },
  tickets: [{ ticket: "3-1-5" }]
}});
assert.equal(zeroHead.mainScenario.keyBoat, 3);
assert.equal(zeroHead.mainScenario.representativeTicket, "3-1-5");

const emptyRichList = v6.build({ aiCore: { raceScenarios: {
  scenarios: [],
  mainScenario: { type: "escape", label: "1号艇逃げ", score: 60, attacker: 1 },
  subScenario: { type: "sashi", label: "2コース差し", score: 40, attacker: 2 }
}}});
assert.equal(emptyRichList.scenarios.length, 2);
assert.equal(emptyRichList.source, "race-scenarios");

const perScenarioFallback = v6.build({
  verificationEvidence: {
    scenarios: [
      { type: "escape", label: "1号艇逃げ", score: 60 },
      { type: "sashi", label: "2コース差し", score: 40 }
    ],
    tickets: [
      { ticket: "1-2-4" },
      { ticket: "2-1-4" },
      { ticket: "3-1-2" }
    ]
  },
  marks: {
    attacker: { boatNo: 3 },
    main: { boatNo: 1 },
    rival: { boatNo: 2 },
    third: { boatNo: 4 }
  }
});
assert.equal(perScenarioFallback.scenarios[0].keyBoat, 1);
assert.deepEqual(perScenarioFallback.scenarios[0].finishOrder, [1, 2, 4]);
assert.equal(perScenarioFallback.scenarios[0].representativeTicket, "1-2-4");
assert.equal(perScenarioFallback.scenarios[1].keyBoat, 2);
assert.deepEqual(perScenarioFallback.scenarios[1].finishOrder, [2, 1, 4]);
assert.equal(perScenarioFallback.scenarios[1].representativeTicket, "2-1-4");

const standardFour = v6.build({ verificationEvidence: {
  scenarios: [
    { type: "canonical-evaluated-scenario", label: "正式評価", score: 100 },
    { type: "escape", label: "1号艇逃げ", score: 70 },
    { type: "threeAttack", label: "3攻め", score: 50 },
    { type: "fourAttack", label: "4攻め", score: 40 },
    { type: "sashi", label: "2差し", score: 30 }
  ]
}});
assert.equal(standardFour.scenarios.length, 4);
assert.deepEqual(
  new Set(standardFour.scenarios.map(row => row.scenarioType)),
  new Set(["escape", "sashi", "threeAttack", "fourAttack"])
);

const empty = v6.build({});
assert.equal(empty.status, "insufficient-evidence");
assert.deepEqual(empty.scenarios, []);
console.log("scenario AI v6 shadow tests passed");
