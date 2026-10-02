'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const m = require('../scripts/build-hit-first-practical-report.cjs');
const row = (extra = {}) => ({ raceKey: '20260901-01-1', base: ['1-2-3', '1-2-4'], candidate: ['1-2-3', '1-3-2'], actual: '1-2-3', payout: 1000, ...extra });
test('hit', () => assert.equal(m.classify(['1-2-3'], '1-2-3'), 'hit'));
test('winning head absent', () => assert.equal(m.classify(['2-1-3'], '1-2-3'), 'headMissing'));
test('winning prefix absent', () => assert.equal(m.classify(['1-3-2'], '1-2-3'), 'pairMissing'));
test('third place absent', () => assert.equal(m.classify(['1-2-4'], '1-2-3'), 'thirdMissing'));
test('invalid ticket rejected', () => assert.throws(() => m.tickets(['1-1-2'])));
test('invalid count rejected', () => assert.throws(() => m.tickets([])));
test('maximum 10 enforced', () => assert.throws(() => m.tickets(Array(11).fill('1-2-3'))));
test('duplicate ticket rejected', () => assert.throws(() => m.tickets(['1-2-3', '1-2-3'])));
test('objects normalize safely', () => assert.deepEqual(m.tickets([{ ticket: '1-2-3' }]), ['1-2-3']));
test('zero denominator is null', () => assert.equal(m.pct(0, 0), null));
test('duplicate race rejected', () => assert.throws(() => m.compare([row(), row()])));
test('missing race key rejected', () => assert.throws(() => m.compare([row({ raceKey: '' })])));
test('larger budget not a like-for-like improvement', () => assert.throws(() => m.compare([row({ candidate: ['1-2-3', '1-2-4', '1-3-2'] })]), /different-ticket-budget/));
test('empty candidate cannot silently remove a losing race', () => assert.throws(() => m.compare([row({ candidate: [] })])));
test('negative payout rejected', () => assert.throws(() => m.compare([row({ payout: -1 })])));
test('noninteger payout rejected', () => assert.throws(() => m.compare([row({ payout: 1.2 })])));
test('missing actual is not a miss', () => assert.throws(() => m.compare([row({ actual: '' })])));
test('unsettled is not 0 percent', () => { const r = m.compare([]); assert.equal(r.primary.hitDecision, 'UNSETTLED'); assert.equal(r.primary.baseHitRate, null); });
test('identical tickets no change', () => assert.equal(m.compare([row({ candidate: ['1-2-4', '1-2-3'] })]).primary.hitDecision, 'NO_CHANGED_TICKETS'));
test('positive hit difference observed only', () => { const r = m.compare([row({ actual: '1-3-2' })]); assert.equal(r.primary.netHits, 1); assert.equal(r.primary.hitDecision, 'OBSERVED_HIT_GAIN_ONLY'); assert.equal(r.automaticApplication, false); assert.equal(r.adoptionStatus, 'NOT_APPROVED'); });
test('hit lost', () => assert.equal(m.compare([row({ actual: '1-2-4' })]).primary.hitDecision, 'HIT_RATE_WORSE'));
test('same hits with more money is not hit improvement', () => {
 const r = m.compare([row({ actual: '1-3-2', payout: 1190 }), row({ raceKey: '20260901-01-2', actual: '1-2-4', payout: 650 })]);
 assert.equal(r.primary.gains, 1); assert.equal(r.primary.losses, 1); assert.equal(r.primary.netHits, 0);
 assert.equal(r.secondary.profitDifferenceYen, 540); assert.equal(r.primary.hitDecision, 'NO_HIT_RATE_GAIN');
});
test('higher hits and lower money remain separate', () => {
 const r = m.compare([row({ actual: '1-3-2', payout: 100 }), row({ raceKey: '20260901-01-2', actual: '1-3-2', payout: 100 }), row({ raceKey: '20260901-01-3', actual: '1-2-4', payout: 10000 })]);
 assert.equal(r.primary.netHits, 1); assert.equal(r.primary.hitDecision, 'OBSERVED_HIT_GAIN_ONLY'); assert.equal(r.secondary.profitDifferenceYen, -9800); assert.equal(r.adoptionStatus, 'NOT_APPROVED');
});
test('odds and unrelated score cannot alter comparison', () => assert.deepEqual(m.compare([row()]), m.compare([row({ odds: 9999, score: 0 })])));
test('input is not mutated', () => { const rows = [row()]; const before = JSON.stringify(rows); m.compare(rows); m.diagnose(rows); assert.equal(JSON.stringify(rows), before); });
test('coverage buckets partition population', () => {
 const r = m.diagnose([row(), row({ raceKey: 'x2', base: ['2-1-3'] }), row({ raceKey: 'x3', base: ['1-3-2'] }), row({ raceKey: 'x4', base: ['1-2-4'] })]);
 assert.deepEqual(r.counts, { hit: 1, headMissing: 1, pairMissing: 1, thirdMissing: 1 }); assert.equal(r.byWinningBoat['1'].races, 4);
});
test('diagnosis rejects repeated race', () => assert.throws(() => m.diagnose([row(), row()])));
test('object tickets compare correctly', () => { const r = row({ base: [{ticket:'1-2-3'}, {ticket:'1-2-4'}] }); assert.equal(m.compare([r]).primary.baseHits, 1); });
test('absent shadow not zero', () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hit-first-')); try { assert.equal(m.loadShadow(dir, 'C', 'none.json').status, 'REPORT_UNAVAILABLE'); } finally { fs.rmSync(dir, { recursive: true }); } });
test('unsafe or inconsistent shadow blocked', () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hit-first-')); fs.mkdirSync(path.join(dir,'data/stats'), { recursive: true });
 const file = path.join(dir,'data/stats/x.json');
 try {
  fs.writeFileSync(file, JSON.stringify({ productionChanged: true })); assert.equal(m.loadShadow(dir,'A','x.json').status,'UNVERIFIED_SOURCE');
  fs.writeFileSync(file, JSON.stringify({ productionChanged: false, automaticApplication:false, adoptionStatus:'NOT_APPROVED', sourceDiagnostics:{complete:true}, counts:{settledRaces:1}, gains:0, losses:0, rows:[] }));
  assert.equal(m.loadShadow(dir,'A','x.json').reason,'shadow-count-mismatch');
 } finally { fs.rmSync(dir,{recursive:true}); }
});
