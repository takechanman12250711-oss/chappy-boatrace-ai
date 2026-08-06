"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const prediction = {
  flowPriority: { attackBoatNo: 4 },
  flowSupport: {
    attackBoatNo: 4,
    attackSTRank: 1,
    dataCoverage: { st: 6, exhibition: 6 },
    confirms: ["4号艇が3号艇よりSTで0.10以上先行"],
    alerts: []
  },
  aiCore: { formations: { evidence: { branches: [
    { id: "independent-course-1", kind: "independent-scenario", phaseEvidence: { kind: "alternate-head", attack: { boatNo: 4, course: 4, score: 88 } }, evidenceChecks: [] },
    { id: "canonical-no-course", kind: "canonical-formation", phaseEvidence: { kind: "base-formation" }, evidenceChecks: [] }
  ] } } },
  verificationEvidence: { tickets: [
    { ticket: "1-4-3", category: "本線", branchIds: ["independent-course-1"], theoryClaims: [
      { theoryKey: "wall-boat", label: "壁艇理論", version: "1", formal: true, source: "ai-core" },
      { theoryKey: "hold-pickup", label: "残し・拾い理論", version: "1", formal: true, source: "practical-selection" }
    ] },
    { ticket: "1-2-3", category: "押さえ", branchIds: ["canonical-no-course"], theoryClaims: [
      { theoryKey: "hold-pickup", label: "残し・拾い理論", version: "1", formal: true, source: "practical-selection" }
    ] }
  ] }
};

const result = snapshot.build(prediction, [
  { ticket: "1-4-3", category: "本線" },
  { ticket: "1-2-3", category: "押さえ" }
]);
assert.equal(result.status, "tracked");
const course = result.theories.find(row => row.theoryKey === "course");
assert.ok(course);
assert.deepEqual(course.tickets, ["1-4-3"]);
const stSlit = result.theories.find(row => row.theoryKey === "stSlit");
assert.ok(stSlit, "ST・スリットが中心攻め艇を明示補正した場合だけ正式タグ化する");
assert.equal(stSlit.ticketCount, 1);
assert.deepEqual(stSlit.tickets, ["1-4-3"]);
assert.deepEqual(stSlit.sources, ["flow-support-st-slit"]);

const insufficient = snapshot.stSlitEvidence({
  flowSupport: { attackBoatNo: 4, attackSTRank: 1, dataCoverage: { st: 3 }, confirms: ["4号艇はスリット上位"] }
});
assert.equal(insufficient.formal, false, "ST有効艇が4艇未満なら正式証拠にしない");
assert.equal(snapshot.stSlitClaimForTicket(prediction, "1-2-3"), null, "中心攻め艇を含まない買い目へST理論を水増し帰属しない");
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
console.log("theory tag snapshot tests passed");
