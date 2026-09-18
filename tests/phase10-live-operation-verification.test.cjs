'use strict';
const assert=require('node:assert');
const {build}=require('../scripts/phase10-live-operation-verification.cjs');
const sample=[
 {raceKey:'L1',resultMatched:true,result:{trifecta:'1-2-3'},finalTickets:['1-2-3'],logicFingerprint:'live-g1'},
 {raceKey:'L2',resultMatched:true,result:{trifecta:'2-1-3'},finalTickets:['1-2-3'],predictedHead:'1',logicFingerprint:'live-g1'},
 {raceKey:'L3',resultMatched:true,result:{trifecta:'3-1-2'},finalTickets:['1-3-2'],theoryTriggered:true,ticketsChanged:0,logicFingerprint:'live-g1'}
];
const out=build(sample);
assert.strictEqual(out.productionChanged,false);
assert.strictEqual(out.liveVerified,true);
assert.strictEqual(out.summary.matchedRows,3);
assert.strictEqual(out.summary.hits,1);
assert.strictEqual(out.summary.misses,2);
assert.strictEqual(out.summary.missReasonCounts.HIT,1);
assert.strictEqual(out.summary.missReasonCounts.HEAD_MISS,1);
assert.strictEqual(out.summary.missReasonCounts.THEORY_TRIGGERED_TICKETS_UNCHANGED,1);
assert.strictEqual(out.cycle.phase8HandoffContract,true);
assert.strictEqual(out.cycle.automaticProductionChange,false);
assert.strictEqual(out.phaseComplete,true);
console.log('phase10 live operation verification tests passed');
