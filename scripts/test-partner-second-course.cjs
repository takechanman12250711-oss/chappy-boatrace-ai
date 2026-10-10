'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {select}=require('./partner-second-course-ablation.cjs');
const {selectPartners}=require('./partner-calibration.cjs');
const model=require('./partner-frozen-model.json');
const input=()=>({head:1,scenarioType:'escape',courseByBoat:{1:1,2:2,3:3,4:4,5:5,6:6},outcomes:[1,2,3,4,5,6].map(boatNo=>({boatNo,secondScore:boatNo===6?100:50,thirdScore:boatNo===4?100:50})),base:['1-2-3','3-1-2','1-3-4']});
test('third partner relative order and logit gaps remain identical within each second boat',()=>{const r=input(),a=select(r,model),b=selectPartners(r,model);for(const second of [2,3,4,5,6]){const aa=a.rankedPairs.filter(p=>p.second===second),bb=b.rankedPairs.filter(p=>p.second===second);assert.deepEqual(aa.map(p=>p.ticket),bb.map(p=>p.ticket));for(let i=1;i<aa.length;i++)assert.ok(Math.abs((aa[i].rankingScore-aa[0].rankingScore)-(bb[i].rankingScore-bb[0].rankingScore))<1e-12);}});
test('outer upstream evidence can win while budget and alternative head slots remain',()=>{const r=input(),before=JSON.stringify({r,model}),a=select(r,model);assert.equal(a.tickets[0],'1-6-4');assert.equal(a.tickets.length,r.base.length);assert.equal(a.tickets[1],r.base[1]);assert.equal(new Set(a.tickets).size,a.tickets.length);assert.equal(JSON.stringify({r,model}),before);});
test('non escape, metadata independence and invalid source rejection',()=>{for(const scenarioType of ['sashi','threeAttack','fourAttack']){const r={...input(),scenarioType};assert.deepEqual(select(r,model).rankedPairs,selectPartners(r,model).rankedPairs);}const r=input();assert.deepEqual(select(r,model),select({...r,actual:'1-2-3',payout:999,odds:{x:100}},model));assert.throws(()=>select({...r,courseByBoat:{}},model));});
