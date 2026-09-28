'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const f=require('./partner-frozen-day.cjs'),api=require('./partner-calibration.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const base=['3-1-5','3-2-5','3-1-6','1-2-3','1-2-4','3-2-1','3-2-6'];
function record(){return {raceKey:'20260928-03-2',date:'20260928',jcd:'03',raceNo:2,place:'江戸川',selectedAt:'2026-09-28T00:00:00Z',deadlineAt:'2026-09-28T01:00:00Z',prediction:{
 preRaceConditions:{sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt:'2026-09-27T23:59:00Z'},
 practicalTickets:base.map(ticket=>({ticket})),practicalSelection:{frameRiseFallReplayBasis:{source:'pre-deadline-production-prediction',
 raceScenarios:{mainScenario:{headBoatNo:3,type:'threeAttack',outcome:{boats:[1,2,3,4,5,6].map(boatNo=>({boatNo,secondScore:80-boatNo,thirdScore:60+boatNo}))}}},
 courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}}}}}};}
const m=f.model(),at='2026-09-28T00:30:00Z';
function result(actual='3-1-2',overrides={}){return {date:'20260928',jcd:'03',raceNo:2,source:'boatrace-official',resultAvailable:true,trifecta:{combination:actual,payout:1230},...overrides};}
function doc(){return {rows:[f.snapshot(record(),m,at)]};}
test('frozen file and inference hashes match; weights are finite',()=>{assert.equal(m.weights.length,50);assert.equal(m.trainingRaceCount,184);assert.equal(m.automaticAdoption,false);});
test('all twenty combinations survive, no course veto',()=>{const x=f.snapshot(record(),m,at);assert.equal(x.rankedPairs.length,20);assert.ok(x.rankedPairs.some(p=>p.ticket==='3-4-2'));});
test('same ticket count and alternative positions',()=>{const x=f.snapshot(record(),m,at);assert.equal(x.candidate.length,7);assert.equal(x.candidate[3],base[3]);assert.equal(x.candidate[4],base[4]);});
test('new candidate timestamps are not backdated to original source',()=>{const x=f.snapshot(record(),m,'2026-09-28T02:00:00Z');assert.equal(x.timing,'retrospective-replay');assert.notEqual(x.candidateGeneratedAt,x.sourceSelectedAt);});
test('fresh pre-deadline snapshot is not yet certified prospective',()=>{assert.equal(f.snapshot(record(),m,at).timing,'pre-deadline-candidate-unsealed');assert.equal(f.settle(doc(),[result()]).prospective.base.races,0);});
test('remote persistence must precede deadline',()=>{assert.equal(f.settle(doc(),[result()],'2026-09-28T00:40:00Z').prospective.base.races,1);assert.equal(f.settle(doc(),[result()],'2026-09-28T02:00:00Z').prospective.base.races,0);});
test('persistence before generation is rejected as prospective',()=>{assert.equal(f.settle(doc(),[result()],'2026-09-28T00:20:00Z').prospective.base.races,0);});
test('result and odds fields never enter ranking input',()=>{const r=record(),a=f.snapshot(r,m,at);r.actual='6-5-4';r.payout=9999;r.prediction.odds={fake:100};r.prediction.result={actual:'3-1-5'};const b=f.snapshot(r,m,at);assert.deepEqual(a,b);});
test('inference does not invoke fitModel',()=>{const fit=api.fitModel;api.fitModel=()=>{throw Error('FIT FORBIDDEN');};try{assert.equal(f.snapshot(record(),m,at).candidate.length,7);}finally{api.fitModel=fit;}});
test('duplicate boat has baseline fallback, retained in cohort',()=>{const r=record();r.prediction.practicalSelection.frameRiseFallReplayBasis.raceScenarios.mainScenario.outcome.boats[0].boatNo=2;const x=f.snapshot(r,m,at);assert.ok(x.unavailable);assert.deepEqual(x.candidate,base);assert.equal(f.settle({rows:[x]},[result()]).settledRaces,1);});
test('late original source excluded from primary',()=>{const r=record();r.selectedAt='2026-09-28T01:01:00Z';const x=f.snapshot(r,m,at);assert.equal(x.sourcePreDeadline,false);assert.equal(f.settle({rows:[x]},[result()]).settledRaces,0);});
test('pending results are not misses and rate is null',()=>{const x=f.settle(doc(),[]);assert.equal(x.settledRaces,0);assert.equal(x.all.base.hitRate,null);assert.equal(x.excluded.length,1);});
test('refund and void excluded',()=>{assert.equal(f.settle(doc(),[result('3-1-2',{starts:[{falseStart:true}]})]).settledRaces,0);assert.equal(f.settle(doc(),[result('3-1-2',{void:true})]).settledRaces,0);});
test('nonofficial labels not accepted',()=>{assert.equal(f.settle(doc(),[result('3-1-2',{source:'other'})]).settledRaces,0);});
test('duplicate and mismatched official labels rejected',()=>{assert.throws(()=>f.settle(doc(),[result(),result()]));assert.equal(f.settle(doc(),[result('3-1-2',{finishers:[{rank:1,boat:1},{rank:2,boat:2},{rank:3,boat:3}]})]).settledRaces,0);});
test('null and negative payouts not accepted',()=>{for(const payout of [null,-1,Infinity])assert.equal(f.settle(doc(),[result('3-1-2',{trifecta:{combination:'3-1-2',payout}})]).settledRaces,0);});
test('frozen input arrays and model remain unchanged',()=>{const r=record(),r0=clone(r),m0=clone(m);f.snapshot(r,m,at);assert.deepEqual(r,r0);assert.deepEqual(m,m0);});
test('empty cohort is not an improvement',()=>{const x=f.settle({rows:[]},[]);assert.equal(x.all.candidate.netHits,0);assert.equal(x.all.candidate.hitRate,null);});
