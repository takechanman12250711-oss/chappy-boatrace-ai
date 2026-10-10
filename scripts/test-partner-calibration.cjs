'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('./partner-calibration.cjs');
const input=()=>({head:1,scenarioType:'escape',courseByBoat:{1:1,2:2,3:3,4:4,5:5,6:6},
 outcomes:[1,2,3,4,5,6].map(boatNo=>({boatNo,secondScore:40+boatNo*5,thirdScore:80-boatNo*5})),
 base:['1-2-3','1-4-3','1-3-4','2-1-3','1-2-4','1-2-5','1-2-6']});
const model=()=>({version:m.VERSION,weights:[2,1,...Array(48).fill(0)]});
test('all twenty ordered pairs, no head or duplicate occupant',()=>{const pairs=m.rankPairs(input(),model());assert.equal(pairs.length,20);assert.equal(new Set(pairs.map(p=>p.ticket)).size,20);for(const p of pairs){assert.notEqual(p.second,p.third);assert.notEqual(p.second,1);assert.notEqual(p.third,1);}});
test('every pair has positive finite model weight, including old disallowed courses',()=>{const p=m.rankPairs(input(),model());assert.ok(p.some(x=>x.ticket==='1-5-2'));assert.ok(p.every(x=>Number.isFinite(x.modelWeight)&&x.modelWeight>0));assert.ok(Math.abs(p.reduce((s,x)=>s+x.modelWeight,0)-1)<1e-12);});
test('count and all alternative-head slots preserved',()=>{const r=input(),s=m.selectPartners(r,model());assert.equal(s.tickets.length,r.base.length);assert.equal(s.tickets[3],r.base[3]);assert.equal(s.tickets.filter(t=>t[0]==='1').length,6);});
test('input permutation does not change ordered output and input not mutated',()=>{const r=input(),before=JSON.stringify(r),a=m.selectPartners(r,model());assert.equal(JSON.stringify(r),before);r.outcomes.reverse();assert.deepEqual(a,m.selectPartners(r,model()));});
test('higher positional score improves its relative logit',()=>{const r=input(),a=m.rankPairs(r,model()),diff=(p)=>p.find(x=>x.ticket==='1-4-3').rankingScore-p.find(x=>x.ticket==='1-5-3').rankingScore;r.outcomes[3].secondScore+=10;assert.ok(diff(m.rankPairs(r,model()))>diff(a));});
test('course mapping, not boat labels, determines course coefficient',()=>{const r=input(),w=model();w.weights[2+4]=3;assert.equal(m.rankPairs(r,w)[0].second,5);r.courseByBoat[5]=2;r.courseByBoat[2]=5;assert.equal(m.rankPairs(r,w)[0].second,2);});
test('result odds payout and future metadata cannot change prediction',()=>{const r=input(),a=m.selectPartners(r,model());Object.assign(r,{actual:'1-5-2',payout:999999,odds:{'1-5-2':0.1},date:'20990101'});assert.deepEqual(a,m.selectPartners(r,model()));});
test('unknown scenario and invalid head rejected',()=>{for(const patch of [{head:0},{head:7},{head:'1'},{scenarioType:'unknown'}])assert.throws(()=>m.selectPartners({...input(),...patch},model()));});
test('duplicate and missing outcome identities rejected',()=>{let r=input();r.outcomes[5].boatNo=5;assert.throws(()=>m.rankPairs(r,model()));r=input();r.outcomes.pop();assert.throws(()=>m.rankPairs(r,model()));});
test('null and nonfinite score values rejected rather than imputed',()=>{for(const value of [null,undefined,NaN,Infinity,'50',-1,101]){const r=input();r.outcomes[2].secondScore=value;assert.throws(()=>m.rankPairs(r,model()));}});
test('zero positional scores are valid',()=>{const r=input();r.outcomes.forEach(x=>{x.secondScore=0;x.thirdScore=0;});assert.equal(m.rankPairs(r,model()).length,20);});
test('duplicate or missing recorded courses rejected',()=>{let r=input();r.courseByBoat[6]=5;assert.throws(()=>m.rankPairs(r,model()));r=input();delete r.courseByBoat[6];assert.throws(()=>m.rankPairs(r,model()));});
test('invalid and duplicate base tickets rejected',()=>{for(const base of [[],['1-1-2'],['1-2-3','1-2-3'],Array(11).fill('1-2-3')])assert.throws(()=>m.selectPartners({...input(),base},model()));});
test('model validation enforces dimension, finite weights and monotonic score coefficients',()=>{for(const w of [[],Array(50).fill(NaN),[-1,...Array(49).fill(0)],Array(49).fill(1)])assert.throws(()=>m.rankPairs(input(),{version:m.VERSION,weights:w}));});
function training(){const records=[],labels=[];for(let i=0;i<100;i++){const r={...input(),raceKey:'synthetic-'+i,date:'20260910',selectedAt:'2026-09-10T00:00:00Z',deadlineAt:'2026-09-10T01:00:00Z'};records.push(r);labels.push({raceKey:r.raceKey,actual:'1-6-2',refund:false});}return {records,labels};}
let fitted;
test('fitting decreases conditional objective and constrains scores',()=>{const d=training();fitted=m.fitModel(d.records,d.labels);assert.equal(fitted.trainingRaceCount,100);assert.ok(fitted.optimization.trace.at(-1).loss<fitted.optimization.trace[0].loss);assert.ok(fitted.weights[0]>=0&&fitted.weights[1]>=0);assert.ok(fitted.optimization.projectedGradientMax<1e-4);});
test('validation labels and inputs do not affect fitted weights',()=>{const d=training();d.records.push({...input(),raceKey:'future',date:'20260920'});d.labels.push({raceKey:'future',actual:'6-1-2',payout:999999});const same=m.fitModel(d.records,d.labels);assert.deepEqual(same.weights,fitted.weights);assert.equal(same.trainingRowsSha256,fitted.trainingRowsSha256);});
test('insufficient fitting set and duplicate race keys rejected',()=>{let d=training();d.records.pop();assert.throws(()=>m.fitModel(d.records,d.labels),/insufficient/);d=training();d.records[99].raceKey=d.records[0].raceKey;assert.throws(()=>m.fitModel(d.records,d.labels),/duplicate/);});
test('refund and different actual head are excluded for training only',()=>{const d=training();d.labels[0].refund=true;d.labels[1].actual='2-1-3';assert.throws(()=>m.fitModel(d.records,d.labels),/98/);});
test('post-deadline training snapshot rejected',()=>{const d=training();d.records[0].selectedAt=d.records[0].deadlineAt;assert.throws(()=>m.fitModel(d.records,d.labels),/pre-deadline/);});
