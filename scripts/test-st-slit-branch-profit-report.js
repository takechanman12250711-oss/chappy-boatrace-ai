"use strict";
const assert=require("node:assert/strict");
const engine=require("./build-st-slit-branch-profit-report");
function rec(i,adj,opts={}){return {date:"20260816",jcd:"12",raceNo:i,prediction:{practicalTickets:["1-2-3"],aiCore:{analyses:[{boatNo:3,fCount:opts.f?1:0,stTheory:{isFormal:opts.formal!==false,appliedToScore:opts.formal!==false}}],raceScenarios:{scenarios:[{type:"threeAttack",slitAdjustment:adj}],evidence:{slit:{alerts:opts.alert?[{boatNo:3}]:[],risks:opts.risk?[{boatNo:4}]:[],advantages:opts.advantage?[{boatNo:3}]:[]}}}}}};}
function result(r,hit,payout=1000){return {date:r.date,jcd:r.jcd,raceNo:r.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const preds=[],results=[];
for(let i=1;i<=12;i++){const r=rec(i,-8,{risk:true});preds.push(r);results.push(result(r,i===1,500));}
for(let i=13;i<=24;i++){const r=rec(i,8,{alert:true});preds.push(r);results.push(result(r,true,900));}
const report=engine.build([{predictions:preds}],[{races:results}]);
assert.equal(report.productionChanged,false);
assert.equal(report.summaries.negativeAdjustment.raceCount,12);
assert.equal(report.summaries.positiveAdjustment.raceCount,12);
assert.ok(report.summaries.negativeAdjustment.recoveryRate < report.summaries.positiveAdjustment.recoveryRate);
assert.equal(report.weakBranchRanking[0].branch,"negativeAdjustment");
console.log("ST/slit branch profit report test: ok");
