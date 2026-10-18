'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {selectCandidate, summarize} = require('./escape-partner-structured-forward.cjs');

function fixture() {
  const tickets = [
    {ticket: '4-1-5', category: '本命'},
    {ticket: '1-2-3', category: '穴'},
    {ticket: '1-2-4', category: '穴'}
  ];
  const observations = [
    {ticket: '1-2-3', purchaseEligible: true, priorityScore: 82},
    {ticket: '1-2-4', purchaseEligible: true, priorityScore: 80},
    {
      ticket: '1-3-4', purchaseEligible: true, priorityScore: 90,
      validPurchaseBranchIds: ['h', 's', 't'],
      coverage: [
        {branchId: 'h', position: 1, boatNo: 1, role: 'alternate-head'},
        {branchId: 's', position: 2, boatNo: 3, role: 'hold'},
        {branchId: 't', position: 3, boatNo: 4, role: 'pickup'}
      ],
      physicalCoverage: [{position: 1, boatNo: 1, role: 'head'}]
    }
  ];
  return {prediction: {mainSheet: {honmei: {boatNo: 4}}, practicalTickets: tickets, practicalSelection: {candidateValidationEvidence: {
    status: 'captured', resultUsedForGeneration: false,
    finalSelectedTickets: tickets.map(row => row.ticket), observations,
    branches: ['h', 's', 't'].map(id => ({id, scenarioId: 'canonical:4'}))
  }}}};
}

test('replaces one duplicate-second ticket with a strictly higher same-scenario option', () => {
  const selected = selectCandidate(fixture());
  assert.equal(selected.changed, true);
  assert.equal(selected.removed, '1-2-4');
  assert.equal(selected.added, '1-3-4');
  assert.deepEqual(selected.tickets, ['4-1-5', '1-2-3', '1-3-4']);
});

test('fails closed for split scenarios, physical-only coverage, equal priority, protected donor and mismatched evidence', () => {
  const split = fixture();
  split.prediction.practicalSelection.candidateValidationEvidence.branches[2].scenarioId = 'other';
  assert.equal(selectCandidate(split).changed, false);
  const physicalOnly = fixture();
  physicalOnly.prediction.practicalSelection.candidateValidationEvidence.observations[2].coverage = [];
  assert.equal(selectCandidate(physicalOnly).changed, false);
  const equal = fixture();
  equal.prediction.practicalSelection.candidateValidationEvidence.observations[2].priorityScore = 80;
  assert.equal(selectCandidate(equal).changed, false);
  const protectedDonor = fixture();
  protectedDonor.prediction.practicalTickets[1].category = '流し';
  protectedDonor.prediction.practicalTickets[2].category = '本線';
  assert.equal(selectCandidate(protectedDonor).changed, false);
  const mismatch = fixture();
  mismatch.prediction.practicalSelection.candidateValidationEvidence.finalSelectedTickets = ['4-1-5'];
  assert.equal(selectCandidate(mismatch).reason, 'FINAL_TICKETS_MISMATCH');
});

test('fails closed when main head is one or evidence is invalid', () => {
  const headOne = fixture();
  headOne.prediction.mainSheet.honmei.boatNo = 1;
  assert.equal(selectCandidate(headOne).reason, 'MAIN_HEAD_NOT_ELIGIBLE');
  const invalid = fixture();
  invalid.prediction.practicalSelection.candidateValidationEvidence.status = 'invalid-or-unavailable';
  assert.equal(selectCandidate(invalid).reason, 'EVIDENCE_NOT_CAPTURED');
});

test('summary reports same-count return, gained and lost hits', () => {
  const rows = [
    {selection: {changed: true, reason: 'X'}, baselineTickets: ['1-2-3'], candidateTickets: ['1-3-2'], outcome: {ticket: '1-3-2', payout: 1000}},
    {selection: {changed: true, reason: 'X'}, baselineTickets: ['1-2-3'], candidateTickets: ['1-3-2'], outcome: {ticket: '1-2-3', payout: 500}}
  ];
  const summary = summarize(rows);
  assert.equal(summary.baseline.hits, 1);
  assert.equal(summary.candidate.hits, 1);
  assert.equal(summary.baseline.stakeYen, summary.candidate.stakeYen);
  assert.equal(summary.gainedHits, 1);
  assert.equal(summary.lostHits, 1);
});
