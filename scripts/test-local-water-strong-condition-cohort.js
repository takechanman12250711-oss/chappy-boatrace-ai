"use strict";
const assert = require("node:assert/strict");
const x = require("./build-local-water-strong-condition-cohort");
assert.equal(x.classify({wind:1,wave:1}), "calm");
assert.equal(x.classify({wind:4,wave:1}), "medium");
assert.equal(x.classify({wind:4,wave:5}), "strong");
const pred = [{ predictions:[
  {date:"20260830",jcd:"10",raceNo:1,prediction:{venueWaterSupport:{venue:"三国",wind:1,wave:1,confirmations:["水面特性を補助評価"]},verificationEvidence:{mainScenario:{headBoatNo:1}}}},
  {date:"20260830",jcd:"10",raceNo:2,prediction:{venueWaterSupport:{venue:"三国",wind:6,wave:2,confirmations:["風速6m前後で注意"]},verificationEvidence:{mainScenario:{headBoatNo:1}}}},
  {date:"20260830",jcd:"10",raceNo:3,prediction:{venueWaterSupport:{venue:"三国",wind:2,wave:6,confirmations:["波高6cm前後で注意"]},verificationEvidence:{mainScenario:{headBoatNo:2}}}}
]}];
const res = [{ races:[
  {date:"20260830",jcd:"10",raceNo:1,resultAvailable:true,status:"finished",trifecta:{combination:"1-2-3"}},
  {date:"20260830",jcd:"10",raceNo:2,resultAvailable:true,status:"finished",trifecta:{combination:"4-1-2"}},
  {date:"20260830",jcd:"10",raceNo:3,resultAvailable:true,status:"finished",trifecta:{combination:"3-2-1"}}
]}];
const report = x.build(pred,res);
assert.equal(report.settledFormalEvidenceRaceCount,3);
assert.equal(report.cohorts.calm.settledCount,1);
assert.equal(report.cohorts.strong.settledCount,2);
assert.equal(report.cohorts.strong.actualOutsideHeadRate,100);
assert.equal(report.productionChanged,false);
console.log("local water strong condition cohort test: ok");
