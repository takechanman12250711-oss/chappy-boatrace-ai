"use strict";
const assert = require("node:assert/strict");
const x = require("./build-local-water-outside-head-miss-structure");
const pred=[{predictions:[
 {date:"20260830",jcd:"10",raceNo:1,prediction:{venueWaterSupport:{venue:"三国",wind:1,wave:1,confirmations:["水面特性を補助評価"]},verificationEvidence:{mainScenario:{headBoatNo:1}}}},
 {date:"20260830",jcd:"10",raceNo:2,prediction:{venueWaterSupport:{venue:"三国",wind:6,wave:2,confirmations:["風速6m前後で注意"]},verificationEvidence:{mainScenario:{headBoatNo:1}}}},
 {date:"20260830",jcd:"10",raceNo:3,prediction:{venueWaterSupport:{venue:"三国",wind:6,wave:2,confirmations:["風速6m前後で注意"]},verificationEvidence:{mainScenario:{headBoatNo:4}}}},
 {date:"20260830",jcd:"10",raceNo:4,prediction:{venueWaterSupport:{venue:"三国",wind:6,wave:2,confirmations:["風速6m前後で注意"]},verificationEvidence:{mainScenario:{headBoatNo:3}}}}
]}];
const res=[{races:[
 {date:"20260830",jcd:"10",raceNo:1,resultAvailable:true,status:"finished",trifecta:{combination:"1-2-3"}},
 {date:"20260830",jcd:"10",raceNo:2,resultAvailable:true,status:"finished",trifecta:{combination:"4-1-2"}},
 {date:"20260830",jcd:"10",raceNo:3,resultAvailable:true,status:"finished",trifecta:{combination:"4-2-1"}},
 {date:"20260830",jcd:"10",raceNo:4,resultAvailable:true,status:"finished",trifecta:{combination:"5-3-1"}}
]}];
const r=x.build(pred,res);
assert.equal(r.settledFormalEvidenceRaceCount,4);
assert.equal(r.summaries.strong.settledCount,3);
assert.equal(r.summaries.strong.actualOutsideHeadCount,3);
assert.equal(r.summaries.strong.actualOutsideHeadPredictedInsideCount,1);
assert.equal(r.summaries.strong.actualOutsideHeadPredictedCorrectCount,1);
assert.equal(r.summaries.strong.actualOutsideHeadPredictedOutsideWrongCount,1);
assert.equal(r.nextStep.status,"continue-collecting-evidence");
assert.equal(r.productionChanged,false);

const inside=x.decision({
 calm:{outsideHeadMissByInsideRate:20,outsideHeadMissByWrongOutsideRate:30},
 strong:{settledCount:30,outsideHeadMissByInsideRate:35,outsideHeadMissByWrongOutsideRate:32}
});
assert.equal(inside.status,"eligible-for-inside-resilience-shadow-ab-design");
const outside=x.decision({
 calm:{outsideHeadMissByInsideRate:20,outsideHeadMissByWrongOutsideRate:20},
 strong:{settledCount:30,outsideHeadMissByInsideRate:24,outsideHeadMissByWrongOutsideRate:35}
});
assert.equal(outside.status,"eligible-for-outside-attacker-selection-shadow-ab-design");
const none=x.decision({
 calm:{outsideHeadMissByInsideRate:20,outsideHeadMissByWrongOutsideRate:20},
 strong:{settledCount:30,outsideHeadMissByInsideRate:25,outsideHeadMissByWrongOutsideRate:27}
});
assert.equal(none.status,"no-shadow-ab-signal");
console.log("local water outside-head miss structure test: ok");
