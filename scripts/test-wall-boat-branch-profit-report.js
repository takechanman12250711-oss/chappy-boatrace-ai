"use strict";
const assert=require("node:assert/strict");
const engine=require("./build-wall-boat-branch-profit-report");
function rec(i,state,score,grade="A"){return{date:"20260817",jcd:"12",raceNo:i,prediction:{practicalTickets:["3-1-2"],aiCore:{wallTheory:{attackerNo:3,wallCandidateNo:2,wallBoat:state==="壁成立"?2:0,state,score,grade}}}};}
function result(r,hit,payout=800){return{date:r.date,jcd:r.jcd,raceNo:r.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"3-1-2":"1-2-3",payout}};}
const preds=[],results=[];
for(let i=1;i<=12;i++){const r=rec(i,"壁成立",70,"B");preds.push(r);results.push(result(r,i<=2,700));}
for(let i=13;i<=24;i++){const r=rec(i,"互角",80,"A");preds.push(r);results.push(result(r,i<=18,900));}
for(let i=25;i<=36;i++){const r=rec(i,"壁崩れ",90,"S");preds.push(r);results.push(result(r,i<=34,1000));}
const report=engine.build([{predictions:preds}],[{races:results}]);
assert.equal(report.productionChanged,false);
assert.equal(report.diagnostics.selected.formalWallEvidenceRaceCount,36);
assert.equal(report.summaries.wallEstablished.raceCount,12);
assert.equal(report.summaries.even.raceCount,12);
assert.equal(report.summaries.wallBroken.raceCount,12);
assert.equal(report.summaries.score65to74.raceCount,12);
assert.equal(report.summaries.score75to84.raceCount,12);
assert.equal(report.summaries.score85plus.raceCount,12);
assert.equal(report.weakStateRanking[0].branch,"wallEstablished");
assert.equal(report.interpretation.automaticApplication,false);
assert.equal(report.interpretation.usableForPrediction,false);
console.log("wall-boat branch profit report test: ok");
