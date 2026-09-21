'use strict';
const assert = require('node:assert/strict');
const { capture } = require('./practical-selection-evidence');
const record = {raceKey:'20300914-23-1',selectedAt:'2030-09-14T06:00:00Z',deadlineAt:'2030-09-14T07:00:00Z',reviewEvidence:{predictionMode:'server_pre_deadline'}};
const baseline = [{ticket:'1-2-3'}, {ticket:'1-3-2'}];
const selection = {status:'selected',tickets:[...baseline].reverse(),
  candidateDecisions:[{ticket:'4-1-2',selected:false,reasonCode:'CANDIDATE_ONLY_EVALUATION',priorityScore:70,branchIds:['branch:4'],unrelated:'not stored'}],
  excludedCandidates:[{ticket:'4-1-2',reasonCode:'CANDIDATE_ONLY_EVALUATION'}],
  targetDecisions:[{boatNo:4,comparisonTicket:'1-2-3',candidateDecisions:[{ticket:'4-1-2',ticketSelected:false,reasonCode:'CANDIDATE_ONLY_EVALUATION'}]}],
  verificationEvidence:{generation:{logicFingerprint:'test-policy'}}};
const before = JSON.stringify({record,baseline,selection});
const saved = capture(record,baseline,selection);
assert.equal(saved.status,'captured');
assert.deepEqual(saved.practicalTickets,['1-2-3','1-3-2']);
assert.equal(saved.decisionCount,3);
assert.equal(saved.candidateDecisions[0].reasonCode,'CANDIDATE_ONLY_EVALUATION');
assert.equal(saved.candidateDecisions[0].unrelated,undefined);
assert.equal(saved.targetDecisions[0].comparisonTicket,'1-2-3');
assert.equal(saved.generation.logicFingerprint,'test-policy');
assert.equal(saved.productionChanged,false);
assert.equal(JSON.stringify({record,baseline,selection}),before);
selection.candidateDecisions[0].branchIds.push('changed');
record.reviewEvidence.predictionMode='changed';
assert.deepEqual(saved.candidateDecisions[0].branchIds,['branch:4']);
assert.equal(saved.reviewEvidence.predictionMode,'server_pre_deadline');
assert.equal(capture(record,baseline,null).status,'selection-unavailable');
for (const tickets of [[{ticket:'2-1-3'}], [{ticket:'1-2-3'},{ticket:'1-2-3'}], [{ticket:'1-1-3'}]]) {
  const bad = capture(record,baseline,{...selection,tickets});
  assert.equal(bad.status,'baseline-mismatch');
  assert.equal(bad.candidateDecisions,undefined);
}
const missing = capture(record,baseline,{tickets:baseline});
assert.equal(missing.decisionCount,0,'missing reasons must not be invented');
console.log('practical evidence: baseline identity, deep snapshot, all decision paths and missing reasons passed');
