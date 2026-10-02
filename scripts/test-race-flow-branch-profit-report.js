"use strict";
const assert=require("node:assert/strict");
const engine=require("./build-race-flow-branch-profit-report");
function rec(i,label,source="storedTitle"){const prediction={practicalTickets:["1-2-3"]};const record={date:"20260817",jcd:"05",raceNo:i,prediction};if(source==="storedTitle")prediction.raceFlow={scenario:{title:label}};else record.selection={scenarioLabel:label};return record;}
function result(r,hit,payout=900){return{date:r.date,jcd:r.jcd,raceNo:r.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const a=[],b=[],results=[];
for(let i=1;i<=12;i++){const r=rec(i,"1号艇逃げ");a.push(r);results.push(result(r,i<=6,800));}
for(let i=13;i<=24;i++){const r=rec(i,"3コース攻め","selection");b.push(r);results.push(result(r,i<=15,1200));}
const originalPredictions=[{predictions:a,verificationPredictions:b}];
const originalResults=[{races:results}];
const report=engine.build(originalPredictions,originalResults);
assert.equal(report.productionChanged,false);
assert.equal(report.version,"race-flow-branch-profit-v2-saved-title");
assert.equal(report.diagnostics.deduplicatedLabeledRaceCount,24);
assert.deepEqual(report.diagnostics.distinctLabels,["1号艇逃げ","3コース攻め"]);
assert.equal(report.diagnostics.selected.sources["prediction.raceFlow.scenario.title"],12);
assert.equal(report.diagnostics.verification.sources["record.selection.scenarioLabel"],12);
assert.equal(report.summaries["1号艇逃げ"].raceCount,12);
assert.equal(report.summaries["3コース攻め"].raceCount,12);
assert.equal(report.weakBranchRanking.length,2);
assert.equal(report.interpretation.retrospectiveInferenceAllowed,false);
const noisyPredictions={predictions:a.map(r=>({...r,unusedPayload:{rows:Array(100).fill("discard")}})),verificationPredictions:b.map(r=>({...r,unusedPayload:{rows:Array(100).fill("discard")}}))};
const noisyResults={races:results.map(r=>({...r,unusedPayload:{rows:Array(100).fill("discard")}}))};
const compactPrediction=engine.compactPredictionDoc(noisyPredictions);
const compactResult=engine.compactResultDoc(noisyResults);
const compactReport=engine.build([compactPrediction],[compactResult]);
assert.equal(JSON.stringify(compactPrediction).includes("unusedPayload"),false);
assert.equal(JSON.stringify(compactResult).includes("unusedPayload"),false);
assert.deepEqual(compactReport.diagnostics,report.diagnostics);
assert.deepEqual(compactReport.summaries,report.summaries);
assert.deepEqual(compactReport.weakBranchRanking,report.weakBranchRanking);
const embedded=rec(25,"2コース差し");embedded.result={settled:true,resultTicket:"1-2-3",payout:777,unusedPayload:"discard"};const compactEmbedded=engine.compactPredictionRow(embedded);assert.deepEqual(compactEmbedded.result,{settled:true,resultTicket:"1-2-3",payout:777});
console.log("race-flow branch profit saved-title test: ok");
