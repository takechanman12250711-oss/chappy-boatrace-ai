"use strict";
const assert=require("node:assert/strict");const api=require("../js/theory-evidence-coverage-phase7");
const report=api.build({analysisInputContract:"official-pre-deadline-cohort-v1",byTheory:[
  {theoryKey:"race-flow",label:"展開理論",raceCount:457,useCount:26,evaluatedCount:26},
  {theoryKey:"remain-pickup",label:"残し・拾い理論",raceCount:457,useCount:31,evaluatedCount:31}
]});
assert.equal(report.theoryCount,12);
assert.equal(report.collectingCount,1);
assert.equal(report.readyCount,1);
assert.equal(report.missingEvidenceCount,10);
assert.equal(report.nextTheoryToInstrument,"course");
assert.equal(report.analysisInputContract,"official-pre-deadline-cohort-v1");
assert.equal(report.theories.find(row=>row.theoryKey==="race-flow").status,"collecting");
assert.equal(report.theories.find(row=>row.theoryKey==="remain-pickup").status,"ready-for-review");
assert.equal(report.automaticApplication,false);
assert.equal(report.usableForPrediction,false);
console.log("Phase7 theory evidence coverage: 合格");
