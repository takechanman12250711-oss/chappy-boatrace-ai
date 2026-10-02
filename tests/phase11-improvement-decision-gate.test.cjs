'use strict';const assert=require('node:assert');const {build}=require('../scripts/phase11-improvement-decision-gate.cjs');
const out=build([
 {candidateId:'a',evaluatedCount:100,netHits:2,roiDelta:3,preregisteredGate:{requiredCount:100,minNetHits:1,minRoiDelta:0}},
 {candidateId:'b',evaluatedCount:100,netHits:-1,roiDelta:-2,preregisteredGate:{requiredCount:100,minNetHits:0,minRoiDelta:0}},
 {candidateId:'c',evaluatedCount:31,preregisteredGate:{requiredCount:100}},
 {candidateId:'d',evaluatedCount:500}
]);
assert.strictEqual(out.productionChanged,false);assert.strictEqual(out.phaseComplete,true);
assert.strictEqual(out.rows[0].decisionGate.decision,'CANDIDATE_FOR_USER_APPROVAL');
assert.strictEqual(out.rows[1].decisionGate.decision,'REJECTED_BY_PREREGISTERED_GATE');
assert.strictEqual(out.rows[2].decisionGate.decision,'INSUFFICIENT_EVIDENCE');
assert.strictEqual(out.rows[3].decisionGate.decision,'INSUFFICIENT_EVIDENCE');
assert.strictEqual(out.audit.automaticProductionChanges,0);console.log('phase11 decision gate tests passed');
