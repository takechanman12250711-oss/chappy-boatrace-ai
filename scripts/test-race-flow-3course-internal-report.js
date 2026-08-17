"use strict";
const assert=require("node:assert/strict");
const engine=require("./build-race-flow-3course-internal-report");
function record(i, slit, wallState, stFormal){return {date:"20260817",jcd:"05",raceNo:i,selection:{scenarioLabel:"3コース攻め"},prediction:{practicalTickets:["1-2-3","1-3-2"],verificationEvidence:{mainScenario:{slitAdjustment:slit,attackerCourse:3,attackerBoatNo:3},roles:{attackerCourse:3,attackerBoatNo:3},wallTheory:{formal:Boolean(wallState),state:wallState||""},stSlit:{roles:[{boatNo:3,isFormal:stFormal,appliedToScore:stFormal}]}}}}};}
function result(r,hit,payout=1000){return {date:r.date,jcd:r.jcd,raceNo:r.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const rows=[];const results=[];
for(let i=1;i<=12;i++){const r=record(i,-3,"壁崩れ",false);rows.push(r);results.push(result(r,i===1,500));}
for(let i=13;i<=24;i++){const r=record(i,5,"壁成立",true);rows.push(r);results.push(result(r,true,900));}
const report=engine.build([{predictions:[],verificationPredictions:rows}],[{races:results}]);
assert.equal(report.productionChanged,false);
assert.equal(report.diagnostics.deduplicatedRaceCount,24);
assert.equal(report.diagnostics.detailedEvidenceRaceCount,24);
assert.equal(report.summaries.slit_negative.raceCount,12);
assert.equal(report.summaries["壁崩れ"].raceCount,12);
assert.equal(report.summaries.st_formal_support.raceCount,12);
assert.ok(report.summaries.slit_negative.recoveryRate<report.summaries.slit_positive.recoveryRate);
assert.ok(report.weakBranchRanking.some(row=>row.branch==="slit_negative"));
console.log("race-flow 3course internal report test: ok");
