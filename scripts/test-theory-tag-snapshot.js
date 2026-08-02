"use strict";

const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const prediction = {
  verificationEvidence: {
    tickets: [
      {
        ticket: "1-4-3",
        category: "本線",
        theoryClaims: [
          { theoryKey: "wall-boat", label: "壁艇理論", version: "1", formal: true, source: "ai-core" },
          { theoryKey: "hold-pickup", label: "残し・拾い理論", version: "1", formal: true, source: "practical-selection" }
        ]
      },
      {
        ticket: "1-2-4",
        category: "押さえ",
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
assert.equal(result.theoryCount, 2);
const hold = result.theories.find(row => row.theoryKey === "hold-pickup");
assert.equal(hold.ticketCount, 2);
assert.equal(hold.mainTicketCount, 1);
assert.deepEqual(hold.tickets, ["1-4-3", "1-2-4"]);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);

console.log("theory tag snapshot tests passed");
