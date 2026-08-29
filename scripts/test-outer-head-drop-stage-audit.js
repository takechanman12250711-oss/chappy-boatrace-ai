"use strict";
const assert=require("node:assert/strict");const x=require("./build-outer-head-drop-stage-audit");
const docs=[{predictions:[
 {date:"20260830",jcd:"01",raceNo:1,prediction:{verificationEvidence:{mainScenario:{headBoatNo:1}},candidatePool:[{boatNo:5,role:"alternate-head"}]}},
 {date:"20260830",jcd:"01",raceNo:2,prediction:{verificationEvidence:{mainScenario:{headBoatNo:2}},raceScenarios:{alternateScenario:{headBoatNo:6}}}}
]}];
const r=x.build(docs);assert.equal(r.settledPredictionCount,2);assert.equal(r.finalHead56Count,0);assert.equal(r.candidateStage56RaceCount,1);assert.equal(r.scenarioStage56RaceCount,1);assert.equal(r.dropStage,"drops-between-scenario-and-main-head");assert.equal(r.productionChanged,false);console.log("outer head drop stage audit test: ok");
