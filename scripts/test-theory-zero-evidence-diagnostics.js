"use strict";

const assert = require("node:assert/strict");
const diagnostics = require("./theory-zero-evidence-diagnostics");

const record = {
  raceKey: "20260808-01-1",
  result: { settled: true, resultTicket: "1-2-3" },
  theoryEvaluationSnapshot: {
    evaluations: [
      { theoryKey: "start", status: "evaluated", used: true, matched: true, tickets: ["1-2-3"] }
    ]
  },
  theoryTagSnapshot: {
    theories: [
      { theoryKey: "stSlit", label: "ST・スリット理論", sources: ["flow-support-st-slit"], tickets: ["1-2-3"] }
    ],
    evidenceDiagnostics: {
      schemaVersion: 1,
      rows: [
        { theoryKey: "start", supportPresent: true, formal: true, missingReasons: [] },
        { theoryKey: "skill", supportPresent: false, formal: false, missingReasons: ["support-missing"] },
        { theoryKey: "frame-rise-fall", supportPresent: false, formal: false, missingReasons: ["support-missing"] },
        { theoryKey: "double-time", supportPresent: false, formal: false, missingReasons: ["support-missing"] },
        { theoryKey: "new-engine", supportPresent: false, formal: false, missingReasons: ["support-missing"] }
      ]
    }
  }
};

const rows = diagnostics.build([record]);
const start = rows.find(row => row.theoryKey === "start");
assert.equal(start.generationDiagnosticCount, 1);
assert.equal(start.supportPresentCount, 1);
assert.equal(start.formalEvidenceCount, 1);
assert.equal(start.catalogTaggedCount, 1);
assert.equal(start.diagnosis, "tracking-active");
const skill = rows.find(row => row.theoryKey === "skill");
assert.equal(skill.generationDiagnosticCount, 1);
assert.equal(skill.supportPresentCount, 0);
assert.equal(skill.formalEvidenceCount, 0);
assert.deepEqual(skill.missingReasonSummary, [{ reason: "support-missing", count: 1 }]);
assert.equal(skill.diagnosis, "support-not-generated");

const staleRecord = structuredClone(record);
delete staleRecord.theoryEvaluationSnapshot;
const staleRows = diagnostics.build([staleRecord]);
assert.equal(staleRows.find(row => row.theoryKey === "start").diagnosis, "stored-evaluation-stale");

const oldRecord = { raceKey: "old", result: { settled: true }, theoryTagSnapshot: { theories: [] } };
const oldRows = diagnostics.build([oldRecord]);
assert.equal(oldRows.find(row => row.theoryKey === "start").diagnosis, "awaiting-generation-diagnostics");
console.log("zero-evidence diagnostics tests passed");
