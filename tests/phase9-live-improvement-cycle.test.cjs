'use strict';
const assert=require('node:assert');
const {build}=require('../scripts/phase9-live-improvement-cycle.cjs');
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
console.log('phase9 live improvement cycle tests passed');
