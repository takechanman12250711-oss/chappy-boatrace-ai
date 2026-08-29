"use strict";
const assert = require("node:assert/strict");
const x = require("./build-local-water-result-breakdown");
const r1 = { date:"20260818", jcd:"10", raceNo:1, prediction:{ venueWaterSupport:{venue:"三国",wind:4,wave:2,tide:"",confirmations:["三国の水面特性を補助評価"]}, verificationEvidence:{mainScenario:{headBoatNo:1}} } };
const r2 = { date:"20260818", jcd:"10", raceNo:2, prediction:{ venueWaterSupport:{venue:"三国",wind:6,wave:6,tide:"満潮前",confirmations:["風速6m前後で注意","潮の影響を補正"]}, verificationEvidence:{mainScenario:{headBoatNo:1}} } };
const results = [{ races:[
  {date:r1.date,jcd:r1.jcd,raceNo:1,resultAvailable:true,status:"finished",trifecta:{combination:"1-2-3",payout:500}},
  {date:r2.date,jcd:r2.jcd,raceNo:2,resultAvailable:true,status:"finished",trifecta:{combination:"4-1-2",payout:3000}}
]}];
const report = x.build([{predictions:[r1,r2]}], results);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.settledFormalEvidenceRaceCount, 2);
const venue = report.breakdown.find(row => row.branch === "venue:三国");
assert.equal(venue.settledCount, 2);
assert.equal(venue.predictedHeadHitRate, 50);
assert.equal(venue.actualHead1Rate, 50);
const strongWind = report.breakdown.find(row => row.branch === "wind:5plus");
assert.equal(strongWind.settledCount, 1);
assert.equal(strongWind.actualOutsideHeadRate, 100);
console.log("local water result breakdown test: ok");
