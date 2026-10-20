'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pointBudgetComparison: points, headAccuracyComparison: heads } = require('./frozen-comparison-fairness.cjs');

const row = (key = 'r1', extra = {}) => ({ key,
  current: { head: 1, tickets: ['1-2-3', '1-2-4'] },
  candidate: { head: 2, tickets: ['2-1-3', '2-1-4'] },
  result: { actual: '1-2-3', payout: 1000 }, ...extra });
test('more candidate tickets cannot create a comparable extra hit', () => {
  const r = row(); r.candidate.tickets.push('1-2-3');
  const out = points([r]);
  assert.equal(out.status, 'POINT_BUDGET_MISMATCH'); assert.equal(out.comparable, false);
  assert.deepEqual(out.budgetMismatches, [{ key: 'r1', baselineTicketCount: 2, candidateTicketCount: 3 }]);
  for (const field of ['gainedHits', 'lostHits', 'netHits', 'hitRateDelta']) assert.equal(out[field], null);
  assert.equal(out.baseline.hitRate, null); assert.equal(out.candidate.hitRate, null);
});
test('mismatches include pending and excluded rows, independent of results', () => {
  const pending = row('pending', { result: null }), refund = row('refund', { result: { excluded: 'refund-or-void' } });
  pending.candidate.tickets.pop(); refund.candidate.tickets.push('3-1-2');
  const out = points([row(), pending, refund]);
  assert.equal(out.replayedRaces, 3); assert.equal(out.budgetMismatchCount, 2);
  assert.deepEqual(out.budgetMismatches.map(r => r.key), ['pending', 'refund']);
  assert.equal(out.pendingRaces, 1); assert.equal(out.resultExcludedRaces, 1); assert.equal(out.netHits, null);
});
test('equal total stake cannot hide per-race budget mismatches', () => {
  const a = row('a'), b = row('b'); a.candidate.tickets.pop(); b.candidate.tickets.push('3-1-2');
  assert.equal(points([a, b]).budgetMismatchCount, 2);
});
test('equal budgets report gains, losses and rates over the identical settled races', () => {
  const out = points([row('loss'), row('gain', { result: { actual: '2-1-3' } }),
    row('pending', { result: null }), row('refund', { result: { actual: '2-1-3', excluded: 'refund-or-void' } })]);
  assert.equal(out.comparable, true); assert.equal(out.status, 'COMPARABLE');
  assert.equal(out.evaluatedRaces, 2); assert.equal(out.gainedHits, 1); assert.equal(out.lostHits, 1);
  assert.equal(out.netHits, 0); assert.equal(out.baseline.hitRate, 50); assert.equal(out.candidate.hitRate, 50);
  assert.equal(out.hitRateDelta, 0);
});
test('empty and unsettled comparisons have null rates and insufficient evidence', () => {
  for (const rows of [[], [row('pending', { result: {} })], [row('refund', { result: { excluded: 'refund' } })]])
    for (const fn of [points, heads]) {
      const out = fn(rows); assert.equal(out.status, 'INSUFFICIENT_EVIDENCE'); assert.equal(out.comparable, false);
      assert.equal(out.evaluatedRaces, 0); assert.equal(out.baseline.hitRate, null); assert.equal(out.hitRateDelta, null);
    }
});
test('head accuracy is separate from ticket coverage and ticket budgets', () => {
  const r = row(); r.current.head = 4; r.candidate.head = 2;
  r.current.tickets = ['4-3-5']; r.candidate.tickets = ['2-1-3', '1-3-4']; r.result.actual = '1-3-4';
  assert.equal(points([r]).status, 'POINT_BUDGET_MISMATCH');
  const out = heads([r]); assert.equal(out.comparable, true); assert.equal(out.changedHeadRaces, 1);
  assert.equal(out.baseline.hits, 0); assert.equal(out.candidate.hits, 0); assert.equal(out.netHits, 0);
});
test('head gain and loss use one valid main head per settled race', () => {
  const out = heads([row('loss'), row('gain', { result: { actual: '2-1-3' } }),
    row('same', { candidate: { head: 1 } }), row('pending', { result: null })]);
  assert.equal(out.evaluatedRaces, 3); assert.equal(out.gainedHits, 1); assert.equal(out.lostHits, 1);
  assert.equal(out.netHits, 0); assert.equal(out.changedHeadRaces, 2); assert.equal(out.unchangedHeadRaces, 1);
  assert.equal(out.changedHeadReplayed, 3); assert.equal(out.baseline.hits, 2); assert.equal(out.candidate.hits, 2);
});
for (const value of [undefined, null, '1', 0, 7, 1.5, NaN, Infinity]) test(`unknown/invalid head ${String(value)} is excluded rather than a miss`, () => {
  const r = row('unknown'); r.candidate.head = value;
  const out = heads([r, row('valid')]);
  assert.equal(out.evaluatedRaces, 1); assert.equal(out.headExcludedRaces, 1);
  assert.equal(out.headExclusions[0].key, 'unknown'); assert.equal(out.baseline.hits, 1);
  assert.equal(out.lostHits, 1);
});
test('head result is insufficient when every settled head is unknown', () => {
  const out = heads([row('unknown', { candidate: {} })]);
  assert.equal(out.status, 'INSUFFICIENT_EVIDENCE'); assert.equal(out.headExcludedRaces, 1);
  assert.equal(out.baseline.hitRate, null);
});
test('options select alternative models without requiring ticket data for head accuracy', () => {
  const rows = [{ raceKey: 'r1', a: { head: 1, tickets: [{ ticket: '1-2-3' }] },
    b: { head: 2, tickets: [{ ticket: '2-1-3' }] }, result: { actual: '2-1-3' } }];
  const options = { baselineKey: 'a', candidateKey: 'b' };
  assert.equal(points(rows, options).gainedHits, 1); assert.equal(heads(rows, options).gainedHits, 1);
});
test('malformed ticket lists and duplicate race keys fail closed', () => {
  for (const tickets of [undefined, [], ['1-1-2'], ['1-2-3', '1-2-3']]) {
    const r = row(); r.candidate.tickets = tickets;
    const out = points([r]); assert.equal(out.comparable, false); assert.equal(out.gainedHits, null);
    assert.equal(out.ticketInputIssues.length, 1);
  }
  for (const fn of [points, heads]) {
    const out = fn([row(), row()]); assert.equal(out.status, 'INVALID_COMPARISON_INPUT');
    assert.equal(out.inputIssues[0].reason, 'duplicate-race-key'); assert.equal(out.netHits, null);
  }
});
test('invalid results are excluded from both metrics', () => {
  for (const fn of [points, heads]) {
    const out = fn([row('bad', { result: { actual: '1-1-3' } }), row('valid')]);
    assert.equal(out.evaluatedRaces, 1); assert.equal(out.resultExcludedRaces, 1);
    assert.equal(out.resultExclusions[0].reason, 'invalid-result-ticket');
  }
});
test('two missing ticket lists do not establish equal budgets', () => {
  const out = points([row('unknown', { current: { head: 1 }, candidate: { head: 2 } })]);
  assert.equal(out.status, 'INVALID_COMPARISON_INPUT'); assert.equal(out.pointBudgetsEqual, null);
  assert.equal(out.comparable, false); assert.equal(out.netHits, null);
});
test('a sparse ticket array cannot manufacture an extra hit', () => {
  const r = row(); r.current.tickets = Array(1); r.candidate.tickets = ['1-2-3'];
  const out = points([r]); assert.equal(out.status, 'INVALID_COMPARISON_INPUT');
  assert.equal(out.comparable, false); assert.equal(out.gainedHits, null);
  assert.equal(out.ticketInputIssues[0].baselineReason, 'invalid-ticket-list');
});
test('ticket reordering is not a changed ticket set; inputs remain byte-identical', () => {
  const r = row(); r.candidate = { head: 1, tickets: [...r.current.tickets].reverse() };
  const rows = [r], before = JSON.stringify(rows);
  assert.equal(points(rows).changedTicketsReplayed, 0); heads(rows);
  assert.equal(JSON.stringify(rows), before);
});
test('non-array input and empty comparison keys are rejected', () => {
  for (const fn of [points, heads]) {
    assert.throws(() => fn(null), TypeError);
    assert.throws(() => fn([], { candidateKey: '' }), TypeError);
  }
});
