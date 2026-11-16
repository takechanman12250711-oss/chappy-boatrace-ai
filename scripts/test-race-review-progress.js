'use strict';
const assert = require('node:assert/strict');
const { exhibitionSnapshot } = require('./note-exhibition');
const { buildProgress } = require('./build-race-review-progress');
const method = 'a'.repeat(64);
function bundle(n, cohort = method) {
  const date = String(20300101 + Math.floor(n / 12)), raceNo = n % 12 + 1;
  const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  const capturedAt = iso + 'T01:00:00Z', deadlineAt = iso + 'T02:00:00Z';
  const raw = { entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
    startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.1, mappingSource: 'official-start-image' })) };
  const raceKey = `${date}-01-${raceNo}`;
  return { version: 'note-draft-bundle-v1', sourceCommit: 'b'.repeat(40),
    record: { raceKey, date, jcd: '01', raceNo, publicationPolicy: 'all-races-v1',
      selectedAt: capturedAt, deadlineAt, exhibitionSnapshot: exhibitionSnapshot(raw, capturedAt),
      reviewEvidence: { version: 'race-review-evidence-v1', method: cohort, predictionMode: 'server_pre_deadline', officialResultUsedForPrediction: false },
      prediction: { practicalTickets: ['1-2-3'], candidate24Tickets: ['1-2-3', '1-2-4'] } },
    generationAudit: { contentReady: true, auditedAt: capturedAt, raceKey }, baselinePracticalTickets: ['1-2-3'] };
}
function result(b, extra = {}) {
  return { date: b.record.date, jcd: '01', raceNo: b.record.raceNo, source: 'boatrace-official',
    resultAvailable: true, trifecta: { combination: '1-2-3', payout: 500 }, ...extra };
}
const original = bundle(0), before = JSON.stringify(original);
let report = buildProgress([original, original], [result(original)]);
assert.equal(report.captured, 1);
assert.equal(report.settled, 1);
assert.equal(report.cohorts[0].practical.hitRate, 100);
assert.equal(report.cohorts[0].practical.recoveryRate, 500);
assert.equal(report.cohorts[0].candidate24.recoveryRate, 250);
assert.equal(JSON.stringify(original), before, 'never rewrite a prediction');
for (const mutate of [b => delete b.record.exhibitionSnapshot,
  b => b.record.selectedAt = b.record.deadlineAt,
  b => b.generationAudit.auditedAt = b.record.deadlineAt,
  b => b.record.reviewEvidence.officialResultUsedForPrediction = true,
  b => b.record.prediction.practicalTickets = ['2-1-3'],
  b => b.record.raceKey = '20300101-02-1']) {
  const bad = structuredClone(original); mutate(bad);
  assert.equal(buildProgress([bad], [result(original)]).captured, 0);
}
const source = Array.from({ length: 105 }, (_, i) => bundle(i));
report = buildProgress(source, source.map(b => result(b)), { activeMethod: 'c'.repeat(64) });
assert.equal(report.cohorts[0].settled, 105, 'method changes do not delete historical results');
assert.equal(report.cohorts[0].completedWindows, 1);
assert.equal(report.cohorts[0].currentWindowCount, 5);
assert.equal(report.autoApply, false);
const next = bundle(106, 'c'.repeat(64));
report = buildProgress([...source, next], source.map(b => result(b)), { activeMethod: 'c'.repeat(64) });
assert.equal(report.cohorts.length, 2);
assert.equal(report.pending, 1);
assert.equal(report.settled, 105);
assert.equal(report.cohorts.find(g => g.active).practical.hitRate, null, 'pending is not a loss');
report = buildProgress([original], [result(original, { refund: true })]);
assert.equal(report.settled, 0);
assert.equal(report.cohorts[0].excludedRefundOrVoid, 1);
assert.equal(buildProgress([original], [result(original, { source: 'untrusted' })]).pending, 1);
report = buildProgress([original], [result(original, { trifecta: { combination: '1-2-3', payout: null } })]);
assert.equal(report.cohorts[0].unknownPayout, 1);
const legacy = structuredClone(original); delete legacy.record.reviewEvidence;
assert.equal(buildProgress([legacy], [result(legacy)]).cohorts[0].legacy, true);
const later = structuredClone(original); later.record.selectedAt = later.record.selectedAt.replace('01:00', '01:10');
later.record.prediction.practicalTickets = later.baselinePracticalTickets = ['1-2-4'];
report = buildProgress([original, later], [result(original)]);
assert.equal(report.settled, 1);
assert.equal(report.cohorts[0].practical.hits, 0, 'choose latest before deadline, not winning prediction');
assert.equal(report.cohorts[0].selectionLoss.counts['candidate-only-hit'], 1);
assert.equal(report.cohorts[0].selectionLoss.rows[0].selectedAt, later.record.selectedAt);
const diagnosisCases = [
  [['1-2-3'], ['1-2-3'], 'both-hit'],
  [['1-2-3'], ['1-3-2'], 'candidate-only-hit'],
  [['1-3-2'], ['1-2-3'], 'practical-only-hit'],
  [['2-1-3'], ['3-1-2'], 'candidate-head-missing'],
  [['1-3-2'], ['3-1-2'], 'candidate-first-second-pair-missing'],
  [['1-2-4'], ['3-1-2'], 'candidate-third-missing']
];
const diagnosticBundles = diagnosisCases.map(([pool, practical], i) => {
  const b = bundle(i);
  b.record.prediction.candidate24Tickets = pool;
  b.record.prediction.practicalTickets = b.baselinePracticalTickets = practical;
  b.record.prediction.practicalSelection = { targetDecisions: [{ candidateDecisions: [
    { ticket: '1-2-3', reasonCode: 'SAVED_REASON', reasonCodes: ['SAVED_REASON'] }
  ] }] };
  return b;
});
const diagnosticBefore = JSON.stringify(diagnosticBundles);
const previousMethod = bundle(7, 'c'.repeat(64)), old = bundle(8);
delete old.record.reviewEvidence;
report = buildProgress([...diagnosticBundles, previousMethod, old],
  [...diagnosticBundles, previousMethod, old].map(b => result(b)), { activeMethod: method });
const active = report.cohorts.find(g => g.active), loss = active.selectionLoss;
assert.equal(active.settled, 6);
assert.deepEqual(loss.rows.map(r => r.classification), diagnosisCases.map(c => c[2]));
assert.equal(loss.races, active.settled, 'diagnosis uses exactly the settled performance cohort');
assert.equal(Object.values(loss.counts).reduce((a, b) => a + b, 0), active.settled);
assert.equal(loss.counts['both-hit'] + loss.counts['candidate-only-hit'], active.candidate24.hits);
assert.equal(loss.counts['both-hit'] + loss.counts['practical-only-hit'], active.practical.hits);
assert.equal(loss.netHitDifference, 0, 'net zero must not hide one candidate-only omission');
assert.equal(loss.nonSubsetRaces, 5, 'practical tickets need not be a subset of candidate tickets');
assert.equal(loss.recordedDecisionReasons.SAVED_REASON, 1, 'deduplicate recorded reasons');
assert.equal(loss.candidateOnlyReturn, 500);
assert.equal(loss.practicalOnlyReturn, 500);
assert.equal(report.cohorts.length, 3, 'active, old method and legacy remain separate');
assert.equal(report.cohorts.find(g => g.legacy).selectionLoss.races, 1);
assert.equal(JSON.stringify(diagnosticBundles), diagnosticBefore, 'classification never changes saved tickets');
for (const extra of [{ refund: true }, { void: true }, { source: 'untrusted' },
  { resultAvailable: false }, { trifecta: { combination: '1-2-3', payout: null } }]) {
  const excluded = buildProgress([original], [result(original, extra)]).cohorts[0];
  assert.equal(excluded.selectionLoss.races, 0, 'unsettled/invalid evidence must never be classified as a loss');
}
const badEvidence = structuredClone(original); delete badEvidence.record.exhibitionSnapshot;
assert.equal(buildProgress([badEvidence], [result(original)]).cohorts.length, 0);
// Capture the producer's real schema; intermediate flags can contradict final selection.
const { capture } = require('./practical-selection-evidence');
const diagnosed = structuredClone(original);
diagnosed.record.practicalSelectionEvidence = capture(diagnosed.record, ['1-2-3'], {
  tickets: ['1-2-3'], candidateDecisions: [
    { ticket: '1-2-3', selected: false, reasonCode: 'INTERMEDIATE_EXCLUSION' },
    { ticket: '1-2-4', selected: true, reasonCode: 'INTERMEDIATE_SELECTION' },
    { ticket: '1-2-4', selected: true, reasonCode: 'INTERMEDIATE_SELECTION' },
    { ticket: '6-5-4', selected: false, reasonCode: 'OUTSIDE_ORDINARY_POOL' }
  ], excludedCandidates: [{ ticket: '1-2-3', selected: false }],
  targetDecisions: [{ candidateDecisions: [{ ticket: '1-2-4', selected: true }] }]
});
const diagnosedBefore = JSON.stringify(diagnosed);
const runDiagnosis = (b, actual = '1-2-3') => buildProgress([b, b], [result(b, {
  trifecta: { combination: actual, payout: 500 }
})]).cohorts[0];
const nullHistory = structuredClone(diagnosed);
nullHistory.record.practicalSelectionEvidence.candidateDecisions.push(null);
nullHistory.record.practicalSelectionEvidence.excludedCandidates.push(null);
nullHistory.record.practicalSelectionEvidence.targetDecisions[0].candidateDecisions.push(null);
assert.equal(runDiagnosis(nullHistory).selectionLoss.rows[0].practicalSelectionEvidence.status, 'validated', 'null stage rows are ignored without losing a valid forecast');
let checked = runDiagnosis(diagnosed);
let evidence = checked.selectionLoss.rows[0].practicalSelectionEvidence;
assert.equal(evidence.status, 'validated');
assert.equal(evidence.actualFinalDisposition, 'selected');
assert.equal(evidence.actualDecisionHistory[0].decision.selected, false);
assert.equal(evidence.actualDecisionHistory[0].source, 'candidateDecisions[0]');
assert.equal(evidence.actualDecisionHistory.length, 2);
assert.equal(Object.hasOwn(evidence, 'stageHistory'), false, 'raw all-permutation history stays in immutable source, not frontend report');
assert.deepEqual(evidence.finalPracticalTickets, ['1-2-3']);
assert.equal(checked.settled, 1, 'duplicate stage rows and snapshots never inflate races');
assert.equal(checked.selectionLoss.rows[0].candidateTicketCount, 2, 'all-permutation history is not the candidate pool');
checked = runDiagnosis(diagnosed, '1-2-4');
assert.equal(checked.selectionLoss.rows[0].practicalSelectionEvidence.actualFinalDisposition, 'not-selected');
assert.equal(checked.selectionLoss.rows[0].practicalSelectionEvidence.actualDecisionHistory.length, 3, 'keep duplicate actual-ticket stage observations without counting extra races');
assert.ok(checked.selectionLoss.rows[0].practicalSelectionEvidence.actualDecisionHistory.every(r => r.decision.ticket === '1-2-4'), 'omit unrelated permutation history');
assert.deepEqual(checked.selectionLoss.recordedDecisionReasons, { 'reason-not-recorded': 1 }, 'stage codes must not become final exclusion causes');
assert.equal(JSON.stringify(diagnosed), diagnosedBefore);
for (const [mutate, reason] of [
  [e => e.version = 'future', 'unsupported-evidence'],
  [e => e.status = 'baseline-mismatch', 'unsupported-evidence'],
  [e => e.resultUsedForGeneration = true, 'unsupported-evidence'],
  [e => e.productionChanged = true, 'unsupported-evidence'],
  [e => e.raceKey = '20300101-02-1', 'identity-mismatch'],
  [e => e.selectedAt = '2030-01-01T01:10:00Z', 'identity-mismatch'],
  [e => e.deadlineAt = '2030-01-01T03:00:00Z', 'identity-mismatch'],
  [e => e.reviewEvidence.method = 'c'.repeat(64), 'method-mismatch'],
  [e => e.reviewEvidence.officialResultUsedForPrediction = true, 'method-mismatch'],
  [e => delete e.reviewEvidence, 'method-mismatch'],
  [e => e.practicalTickets = ['1-2-4'], 'baseline-mismatch'],
  [e => e.practicalTickets = ['1-2-3', '1-2-3'], 'baseline-mismatch'],
  [e => e.targetDecisions = [{}], 'invalid-history']
]) {
  const bad = structuredClone(diagnosed); mutate(bad.record.practicalSelectionEvidence);
  const check = runDiagnosis(bad);
  assert.deepEqual(check.selectionLoss.rows[0].practicalSelectionEvidence, { status: 'rejected', reason });
  assert.deepEqual(check.practical, runDiagnosis(original).practical, 'bad optional diagnostics cannot exclude a valid forecast or alter metrics');
}
assert.equal(Object.hasOwn(runDiagnosis(original).selectionLoss.rows[0], 'practicalSelectionEvidence'), false, 'legacy report shape is unchanged');
console.log('selection evidence: identity, final dispositions, separate stage history, fail-closed diagnostics and unchanged metrics passed');
console.log('selection loss: six classes, exact cohort, historical separation, exclusions and immutable evidence passed');
console.log('race review: pre-race evidence, immutable tickets, deduplication, method retention, 100R boundaries, pending/refund/payout passed');

{
  const { assess, prepareBundles, buildPrepared, classify, summarizeLosses, actualSelectionDiagnostic } = require('./build-race-review-progress');
  const { buildReport: performanceReport } = require('./build-candidate24-report');
  // Frozen pre-streaming implementation: a regression oracle for preparation,
  // tie order, counters, complete accounting and original history indexes.
function legacyBuildProgress(bundles, results, { generatedAt = new Date().toISOString(), activeMethod = '' } = {}) {
  const excluded = {}, selected = new Map();
  for (const bundle of bundles) {
    const item = assess(bundle);
    if (item.reason) { excluded[item.reason] = (excluded[item.reason] || 0) + 1; continue; }
    // A race is counted once, using its latest valid pre-deadline snapshot.
    const previous = selected.get(item.row.raceKey);
    if (!previous || item.saved > previous.saved || (item.saved === previous.saved && item.method < previous.method)) selected.set(item.row.raceKey, item);
  }
  const groups = new Map();
  for (const item of selected.values()) {
    if (!groups.has(item.method)) groups.set(item.method, []);
    groups.get(item.method).push(item.row);
  }
  const cohorts = [...groups].map(([method, rows]) => {
    const diagnostics = [];
    const report = performanceReport(rows, results, ({ row, pool, practical, result }) => {
      const actual = result.trifecta.combination;
      diagnostics.push({ raceKey: row.raceKey, selectedAt: row.selectedAt, actual,
        payoutPer100: result.trifecta.payout, classification: classify(pool, practical, actual),
        candidateTicketCount: pool.length, practicalTicketCount: practical.length,
        practicalOutsideCandidate: practical.filter(t => !pool.includes(t)),
        recordedDecisionReasons: row.selectionReasons[actual] || [],
        ...(row.practicalSelectionEvidence ? { practicalSelectionEvidence:
          actualSelectionDiagnostic(row.practicalSelectionEvidence, actual, pool) } : {}) });
    });
    diagnostics.sort((a, b) => a.selectedAt.localeCompare(b.selectedAt) || a.raceKey.localeCompare(b.raceKey));
    const count = report.practical.races;
    return { method, legacy: method.startsWith('legacy:'), active: method === `method:${activeMethod}`,
      latestPredictionAt: rows.map(r => r.selectedAt).sort().at(-1), captured: rows.length,
      settled: count, pending: report.pending, excludedRefundOrVoid: report.excludedRefundOrVoid,
      unknownPayout: report.unknownPayout, completedWindows: Math.floor(count / 100),
      currentWindowCount: count % 100, nextReviewAt: (Math.floor(count / 100) + 1) * 100,
      from: report.from, to: report.to, practical: report.practical, candidate24: report.candidate24,
      selectionLoss: summarizeLosses(diagnostics) };
  }).sort((a, b) => b.latestPredictionAt.localeCompare(a.latestPredictionAt) || a.method.localeCompare(b.method));
  return { version: 'race-review-progress-v1', generatedAt, reviewSize: 100, unitYen: 100,
    predictionLogicChanged: false, autoApply: false, approvalRequired: true,
    selectionLossContract: { version: 'race-review-selection-loss-v1', diagnosticOnly: true,
      basis: 'Same settled cohort as race-review-progress; stored candidate tickets only.',
      limitation: 'Missing tickets and saved decision reasons describe observations, not proven causes. Net hit difference is not gross selection omissions.' },
    captured: selected.size, settled: cohorts.reduce((sum, g) => sum + g.settled, 0),
    pending: cohorts.reduce((sum, g) => sum + g.pending, 0), excluded, cohorts };
}
  assert.equal(require('node:crypto').createHash('sha256').update(legacyBuildProgress.toString()).digest('hex'),
    'b6744efc5f8f8f7cfba9dae414ac761a8d544a97a1906bb3cff1e0ab90a1d37b', 'the pre-streaming oracle is fixed without Git history');
  const equalFirst=bundle(2),equalSecond=bundle(2);
  equalFirst.record.prediction.practicalTickets=equalFirst.baselinePracticalTickets=['1-2-4'];
  const tiedHigh=bundle(1,'c'.repeat(64)),tiedLow=bundle(1);
  const invalidAudit=bundle(3);invalidAudit.generationAudit.contentReady=false;
  const invalidIdentity=bundle(4);invalidIdentity.record.raceKey='wrong';
  const unknownPayout=bundle(5),refunded=bundle(6),pending=bundle(7);
  const pendingLegacy=bundle(9);delete pendingLegacy.record.reviewEvidence;
  const input=[diagnosed,tiedHigh,tiedLow,equalFirst,equalSecond,invalidAudit,invalidIdentity,
    unknownPayout,refunded,pending,pendingLegacy,later,original];
  input[0]=structuredClone(input[0]);
  input[0].record.prediction.unusedHugeTree={marker:'DO_NOT_RETAIN_UNNEEDED_PREDICTION',padding:'x'.repeat(16384)};
  const inputBefore=JSON.stringify(input);
  const results=[result(diagnosed),result(tiedLow),result(equalFirst),
    result(unknownPayout,{trifecta:{combination:'1-2-3',payout:null}}),result(refunded,{refund:true})];
  const options={generatedAt:'2030-01-20T00:00:00.000Z',activeMethod:method};
  const expected=legacyBuildProgress(input,results,options);
  assert.deepEqual(buildProgress(input,results,options),expected,'public API exactly matches the frozen prior implementation');
  let scanned=0;
  function* sources(){for(const b of input){scanned++;yield b;}}
  const prepared=prepareBundles(sources());
  assert.equal(scanned,input.length,'prepare every source, including invalid snapshots');
  assert.deepEqual(buildPrepared(prepared,results,options),expected,'incremental prepared output keeps the complete prior report shape');
  assert.deepEqual(prepared.excluded,{auditUnconfirmed:1,invalidIdentity:1});
  assert.equal(prepared.selected.get(tiedLow.record.raceKey).method,'method:'+method,'method tie-break stays lexical');
  assert.deepEqual(prepared.selected.get(equalFirst.record.raceKey).row.prediction.practicalTickets,['1-2-4'],'identical method/time keeps first input');
  assert.equal(JSON.stringify([...prepared.selected.values()]).includes('DO_NOT_RETAIN_UNNEEDED_PREDICTION'),false,'only assessed report rows survive');
  assert.equal(JSON.stringify(input),inputBefore,'audit, tickets, full saved history and original sources stay unchanged');
  console.log('streaming preparation: complete legacy output, latest/ties, invalid counters, unknown/pending/refund and immutable history passed');
}

(async () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { refresh } = require('./refresh-race-review-results');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'race-review-'));
  try {
    const b = bundle(0), dir = path.join(root, 'data/note-drafts', b.record.date);
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(b));
    const now = Date.parse(b.record.deadlineAt) + 3600000;
    let ledger = await refresh(root, { now, fetchResult: async () => ({ ...result(b), ok: true, jcd: '02' }) });
    assert.equal(Object.keys(ledger.races).length, 0, 'never settle another race');
    assert.equal(ledger.attempts[b.record.raceKey].status, 'retry');
    ledger = await refresh(root, { now, fetchResult: async () => ({ ...result(b), ok: true }) });
    assert.equal(Object.keys(ledger.races).length, 1);
    await refresh(root, { now, fetchResult: async () => { throw new Error('completed results must be reused'); } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/stats/race-review-results.json'))).races[b.record.raceKey].trifecta.payout, 500);
    console.log('independent official settlement: identity, retries, saved results and no repeated fetch passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
