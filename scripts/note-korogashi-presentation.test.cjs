'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const categoryV2 = require('./note-category-article');
const model = require('./note-korogashi-presentation.cjs');
const { readableArticle: currentReadableArticle, ticketsIn } = require('./note-readable-article');
const readableArticle = (article, bundle, options = {}) => currentReadableArticle(article, bundle, { presentationVersion: 'readable-v3', ...options });
const { fixture: independentFixture } = require('./note-independent-monitor-fixture');
const hash = text => createHash('sha256').update(text).digest('hex');
const strings = rows => rows.map(row => typeof row === 'string' ? row : row.ticket);
const sorted = rows => [...rows].sort();
const clone = value => structuredClone(value);

// Synthetic original with six practical tickets that are NOT the six main
// tickets. This is renderer-only test data, never pre-race/publication evidence.
function normalFixture() {
  const b = independentFixture(); b.version = 'note-draft-bundle-v1';
  delete b.monitor; delete b.record.source;
  const practical = ['1-3-2', '1-2-3', '1-2-4', '1-2-5', '1-4-2', '2-1-3'];
  b.baselinePracticalTickets = practical.map(ticket => ({ ticket, odds: 10 }));
  b.record.prediction.practicalTickets = clone(b.baselinePracticalTickets);
  b.article.practicalTickets = clone(b.baselinePracticalTickets);
  b.record.prediction.mainSheet = {
    tickets: ['1-2-3', '1-2-4', '1-2-5', '1-2-6', '1-3-4', '1-3-5'],
    coverTickets: ['1-3-2', '1-4-2', '2-1-3'],
    flowTickets: ['1-2-3', '1-3-2', '3-1-2']
  };
  b.record.prediction.manshuSheet = { tickets: ['3-1-2', '4-1-2'] };
  b.record.prediction.candidate24Tickets = ['6-5-4'];
  b.article.format = 'formation-v4';
  b.article.paidText = '🔥 実戦厳選\n\n' + practical.map(ticket => '・' + ticket).join('\n') +
    '\n\n計 6点\n\n本命とは別会計の参考予想\n・4-1-2\n・5-1-2';
  b.article.rangeSummary = '内側の艇が先に回る展開を想定します。';
  return b;
}
function deepFreeze(object) {
  for (const value of Object.values(object)) if (value && typeof value === 'object') deepFreeze(value);
  return Object.freeze(object);
}

test('v3 appends the saved practical subset without changing categories, overlaps or source order', () => {
  const b = deepFreeze(normalFixture()), before = JSON.stringify(b);
  const baseline = strings(b.baselinePracticalTickets), subset = model.sourceSubset(b);
  assert.deepEqual(subset, baseline);
  assert.ok(Object.isFrozen(subset));
  assert.notDeepEqual(sorted(subset), sorted(b.record.prediction.mainSheet.tickets));
  const v2 = readableArticle(b.article, b, { presentationVersion: 'readable-v2' });
  const v3 = readableArticle(b.article, b);
  const parsed = model.parsePaidText(v3.paidText);
  assert.equal(v3.presentationVersion, 'readable-v3');
  assert.equal(parsed.basePaidText, v2.paidText);
  assert.deepEqual(parsed.sections, categoryV2.parsePaidSections(v2.paidText));
  assert.deepEqual(sorted(parsed.modelTickets), sorted(baseline));
  assert.equal(parsed.sections.length, 5, 'model appendix is never a prediction category');
  assert.deepEqual(categoryV2.totals(parsed.sections), categoryV2.totals(categoryV2.parsePaidSections(v2.paidText)));
  assert.ok(v3.paidText.includes('上の公開予想と重複する買い目です。追加の予想や追加購入を勧めるものではありません。'));
  assert.ok(v3.paidText.includes('公開予想の点数・的中成績には重ねて加算せず'));
  assert.ok(!v3.paidText.includes('6 → 5 → 4'), 'candidate-only ticket must stay absent');
  assert.equal(JSON.stringify(b), before);
  assert.deepEqual(ticketsIn(v3.freeText), []);
  assert.ok(!/金額|予算|[0-9０-９]+円|[¥￥]/.test(v3.freeText));
  assert.ok(v3.freeText.includes('有料部分の末尾'));
  assert.equal(v3.fullText.split(v3.paywallMarker).length, 2);
});

test('source comparison accepts independent row ordering but returns immutable baseline order', () => {
  const b = normalFixture();
  b.record.prediction.practicalTickets.reverse(); b.article.practicalTickets.reverse();
  assert.deepEqual(model.sourceSubset(b), strings(b.baselinePracticalTickets));
  for (const kind of ['escape', 'manshu']) {
    const independent = independentFixture(); independent.monitor.kind = kind;
    independent.monitor.tickets.reverse();
    const text = model.paidTextFromSource(independent, kind);
    const parsed = model.parsePaidText(text);
    assert.equal(parsed.sections.length, 1);
    assert.equal(parsed.sections[0].label, categoryV2.INDEPENDENT_LABELS[kind]);
    assert.deepEqual(parsed.modelTickets, ['1-2-3', '1-2-4']);
    independent.monitor.tickets[0].ticket = '2-1-3';
    assert.throws(() => model.sourceSubset(independent), /source_mismatch/);
  }
});

test('Kiryu6 reduced read-only regression preserves practical6 versus main6 and all four category counts', () => {
  // Ticket-only derivative of the original with SHA cfecc09d5fb625a1dae62ea8e2715dc45bb24ea56a6afd1ff14e375cdae1c4f6.
  // The fixture is deliberately NOT the full original or remote pre-race
  // evidence: prose/metadata are synthetic, and it must never be published.
  const b = normalFixture();
  const practical = ['1-2-3','1-4-3','1-3-4','1-2-4','1-2-5','1-3-2'];
  const pools = [
    ['1-2-3','1-4-3','1-3-4','1-2-4','1-4-5','1-3-5'],
    ['2-1-3','2-1-4','2-1-5','2-1-6','2-4-3','2-4-5','2-4-6','2-3-4'],
    ['1-2-3','1-2-4','1-2-5','1-2-6','1-4-2','1-4-3','1-4-5','1-4-6','1-3-2','1-3-4','1-3-5','1-3-6'],
    ['4-1-2','4-1-5','4-2-1','4-2-5','4-5-1','4-5-2','4-6-1','4-6-2','5-1-4','5-1-2','5-4-1','5-4-2','3-2-4','3-2-5','3-2-6','3-4-5','3-4-6']
  ];
  const reference = ['4-1-3','4-5-3','5-1-3','5-2-1','5-2-3'];
  b.baselinePracticalTickets = clone(practical);
  b.record.prediction.practicalTickets = clone(practical);
  b.article.practicalTickets = clone(practical);
  b.record.prediction.mainSheet = { tickets: pools[0], coverTickets: pools[1], flowTickets: pools[2] };
  b.record.prediction.manshuSheet = { tickets: pools[3] };
  b.article.paidText = '🔥 実戦厳選\n\n' + practical.map(ticket => '・' + ticket).join('\n') +
    '\n\n計 6点\n\n本命とは別会計の参考予想\n' + reference.map(ticket => '・' + ticket).join('\n');
  const before = JSON.stringify(b), v3 = readableArticle(b.article, b), parsed = model.parsePaidText(v3.paidText);
  const sourceSha256 = 'cfecc09d5fb625a1dae62ea8e2715dc45bb24ea56a6afd1ff14e375cdae1c4f6';
  assert.deepEqual(model.sourceSubset(b), practical);
  assert.deepEqual(sorted(parsed.modelTickets), sorted(practical));
  assert.notDeepEqual(sorted(parsed.modelTickets), sorted(parsed.sections[0].tickets));
  assert.deepEqual(parsed.sections.map(section => section.tickets.length), [6,8,12,17,5]);
  assert.deepEqual(categoryV2.totals(parsed.sections), { primary: 37, displayed: 43, reference: 5, all: 42 });
  assert.equal(parsed.basePaidText, readableArticle(b.article, b, { presentationVersion: 'readable-v2' }).paidText);
  assert.equal(model.modelProof(v3.paidText, sourceSha256).ticketsSha256, 'f031fcdd7e5175284a5fc1c4deaf6508c0b2794a1049a54676e4ef46fa80a02c');
  assert.equal(JSON.stringify(b), before);
});

test('missing, unknown and candidate-only source families fail closed', () => {
  for (const mutate of [
    b => { delete b.baselinePracticalTickets; },
    b => { delete b.record.prediction.practicalTickets; },
    b => { delete b.article.practicalTickets; },
    b => { b.version = 'independent-exhibition-dominance-v1'; },
    b => { b.version = 'future-note-v99'; },
    b => { b.record.source = 'candidate-only'; },
    b => { b.baselinePracticalTickets = b.record.prediction.candidate24Tickets; },
    b => { b.article.practicalTickets[0].ticket = '6-5-4'; }
  ]) {
    const b = normalFixture(); mutate(b);
    assert.throws(() => model.sourceSubset(b), /source_|series_source_invalid/);
  }
  const b = independentFixture(); delete b.monitor.tickets;
  assert.throws(() => model.sourceSubset(b), /source_missing/);
  assert.throws(() => model.sourceSubset(null), /series_source_invalid/);
  assert.throws(() => model.paidTextFromSource(normalFixture(), 'escape'), /series_mismatch/);
});

test('practical source must contain one to seven distinct legal tickets in every saved copy', () => {
  for (const rows of [[], ['1-2-3', '1-2-3'], ['1-1-2'], ['7-2-3'], [null],
    ['1-2-3', '1-2-4', '1-2-5', '1-2-6', '1-3-2', '1-3-4', '1-3-5', '1-3-6']]) {
    const b = normalFixture(); b.baselinePracticalTickets = rows;
    assert.throws(() => model.sourceSubset(b), /ticket_(?:count_invalid|invalid|duplicate)/);
  }
  for (const mutate of [b => b.record.prediction.practicalTickets.push(b.record.prediction.practicalTickets[0]),
    b => b.article.practicalTickets.push(b.article.practicalTickets[0]),
    b => b.monitor.tickets.push(b.monitor.tickets[0])]) {
    const b = independentFixture(); mutate(b);
    assert.throws(() => model.sourceSubset(b), /ticket_duplicate/);
  }
});

test('reference-only practical membership is rejected without changing reference accounting', () => {
  const b = normalFixture(), practical = ['5-1-2'];
  b.baselinePracticalTickets = practical;
  b.record.prediction.practicalTickets = practical;
  b.article.practicalTickets = practical;
  b.article.paidText = '🔥 実戦厳選\n\n・5-1-2\n\n計 1点\n\n本命とは別会計の参考予想\n・5-1-2';
  assert.throws(() => model.sourceSubset(b), /category_membership_missing|primary_membership_missing/);
  const good = normalFixture(), paid = model.paidTextFromSource(good, 'normal');
  const referenceAppendix = paid.slice(0, paid.indexOf('\n\n' + model.MODEL_LABEL)) + '\n\n' + model.MODEL_LABEL +
    '\n\n5 → 1 → 2\n1点\n\n' + paid.split('\n\n').at(-1);
  assert.throws(() => model.parsePaidText(referenceAppendix), /primary_membership_missing/);
});

test('parser rejects missing, duplicate, count-mismatched or modified appendix grammar', () => {
  const b = normalFixture(), paid = model.paidTextFromSource(b, 'normal');
  const { basePaidText } = model.parsePaidText(paid);
  const appendix = paid.slice(basePaidText.length);
  for (const changed of [basePaidText, paid + appendix, paid + '\n',
    paid.replace('検証用に再掲しています。', '購入してください。'),
    paid.replace(/6点\n\n保存済み/, '5点\n\n保存済み'),
    paid + '\n1-2-3', paid.replace(model.MODEL_LABEL, '🔄 別の候補')]) {
    assert.throws(() => model.parsePaidText(changed), /korogashi_model/);
  }
  const changed = basePaidText.replace('公開予想：', '公開候補：') + appendix;
  assert.throws(() => model.parsePaidText(changed), /published_total_text_invalid/);
});

test('model proof is hash-only, source-bound and excluded from published result scope', () => {
  const b = normalFixture(), sourceSha256 = 'a'.repeat(64), paid = model.paidTextFromSource(b, 'normal');
  const proof = model.modelProof(paid, sourceSha256);
  assert.deepEqual(proof, { version: 'note-korogashi-display-v1', label: model.MODEL_LABEL, sourceSha256,
    ticketCount: 6, ticketsSha256: hash(JSON.stringify(sorted(strings(b.baselinePracticalTickets)))),
    includedInPublishedResult: false });
  assert.deepEqual(ticketsIn(JSON.stringify(proof)), []);
  assert.ok(!Object.hasOwn(proof, 'tickets'));
  for (const invalid of [undefined, null, '', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)]) {
    assert.throws(() => model.modelProof(paid, invalid), /source_hash_invalid/);
  }
});

test('v3 preserves existing free price disclosures while its model preview adds no amount or tickets', () => {
  const b = normalFixture(); b.article.rangeSummary = '1-2-3を想定します。内側の艇を見ます。';
  assert.deepEqual(ticketsIn(readableArticle(b.article, b).freeText), []);
  for (const value of [normalFixture(), independentFixture()]) {
    value.article.freeText += '\n\n作成時点の取得済み情報です。本記事は200円です。';
    value.article.rangeSummary = '掲載価格200円を確認してください。';
    if (value.monitor) value.monitor.article = clone(value.article);
    const old = readableArticle(value.article, value, { presentationVersion: 'readable-v2' });
    const current = readableArticle(value.article, value);
    assert(current.freeText.startsWith(old.freeText + '\n\n'));
    assert(current.freeText.includes('本記事は200円です。'));
    const added = current.freeText.slice(old.freeText.length);
    assert(!/円|[¥￥$＄€]|JPY|USD|EUR/.test(added));
    assert.deepEqual(ticketsIn(added), []);
  }
});

test('explicit readable-v2 keeps its frozen free, paid and full bytes', () => {
  const b = independentFixture(), a = readableArticle(b.article, b, { presentationVersion: 'readable-v2' });
  assert.equal(hash(a.freeText), '94e5f1b49101bba655a166439cc9f9604b535eae82e11976e572d5767d018113');
  assert.equal(hash(a.paidText), '7ad8d635cc745f63579f077a4530b03a9012971737963e37de8a33876225114c');
  assert.equal(hash(a.fullText), 'c813e7c5f10400bd88864241c6cc053e05c486c3a02e06b99d99cb1a1024e041');
  assert.ok(!a.fullText.includes(model.MODEL_LABEL));
  assert.throws(() => readableArticle(b.article, b, { presentationVersion: 'readable-v99' }), /version_unsupported/);
});

// Keep v4 safety regressions in this established CI entry point; no new workflow.
require('./note-free-explanation.test.cjs');
