"use strict";

const assert = require("node:assert/strict");
const diagnostics = require("./theory-zero-evidence-diagnostics");

const record = {
  raceKey: "20260808-01-1",
  result: { settled: true },
  prediction: {
    flowSupport: {
      attackBoatNo: 1,
      dataCoverage: { st: 6 },
      attackSTRank: 1,
      confirms: ["ST上位でスリット優勢"]
    }
  },
  theoryTagSnapshot: {
    theories: [
      { theoryKey: "stSlit", label: "ST・スリット理論", sources: ["flow-support-st-slit"] }
    ]
  }
};

const rows = diagnostics.build([record]);
const start = rows.find(row => row.theoryKey === "start");
assert.equal(start.supportPresentCount, 1);
assert.equal(start.formalEvidenceCount, 1);
assert.equal(start.taggedCount, 1);
assert.equal(start.diagnosis, "tracking-active");
const skill = rows.find(row => row.theoryKey === "skill");
assert.equal(skill.supportPresentCount, 0);
assert.equal(skill.diagnosis, "support-not-generated");
console.log("zero-evidence diagnostics tests passed");
