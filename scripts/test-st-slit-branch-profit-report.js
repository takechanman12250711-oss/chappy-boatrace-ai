"use strict";
const assert=require("node:assert/strict");
const engine=require("./build-st-slit-branch-profit-report");
function rec(i,adj,opts={}){return {date:"20260816",jcd:"12",raceNo:i,prediction:{practicalTickets:["1-2-3"],aiCore:{analyses:[{boatNo:3,fCount:opts.f?1:0,stTheory:{isFormal:opts.formal!==false,appliedToScore:opts.formal!==false}}],raceScenarios:{scenarios:[{type:"threeAttack",slitAdjustment:adj}],evidence:{slit:{alerts:opts.alert?[{boatNo:3}]:[],risks:opts.risk?[{boatNo:4}]:[],advantages:opts.advantage?[{boatNo:3}]:[]}}}}}};}
function storedRec(i,adj){return {date:"20260816",jcd:"12",raceNo:i,selectedAt:`2026-08-16T13:${String(i%60).padStart(2,"0")}:00Z`,prediction:{practicalTickets:["1-2-3"],verificationEvidence:{scenarios:[{type:"threeAttack",attacker:3,slitAdjustment:adj,slitReasons:[adj>0?"3号艇の展示STが優勢":adj<0?"3号艇の展示STが劣勢":"ST補正なし"]}],stSlit:{roles:[{boatNo:3,status:adj>0?"advantage":adj<0?"risk":"neutral",isFormal:true}]}}}};}
function result(r,hit,payout=1000){return {date:r.date,jcd:r.jcd,raceNo:r.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const preds=[],results=[];
for(let i=1;i<=12;i++){const r=rec(i,-8,{risk:true});preds.push(r);results.push(result(r,i===1,500));}
for(let i=13;i<=24;i++){const r=rec(i,8,{alert:true});preds.push(r);results.push(result(r,true,900));}
const stored=storedRec(25,-4);preds.push(stored);results.push(result(stored,false));
const pendingStored=storedRec(26,4);preds.push(pendingStored);
const verification=[storedRec(101,8),storedRec(102,-8),storedRec(103,0)];
verification[0].result={settled:true,resultTicket:"1-2-3",payout:800};
const storedEvidence=engine.stEvidence(stored);
assert.equal(storedEvidence.source,"verificationEvidence");
assert.equal(storedEvidence.negativeAdjustment,true);
assert.equal(storedEvidence.formal,true);
const report=engine.build([{predictions:preds,verificationPredictions:verification}],[{races:results}]);
assert.equal(report.productionChanged,false);
assert.equal(report.schemaVersion,5);
assert.equal(report.evidenceDiagnostics.totalPredictionRaceCount,26);
assert.equal(report.evidenceDiagnostics.verificationEvidenceRaceCountAll,2);
assert.equal(report.evidenceDiagnostics.adjustmentEvidenceRaceCountAll,26);
assert.equal(report.evidenceDiagnostics.stSlitRoleEvidenceRaceCountAll,26);
assert.equal(report.evidenceDiagnostics.verificationEvidenceRaceCount,1);
assert.equal(report.evidenceDiagnostics.adjustmentEvidenceRaceCount,25);
assert.deepEqual(report.evidenceDiagnostics.verificationPredictions,{raceCount:3,scenarioEvidenceRaceCount:3,adjustmentEvidenceRaceCount:3,stSlitRoleEvidenceRaceCount:3});
assert.equal(report.summaries.negativeAdjustment.raceCount,13);
assert.equal(report.summaries.positiveAdjustment.raceCount,12);
assert.ok(report.summaries.negativeAdjustment.recoveryRate < report.summaries.positiveAdjustment.recoveryRate);
assert.equal(report.verificationProspective.actualPurchase,false);
assert.equal(report.verificationProspective.oldRecordsBackfilled,false);
assert.equal(report.verificationProspective.evidenceRaceCount,3);
assert.equal(report.verificationProspective.firstEvidence.raceKey,"20260816-12-101");
assert.equal(report.verificationProspective.firstEvidence.settled,true);
assert.equal(report.verificationProspective.summaries.all.raceCount,3);
assert.equal(report.verificationProspective.summaries.all.settledCount,1);
assert.equal(report.verificationProspective.summaries.all.hitCount,1);
assert.equal(report.verificationProspective.summaries.positiveAdjustment.raceCount,1);
assert.equal(report.verificationProspective.summaries.negativeAdjustment.raceCount,1);
const weakestRate=report.weakBranchRanking[0].recoveryRate;
const weakestBranches=report.weakBranchRanking.filter(row=>row.recoveryRate===weakestRate).map(row=>row.branch);
assert.ok(weakestBranches.includes("negativeAdjustment"));
assert.ok(weakestBranches.includes("risk"));
console.log("ST/slit branch profit report test: ok");
