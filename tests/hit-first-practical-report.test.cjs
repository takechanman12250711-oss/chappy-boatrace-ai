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

// Frozen captures must not inherit the latest-day discovery/preference rules.
const zlib = require('node:zlib');
const archive = require('../scripts/daily-prediction-source-archive');
const ledgerHelpers = require('../scripts/build-continuous-performance-ledger.cjs');
const frozenSource = require('../scripts/eight-ticket-promotion-report-source.cjs');
const DATE = '20300925';
function writeFixture(root, file, value) {
 const full = path.join(root, file); fs.mkdirSync(path.dirname(full), { recursive: true });
 fs.writeFileSync(full, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value));
}
function frozenFixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hit-first-frozen-'));
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 const records = Array.from({ length: 100 }, (_, i) => ({
  raceKey: `${DATE}-${String(Math.floor(i / 12) + 1).padStart(2, '0')}-${i % 12 + 1}`,
  selectedAt: '2030-09-25T00:00:00.000Z', deadlineAt: '2030-09-25T00:10:00.000Z',
  prediction: {
   practicalTickets: ['2-4-3', '1-2-3', '1-2-4', '1-3-2', '1-3-4', '2-1-3', '2-3-1', '3-2-1'],
   practicalSelection: { candidateOutcomes: [{ ticket: '2-4-3' }, { ticket: '3-4-2' }] },
   verificationEvidence: { generation: { logicFingerprint: 'fixture-logic', confidenceDefinitionVersion: 'fixture-confidence', ticketPolicyVersion: 'fixture-policy' } },
   preRaceConditions: { schemaVersion: 4, source: 'boatrace-official', sourceTiming: 'pre_deadline',
    sourceFetchedAt: '2030-09-24T23:59:00.000Z', officialResultUsed: false }
  }
 }));
 const rows = records.map(r => ({ raceKey: r.raceKey, selectedAt: r.selectedAt,
  generationKey: ledgerHelpers.generationOf(r), ticketCount: 8, actualTicket: '2-4-3', hit: true, stakeYen: 800, returnYen: 3840 }));
 const ledger = { analysisId: 'continuous-performance-ledger-v1', generatedAt: '2030-09-25T01:00:00.000Z',
  policy: { stakePerTicketYen: 100 }, rows, rolling100: ledgerHelpers.summary(rows) };
 const daily = { date: DATE, updatedAt: '2030-09-25T00:01:00.000Z', predictions: [], verificationPredictions: records };
 writeFixture(root, 'data/stats/continuous-performance-ledger.json', ledger);
 writeFixture(root, `data/results/${DATE}.json`, { date: DATE, races: rows.map(r => ({ raceKey: r.raceKey,
  resultSource: 'boatrace-official', resultAvailable: true, trifecta: { combination: r.actualTicket, payout: 3840 } })) });
 const save = () => writeFixture(root, `data/predictions/${DATE}.json`, daily);
 save(); return { root, records, daily, ledger, save };
}
function archiveFixture(root, daily) {
 const raw = Buffer.from(JSON.stringify(daily)), compressed = zlib.gzipSync(raw);
 const metadata = archive.metadataFor({ date: DATE, raw, archive: compressed, parsed: daily });
 writeFixture(root, `data/predictions/source-archives/${DATE}.json.gz`, compressed);
 writeFixture(root, `data/predictions/source-archives/${DATE}.meta.json`, metadata);
 return metadata;
}
function nextCapture(original) {
 const later = structuredClone(original); later.selectedAt = '2030-09-25T00:05:00.000Z';
 later.prediction.practicalTickets.pop(); return later;
}
function assertComplete(report, ledger) {
 assert.equal(report.source.complete, true); assert.equal(report.source.expectedRaces, 100);
 assert.equal(report.source.verifiedRaces, 100); assert.deepEqual(report.source.failures, []);
 assert.deepEqual(report.source.frozenRaceKeys, ledger.rows.map(r => r.raceKey));
 assert.deepEqual(report.baseline.verified, ledger.rolling100);
 assert.equal(report.productionChanged, false); assert.equal(report.automaticApplication, false);
 assert.equal(report.adoptionStatus, 'NOT_APPROVED');
}
test('frozen original survives a newer archive capture without changing latest-source discovery', t => {
 const f = frozenFixture(t), original = structuredClone(f.records[0]);
 const newer = structuredClone(f.daily); newer.updatedAt = '2030-09-25T00:06:00.000Z';
 newer.verificationPredictions[0] = nextCapture(original); archiveFixture(f.root, newer);
 assert.equal(frozenSource.readDay(f.root, DATE).data.verificationPredictions[0].selectedAt, newer.verificationPredictions[0].selectedAt);
 const ledgerPath = path.join(f.root, 'data/stats/continuous-performance-ledger.json'), before = fs.readFileSync(ledgerPath);
 const out = m.build(f.root); assertComplete(out, f.ledger);
 assert.deepEqual(out.details[0].base, original.prediction.practicalTickets);
 assert.equal(out.source.captureEvidence[0].matches.length, 1);
 assert.equal(out.source.captureEvidence[0].matches[0].source, 'raw');
 assert.match(out.source.sources[0].sourceSha256, /^[a-f0-9]{64}$/);
 assert.deepEqual(fs.readFileSync(ledgerPath), before);
});
test('later primary row cannot hide original verification capture in the same day', t => {
 const f = frozenFixture(t); f.daily.predictions = [nextCapture(f.records[0])]; f.save();
 assertComplete(m.build(f.root), f.ledger);
});
test('missing frozen original fails instead of substituting a later capture', t => {
 const f = frozenFixture(t); f.records[0] = nextCapture(f.records[0]); f.save();
 const out = m.build(f.root); assert.equal(out.source.complete, false); assert.equal(out.source.expectedRaces, 100);
 assert.equal(out.source.verifiedRaces, 99); assert.equal(out.source.failures[0].reason, 'missing-frozen-capture');
});
test('identical duplicate captures in both arrays and both sources are accepted once', t => {
 const f = frozenFixture(t); f.daily.predictions = [structuredClone(f.records[0])]; f.save(); archiveFixture(f.root, f.daily);
 const out = m.build(f.root); assertComplete(out, f.ledger);
 assert.equal(out.source.captureEvidence[0].matches.length, 4);
 assert.equal(new Set(out.source.captureEvidence[0].matches.map(e => e.verifierEvidenceSha256)).size, 1);
});
test('unused display compaction and post-race annotations do not conflict', t => {
 const f = frozenFixture(t), duplicate = structuredClone(f.records[0]);
 duplicate.prediction.raceFlow = { comment: 'display-only' }; duplicate.result = { review: { generatedAt: 'later' } };
 duplicate.prediction.practicalTickets = duplicate.prediction.practicalTickets.map(ticket => ({ ticket, odds: 6.3, oddsText: '6.3倍', hasOdds: true }));
 f.daily.predictions = [duplicate]; f.save(); const out = m.build(f.root); assertComplete(out, f.ledger);
 const evidence = out.source.captureEvidence[0].matches;
 assert.notEqual(evidence[0].recordSha256, evidence[1].recordSha256);
 assert.equal(evidence[0].verifierEvidenceSha256, evidence[1].verifierEvidenceSha256);
});
for (const [name, change] of [
 ['nonwinning ticket with identical accounting', r => { r.prediction.practicalTickets[7] = '3-1-2'; }],
 ['ticket order', r => { r.prediction.practicalTickets.reverse(); }],
 ['ticket role evidence', r => { r.prediction.practicalTickets[0] = { ticket: r.prediction.practicalTickets[0], roleEvidence: 'changed' }; }],
 ['deadline', r => { r.deadlineAt = '2030-09-25T00:09:00.000Z'; }],
 ['source evidence', r => { r.prediction.preRaceConditions.sourceFetchedAt = '2030-09-24T23:58:00.000Z'; }],
 ['generation', r => { r.prediction.verificationEvidence.generation.ticketPolicyVersion = 'changed'; }],
 ['verification evidence', r => { r.prediction.verificationEvidence.changed = true; }],
 ['result-use flag', r => { r.officialResultUsedForEvaluation = true; }],
 ['candidate pool with unchanged hit membership', r => { r.prediction.practicalSelection.candidateOutcomes[1].ticket = '3-2-4'; }],
 ['candidate metadata', r => { r.prediction.practicalSelection.candidateOutcomes[0].roleEvidence = 'changed'; }],
 ['candidate string versus ticket object', r => { r.prediction.practicalSelection.candidateOutcomes[0] = '2-4-3'; }],
 ['missing versus empty candidate pool', r => { delete r.prediction.practicalSelection.candidateOutcomes; }]
]) test(`conflicting duplicate ${name} fails closed`, t => {
 const f = frozenFixture(t);
 if (name === 'missing versus empty candidate pool') { f.records[0].prediction.practicalSelection.candidateOutcomes = []; f.save(); }
 const newer = structuredClone(f.daily); change(newer.verificationPredictions[0]);
 archiveFixture(f.root, newer); const out = m.build(f.root);
 assert.equal(out.source.complete, false); assert.equal(out.source.verifiedRaces, 99);
 assert.equal(out.source.failures[0].reason, 'conflicting-frozen-capture');
});
for (const [name, change, reason] of [
 ['late capture', r => { r.deadlineAt = r.selectedAt; }, 'captured-at-or-after-deadline'],
 ['late source fetch', r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; }, 'source-fetched-at-or-after-deadline'],
 ['source fetched after capture', r => { r.prediction.preRaceConditions.sourceFetchedAt = '2030-09-25T00:01:00.000Z'; }, 'source-fetched-after-capture'],
 ['changed generation', r => { r.prediction.verificationEvidence.generation.ticketPolicyVersion = 'changed'; }, 'generation-mismatch'],
 ['changed ticket count', r => { r.prediction.practicalTickets.pop(); }, 'ledger-row-mismatch'],
 ['retrospective evidence', r => { r.isRetrospective = true; }, 'retrospective-record']
]) test(`single matched capture still rejects ${name}`, t => {
 const f = frozenFixture(t); change(f.records[0]); f.save(); const out = m.build(f.root);
 assert.equal(out.source.complete, false); assert.equal(out.source.failures[0].reason, reason);
});
for (const corrupt of ['archive', 'source-hash', 'missing-pair']) test(`frozen lookup fails on ${corrupt} even with a newer valid raw source`, t => {
 const f = frozenFixture(t), metadata = archiveFixture(f.root, f.daily);
 f.daily.updatedAt = '2030-09-25T00:09:00.000Z'; f.save();
 if (corrupt === 'archive') writeFixture(f.root, `data/predictions/source-archives/${DATE}.json.gz`, 'broken');
 if (corrupt === 'source-hash') { metadata.sourceSha256 = '0'.repeat(64); writeFixture(f.root, `data/predictions/source-archives/${DATE}.meta.json`, metadata); }
 if (corrupt === 'missing-pair') fs.unlinkSync(path.join(f.root, `data/predictions/source-archives/${DATE}.meta.json`));
 const out = m.build(f.root); assert.equal(out.source.complete, false); assert.equal(out.source.sourceErrors.length, 1);
});
test('47 duplicate captures with observed post-result annotations preserve all 100 frozen rows', t => {
 const f = frozenFixture(t), newer = structuredClone(f.daily);
 for (const r of newer.verificationPredictions.slice(0, 47)) {
  r.result = { review: { generatedAt: '2030-09-25T01:00:00.000Z' }, missCauseAnalysis: { status: 'candidates-recorded' } };
  r.theoryEvaluationSnapshot = { status: 'evaluated' };
  r.scenarioAiV6Verification = { version: 'shadow' };
 }
 newer.verificationPredictions[47] = nextCapture(newer.verificationPredictions[47]);
 archiveFixture(f.root, newer); const out = m.build(f.root); assertComplete(out, f.ledger);
 assert.equal(out.source.captureEvidence[47].matches.length, 1);
 for (const evidence of out.source.captureEvidence.slice(0, 47)) {
  assert.equal(evidence.matches.length, 2);
  assert.notEqual(evidence.matches[0].recordSha256, evidence.matches[1].recordSha256);
  assert.equal(evidence.matches[0].verifierEvidenceSha256, evidence.matches[1].verifierEvidenceSha256);
 }
});
test('deterministic precedence returns one intact record with its own odds and metadata', t => {
 const f = frozenFixture(t), primary = structuredClone(f.records[0]);
 primary.prediction.practicalTickets = primary.prediction.practicalTickets.map(ticket => ({ ticket, odds: 6.3, oddsText: '6.3倍', hasOdds: true }));
 primary.prediction.raceFlow = { comment: 'original primary display' };
 f.daily.predictions = [primary]; f.save();
 const later = structuredClone(f.daily); later.predictions[0].prediction.practicalTickets[0].odds = 99;
 archiveFixture(f.root, later);
 const resolved = frozenSource.readFrozenDay(f.root, DATE, f.ledger.rows).captures.get(primary.raceKey);
 assert.equal(resolved.conflict, false); assert.deepEqual(resolved.record, primary);
 assert.equal(resolved.evidence[0].source, 'raw'); assert.equal(resolved.evidence[0].sourceArray, 'predictions');
 assert.equal(resolved.record.prediction.practicalTickets[0].odds, 6.3);
});
