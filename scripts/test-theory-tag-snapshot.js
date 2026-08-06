"use strict";

const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const prediction = {
  aiCore: {
    formations: {
      evidence: {
        branches: [
          {
            id: "independent-course-1",
            kind: "independent-scenario",
            phaseEvidence: {
              kind: "alternate-head",
              attack: { boatNo: 4, course: 4, score: 88 }
            },
            evidenceChecks: []
          },
          {
            id: "canonical-no-course",
            kind: "canonical-formation",
            phaseEvidence: { kind: "base-formation" },
            evidenceChecks: []
          }
        ]
      }
    }
  },
  verificationEvidence: {
    tickets: [
      {
        ticket: "1-4-3",
        category: "本線",
        branchIds: ["independent-course-1"],
        theoryClaims: [
          { theoryKey: "wall-boat", label: "壁艇理論", version: "1", formal: true, source: "ai-core" },
          { theoryKey: "hold-pickup", label: "残し・拾い理論", version: "1", formal: true, source: "practical-selection" }
        ]
      },
      {
        ticket: "1-2-4",
        category: "押さえ",
        branchIds: ["canonical-no-course"],
        theoryClaims: [
          { theoryKey: "hold-pickup", label: "残し・拾い理論", version: "1", formal: true, source: "practical-selection" }
        ]
      }
    ]
  }
};

const result = snapshot.build(prediction, [
  { ticket: "1-4-3", category: "本線" },
  { ticket: "1-2-4", category: "押さえ" }
]);

assert.equal(result.status, "tracked");
assert.equal(result.theoryCount, 3);
const hold = result.theories.find(row => row.theoryKey === "hold-pickup");
assert.equal(hold.ticketCount, 2);
assert.equal(hold.mainTicketCount, 1);
assert.deepEqual(hold.tickets, ["1-4-3", "1-2-4"]);

const course = result.theories.find(row => row.theoryKey === "course");
assert.ok(course, "コース整合を購入判定へ使った独立枝だけ正式タグ化する");
assert.equal(course.ticketCount, 1);
assert.equal(course.mainTicketCount, 1);
assert.deepEqual(course.tickets, ["1-4-3"]);
assert.equal(course.formal, true);
assert.deepEqual(course.sources, ["structured-course-validation"]);

assert.equal(
  snapshot.branchUsesCourseEvidence({
    kind: "canonical-formation",
    phaseEvidence: { kind: "base-formation" }
  }),
  false,
  "コース情報を明示的に購入判定へ使っていない通常枝は誤タグ化しない"
);
assert.equal(
  snapshot.branchUsesCourseEvidence({
    kind: "independent-scenario",
    phaseEvidence: {
      kind: "hold-continuation",
      target: { boatNo: 4, course: 4 }
    },
    evidenceChecks: []
  }),
  true
);

assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);

console.log("theory tag snapshot tests passed");
// CI verification only
