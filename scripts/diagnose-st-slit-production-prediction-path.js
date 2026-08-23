"use strict";

const assert = require("node:assert/strict");

global.window = global;
const collector = require("./collect-predictions");
const theoryInput = require("../js/theory-input");

function courseHistory(course, starts, averageSt, stStdDev = 0.022) {
  return { course, starts, averageSt, stStdDev, stRange: Number((stStdDev * 4).toFixed(3)) };
}
function entry(boatNo, exhibitionSt, avgSt = 0.15, currentSt = []) {
  return {
    boatNo, registerNo: String(5100 + boatNo), racerName: `${boatNo}号艇`,
    className: boatNo === 3 ? "A1" : "B1", avgSt, exhibitionSt,
    exhibitionTime: 6.8 + boatNo * 0.01, lapTime: 37.5 + boatNo * 0.01,
    fCount: 0, currentSeries: { st: currentSt },
    startExhibition: { boat: boatNo, course: boatNo, st: exhibitionSt, isOfficialCourse: true, mappingSource: "official-start-image" }
  };
}
const entries = [
  entry(1,0.14,0.15,[0.14,0.15]), entry(2,0.16,0.16,[0.16,0.15]),
  entry(3,0.04,0.14,[0.12,0.14,0.13]), entry(4,0.18,0.17,[0.16,0.18]),
  entry(5,0.15,0.16,[0.15,0.17]), entry(6,0.16,0.17,[0.17,0.16])
];
const historyRacers = entries.map(boat => ({
  registerNo: boat.registerNo, localStarts: 20, currentVenueStarts: 20,
  skillHistory: { windows: {
    all3Years: { byCourse: { [boat.boatNo]: courseHistory(boat.boatNo,36,boat.avgSt) } },
    recent1Year: { byCourse: { [boat.boatNo]: courseHistory(boat.boatNo,18,boat.avgSt,0.02) } },
    previous2Years: { byCourse: { [boat.boatNo]: courseHistory(boat.boatNo,18,boat.avgSt+0.01,0.025) } }
  }}
}));
const raw = {
  stadiumCode:"12",jcd:"12",raceNo:1,entries,
  startExhibition: entries.map(boat=>({...boat.startExhibition})),
  weather:{windSpeed:2,waveHeight:2,windDirection:"北"},
  historyContext:{ready:true,racers:historyRacers,courseStructure:{overall:null,venue:null,thresholds:null}}
};
const prepared = theoryInput.prepare(raw, global.ChappyAICore);
const prediction = global.createPrediction(prepared);
const core = prediction?.aiCore || {};
const raceScenarios = core?.raceScenarios || {};
const coreScenarios = Array.isArray(raceScenarios.scenarios)?raceScenarios.scenarios:[];
const compact = collector.compactVerificationEvidence(prediction) || {};
const compactScenarios = Array.isArray(compact.scenarios)?compact.scenarios:[];
const aggregateRoles = Array.isArray(core?.stSlitTheory?.roles)?core.stSlitTheory.roles:[];
const analysisRoles = (Array.isArray(core?.analyses)?core.analyses:[]).map(a=>({boatNo:Number(a?.boatNo||0),...(a?.stTheory||{})})).filter(x=>Object.keys(x).length>1);
const compactRoles = Array.isArray(compact?.stSlit?.roles)?compact.stSlit.roles:[];
function flags(rows){return {count:rows.length,formal:rows.filter(x=>x?.isFormal===true).length,applied:rows.filter(x=>x?.appliedToScore===true).length,rows:rows.map(x=>({boatNo:x?.boatNo||x?.boat||null,isFormal:x?.isFormal===true,appliedToScore:x?.appliedToScore===true,status:x?.status||"",score:x?.score??null}))};}
const diagnostic={
  integratedFormal:core?.stSlitTheory?.isFormal===true,
  aggregateRoles:flags(aggregateRoles), analysisRoles:flags(analysisRoles), compactRoles:flags(compactRoles),
  coreAdjustmentFieldCount:coreScenarios.filter(row=>row&&Object.prototype.hasOwnProperty.call(row,"slitAdjustment")).length,
  compactAdjustmentFieldCount:compactScenarios.filter(row=>row&&Object.prototype.hasOwnProperty.call(row,"slitAdjustment")).length
};
console.log(JSON.stringify(diagnostic,null,2));
assert.ok(prediction&&typeof prediction==="object");
assert.equal(diagnostic.integratedFormal,true,"synthetic formal input must make integrated ST/slit formal");
assert.ok(diagnostic.analysisRoles.formal>0,"canonical analysis stTheory must contain formal roles");
assert.ok(diagnostic.analysisRoles.applied>0,"canonical analysis stTheory must contain applied roles");
assert.ok(diagnostic.coreAdjustmentFieldCount>0);
assert.ok(diagnostic.compactAdjustmentFieldCount>0);
console.log("ST/slit production prediction path diagnostic: ok");
