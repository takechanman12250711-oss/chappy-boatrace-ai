'use strict';
const assert=require('node:assert');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {build,load,recordsFromIndex,resultCombo}=require('../scripts/phase9-live-improvement-cycle.cjs');
const rows=[
 {raceKey:'A',resultMatched:true,result:{trifecta:'1-2-3'},finalTickets:['1-2-3'],logicFingerprint:'g1'},
 {raceKey:'B',resultMatched:true,result:{trifecta:'2-1-3'},finalTickets:['1-2-3'],predictedHead:'1',logicFingerprint:'g1'},
 {raceKey:'C',resultMatched:true,result:{trifecta:'3-1-2'},finalTickets:['1-3-2'],theoryTriggered:true,ticketsChanged:0,logicFingerprint:'g1'},
 {raceKey:'D',resultMatched:true,result:{trifecta:'4-1-2'},finalTickets:['1-4-2'],ratedBoatNotPropagated:true,logicFingerprint:'g1'},
 {raceKey:'E',resultMatched:true,result:{trifecta:'5-1-2'},finalTickets:['1-5-2'],ticketCapDropped:true,logicFingerprint:'g1'},
 {raceKey:'F',resultMatched:false,result:{trifecta:''},finalTickets:['1-2-3']}
];
const out=build(rows);
assert.strictEqual(out.productionChanged,false);
assert.strictEqual(out.phaseComplete,true);
assert.strictEqual(out.summary.matchedRows,5);
assert.strictEqual(out.summary.hits,1);
assert.strictEqual(out.summary.misses,4);
assert.strictEqual(out.summary.duplicates,0);
assert.strictEqual(out.summary.eligibleCandidates,0);
assert.strictEqual(out.audit.phase8Complete,true);
assert.strictEqual(out.audit.ambiguousMissReasons,0);
assert.strictEqual(out.handoff.automaticProductionChange,false);
assert.strictEqual(out.handoff.approvalStop,'CANDIDATE_FOR_USER_APPROVAL');
assert.ok(out.rows.some(x=>x.missReason==='HEAD_MISS'));
assert.ok(out.rows.some(x=>x.missReason==='THEORY_TRIGGERED_TICKETS_UNCHANGED'));
assert.ok(out.rows.some(x=>x.missReason==='RATED_BOAT_NOT_PROPAGATED'));
assert.ok(out.rows.some(x=>x.missReason==='TICKET_CAP_DROP'));
assert.ok(out.patterns.every(x=>x.status==='INSUFFICIENT_EVIDENCE'&&x.candidate===null));

const materialized=recordsFromIndex({format:'chappy-prediction-index-manifest',collections:{predictions:{shards:[{path:'a.json'},{path:'b.json'}]}}},p=>p==='a.json'?{records:[{raceKey:'M1'}]}:{records:[{raceKey:'M2'}]});
assert.deepStrictEqual(materialized.map(x=>x.raceKey),['M1','M2']);

const current=build([
 {raceKey:'N1',officialResult:{confirmed:true,combination:'1-2-3'},shadowV2Reference:{logicFingerprint:'current-g1'},prediction:{practicalTickets:[{ticket:'1-2-3'}],verificationEvidence:{mainScenario:{headBoatNo:1},generation:{logicFingerprint:'current-g1'},theoryClaims:[{theoryKey:'flow'},{theoryKey:'holdPickup'}]}}},
 {raceKey:'N2',officialResult:{confirmed:true,combination:'2-1-3'},shadowV2Reference:{logicFingerprint:'current-g1'},prediction:{practicalTickets:[{ticket:'1-2-3'}],verificationEvidence:{mainScenario:{headBoatNo:1},theoryClaims:[{theoryKey:'flow'}]}}},
 {raceKey:'N3',__officialResult:{resultAvailable:true,source:'boatrace-official',trifecta:{combination:'3-2-1'}},prediction:{practicalTickets:[{ticket:'3-2-1'}]}}
]);
assert.strictEqual(current.summary.matchedRows,3);
assert.strictEqual(current.summary.hits,2);
assert.strictEqual(current.summary.misses,1);
assert.strictEqual(current.rows[0].logicFingerprint,'current-g1');
assert.deepStrictEqual(current.rows[0].theoryIds,['flow','holdPickup']);
assert.strictEqual(current.rows[1].missReason,'HEAD_MISS');
assert.strictEqual(current.rows[2].result,'321');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-phase9-current-'));
try{
 const predictionsDir=path.join(tmp,'data','predictions');
 const resultsDir=path.join(tmp,'data','results');
 fs.mkdirSync(predictionsDir,{recursive:true});
 fs.mkdirSync(resultsDir,{recursive:true});
 const base={date:'20260920',jcd:'01',selectedAt:'2026-09-20T00:00:00Z',deadlineAt:'2026-09-20T01:00:00Z',prediction:{preRaceConditions:{sourceTiming:'pre_deadline',officialResultUsed:false,schemaVersion:3}}};
 fs.writeFileSync(path.join(predictionsDir,'20260920.json'),JSON.stringify({predictions:[
  {...base,raceKey:'20260920-01-1',raceNo:1,prediction:{...base.prediction,practicalTickets:[{ticket:'1-2-3'}]}},
  {...base,raceKey:'20260920-01-2',raceNo:2,prediction:{...base.prediction,practicalTickets:[]}}
 ]}));
 fs.writeFileSync(path.join(resultsDir,'20260920.json'),JSON.stringify({date:'20260920',races:[
  {date:'20260920',jcd:'01',raceNo:1,resultAvailable:true,status:'finished',source:'boatrace-official',trifecta:{combination:'1-2-3'}},
  {date:'20260920',jcd:'01',raceNo:2,resultAvailable:true,status:'finished',source:'boatrace-official',trifecta:{combination:'2-1-3'}}
 ]}));
 const live=load({root:tmp});
 assert.strictEqual(live.length,1,'phase9 live loader must read current daily files and keep only practical ticketed predictions');
 assert.strictEqual(live[0].raceKey,'20260920-01-1');
 assert.strictEqual(resultCombo(live[0]),'123');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('phase9 live improvement cycle tests passed');
