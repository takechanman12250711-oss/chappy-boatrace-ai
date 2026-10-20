'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const collector = require('./collect-predictions');

const practical = [{ ticket: '1-2-3', category: '本線', odds: 0 }, { ticket: '1-2-4', category: '押さえ', odds: 0 }];
const item = { jcd: '01', place: '桐生', raceNo: 1, capturedAt: '2030-09-25T00:00:00.000Z',
  deadlineAt: '2030-09-25T00:10:00.000Z', raceData: {}, rawRaceData: {}, shadowRaceData: {},
  type: '本線', score: 82, evaluation: { ready: true } };
function prediction() {
  return { mainSheet: { honmei: { boatNo: 1 }, tickets: [...structuredClone(practical), { ticket: '1-3-2', odds: 0 }] },
    raceFlow: {}, confidence: { score: 82 }, manshuPower: { score: 10 } };
}
function dependencies(extra = {}) {
  return { createPrediction: prediction, createPracticalSelection: () => structuredClone(practical),
    shadowBuilder: () => null, scenarioLikelihoodAnalyzer: () => null, coreApi: {}, ...extra };
}
function build(extra) {
  return collector.buildStoredPrediction('20300925', item, false, item.capturedAt, dependencies(extra));
}

test('initial capture reuses generated plans and the existing selection exactly once', t => {
  const selector = global.ChappyPracticalSelection, originalSelect = selector.select;
  const generator = global.ChappyNoteGenerator, originalDisplay = generator.createDisplayCandidates;
  let selectCalls = 0, displayCalls = 0, predictionCalls = 0;
  t.after(() => { selector.select = originalSelect; generator.createDisplayCandidates = originalDisplay; });
  selector.select = () => { selectCalls++; return { status: 'selected', tickets: structuredClone(practical) }; };
  generator.createDisplayCandidates = (p, tickets) => { displayCalls++; return originalDisplay(p, tickets); };
  const options = dependencies({ createPrediction() { predictionCalls++; return prediction(); } });
  delete options.createPracticalSelection;
  const out = collector.buildStoredPrediction('20300925', item, false, item.capturedAt, options);
  assert.equal(predictionCalls, 1); assert.equal(selectCalls, 1); assert.equal(displayCalls, 1);
  assert.deepEqual(out.prediction.candidate24Tickets.map(t => t.ticket), ['1-2-3', '1-2-4', '1-3-2']);
  assert.deepEqual(out.prediction.practicalTickets, practical);
  assert.equal(out.prediction.confidence.score, 82);
  assert.equal(out.selectedAt, item.capturedAt); assert.equal(out.deadlineAt, item.deadlineAt);
  assert.equal(out.prediction.predictionMode, 'server_pre_deadline_shadow');
  assert.equal(out.practicalSelectionEvidence, undefined); assert.equal(out.reviewEvidence, undefined);
});
test('carry-forward preserves the saved candidate24 without regeneration or input mutation', t => {
  const out = build(), before = JSON.stringify(out), generator = global.ChappyNoteGenerator;
  const originalDisplay = generator.createDisplayCandidates, originalSelect = global.ChappyPracticalSelection.select;
  t.after(() => { generator.createDisplayCandidates = originalDisplay; global.ChappyPracticalSelection.select = originalSelect; });
  generator.createDisplayCandidates = () => { throw Error('carry-forward must not regenerate candidates'); };
  global.ChappyPracticalSelection.select = () => { throw Error('carry-forward must not select'); };
  const once = collector.compactStoredVerification(out), twice = collector.compactStoredVerification(once);
  assert.deepEqual(once.prediction.candidate24Tickets, out.prediction.candidate24Tickets);
  assert.deepEqual(twice, once); assert.equal(JSON.stringify(out), before);
});
test('legacy missing candidate24 remains absent through repeated compaction', () => {
  const old = { raceKey: '20300925-01-1', selectedAt: item.capturedAt,
    prediction: { practicalTickets: structuredClone(practical), mainSheet: {} } };
  const before = JSON.stringify(old), once = collector.compactStoredVerification(old);
  assert.equal(Object.hasOwn(once.prediction, 'candidate24Tickets'), false);
  assert.equal(Object.hasOwn(collector.compactStoredVerification(once).prediction, 'candidate24Tickets'), false);
  assert.equal(JSON.stringify(old), before);
});
for (const [label, builder] of [
  ['unavailable', undefined], ['throwing', () => { throw Error('fixture unavailable'); }],
  ['nonarray', () => ({ ticket: '1-2-3' })], ['null', () => null]
]) test(`display projection ${label} leaves coverage missing without changing predictions`, () => {
  const out = build({ createDisplayCandidates: builder });
  assert.equal(Object.hasOwn(out.prediction, 'candidate24Tickets'), false);
  assert.deepEqual(out.prediction.practicalTickets, practical);
  assert.equal(out.prediction.confidence.score, 82); assert.equal(out.selectedAt, item.capturedAt);
  assert.equal(out.prediction.predictionMode, 'server_pre_deadline_shadow');
});
test('a successfully projected empty display pool is retained as an explicit empty array', () => {
  const out = build({ createDisplayCandidates: () => [] });
  assert.equal(Object.hasOwn(out.prediction, 'candidate24Tickets'), true);
  assert.deepEqual(out.prediction.candidate24Tickets, []);
  assert.deepEqual(collector.compactStoredVerification(out).prediction.candidate24Tickets, []);
});
test('initial candidate capture is detached from the projection result', () => {
  const generated = [{ ticket: '1-3-2', odds: 0, roleLabels: [{ boatNo: 3, label: '残し' }] }];
  const out = build({ createDisplayCandidates: () => generated });
  generated[0].roleLabels[0].label = 'later'; generated.push({ ticket: '2-1-3' });
  assert.equal(out.prediction.candidate24Tickets.length, 1);
  assert.equal(out.prediction.candidate24Tickets[0].roleLabels[0].label, '残し');
});
test('different primary and verification candidates are never copied into agreement', () => {
  const primary = { prediction: { candidate24Tickets: ['1-2-3'] } };
  const verification = { prediction: { practicalTickets: practical, candidate24Tickets: ['1-3-2'] } };
  const before = JSON.stringify(primary), out = collector.compactStoredVerification(verification);
  assert.deepEqual(out.prediction.candidate24Tickets, ['1-3-2']);
  assert.equal(JSON.stringify(primary), before);
});
test('carry-forward retains an existing invalid or null value for honest diagnostics', () => {
  for (const candidate24Tickets of [null, 'not-an-array', [{ ticket: 'invalid' }]]) {
    const out = collector.compactStoredVerification({ prediction: { practicalTickets: practical, candidate24Tickets } });
    assert.deepEqual(out.prediction.candidate24Tickets, candidate24Tickets);
  }
});
