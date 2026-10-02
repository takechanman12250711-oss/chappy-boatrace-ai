"use strict";
const assert=require("node:assert/strict");const e=require("./build-exhibition-foot-branch-report");
function r(i,rank,text){return{date:"20260817",jcd:"05",raceNo:i,prediction:{practicalTickets:["1-2-3"],flowSupport:{attackBoatNo:3,attackExhibitionRank:rank,dataCoverage:{exhibition:6},confirms:[text]}}};}
function rr(x,hit,payout=800){return{date:x.date,jcd:x.jcd,raceNo:x.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const stored={prediction:{verificationEvidence:{exhibitionFoot:{formal:true,attackBoatNo:4,exhibitionRank:2,exhibitionCoverage:6,statements:["4号艇は展示上位で気配良好"],confirm:true,alert:false}}}};
const storedEvidence=e.evidence(stored);assert.equal(storedEvidence.formal,true);assert.equal(storedEvidence.attackBoatNo,4);assert.equal(storedEvidence.rank,2);assert.equal(storedEvidence.coverage,6);assert.equal(storedEvidence.confirm,true);assert.equal(storedEvidence.alert,false);
const a=[],b=[];for(let i=1;i<=12;i++){const x=r(i,1,"3号艇は展示上位で気配良く展開を補強");a.push(x);b.push(rr(x,true,900));}for(let i=13;i<=24;i++){const x=r(i,3,"3号艇は展示下位で足に不安");a.push(x);b.push(rr(x,i===13,500));}
const report=e.build([{predictions:a}],[{races:b}]);assert.equal(report.productionChanged,false);assert.equal(report.summaries.rank1.raceCount,12);assert.equal(report.summaries.rank3plus.raceCount,12);assert.ok(report.summaries.rank3plus.recoveryRate<report.summaries.rank1.recoveryRate);assert.ok(report.weakBranchRanking.some(x=>x.branch==="rank3plus"));console.log("exhibition foot branch report test: ok");
