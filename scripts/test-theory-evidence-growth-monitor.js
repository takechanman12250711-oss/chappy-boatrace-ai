"use strict";
const assert=require("node:assert/strict");
const monitor=require("../js/theory-evidence-growth-monitor");

const baseline={theories:[
  {theoryKey:"race-flow",label:"展開",raceCount:457,evaluatedCount:26},
  {theoryKey:"course",label:"コース",raceCount:457,evaluatedCount:0}
]};
let report=monitor.build(baseline,{});
assert.equal(report.newRaceCount,0);
assert.equal(report.theories.find(r=>r.theoryKey==="race-flow").previousEvaluatedCount,26);
assert.equal(report.theories.find(r=>r.theoryKey==="race-flow").growth,0);
assert.equal(report.status,"healthy");

report=monitor.build({
  analysisInputContract:"official-pre-deadline-cohort-v1",
  theories:[
    {theoryKey:"course",label:"コース",raceCount:1009,evaluatedCount:504}
  ]
},{
  currentRaceCount:1014,
  theories:[
    {theoryKey:"course",label:"コース",raceCount:1014,evaluatedCount:505}
  ]
});
assert.equal(report.cohortReset,true);
assert.equal(report.cohortResetReason,"analysis-input-contract-changed");
assert.equal(report.baselineRaceCount,1009);
assert.equal(report.currentRaceCount,1009);
assert.equal(report.newRaceCount,0);
assert.equal(report.theories[0].previousEvaluatedCount,504);
assert.equal(report.theories[0].growth,0);
assert.equal(report.status,"healthy");

const current={theories:[
  {theoryKey:"course",label:"コース",raceCount:486,evaluatedCount:0},
  {theoryKey:"start",label:"ST",raceCount:486,evaluatedCount:2}
]};
report=monitor.build(current,{baselineRaceCount:457,currentRaceCount:457,theories:[
  {theoryKey:"course",evaluatedCount:0,status:"waiting"},
  {theoryKey:"start",evaluatedCount:0,status:"waiting"}
]});
assert.equal(report.status,"healthy");
report=monitor.build({...current,theories:current.theories.map(r=>({...r,raceCount:487}))},{baselineRaceCount:457,currentRaceCount:457,theories:[
  {theoryKey:"course",evaluatedCount:0,status:"waiting"},
  {theoryKey:"start",evaluatedCount:0,status:"waiting"}
]});
assert.equal(report.status,"warning");
assert.deepEqual(report.warningTheoryKeys,["course"]);
assert.equal(report.automaticApplication,false);
assert.equal(report.usableForPrediction,false);
console.log("theory evidence growth monitor tests passed");
