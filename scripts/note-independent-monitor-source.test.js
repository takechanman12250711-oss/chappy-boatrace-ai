'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { VERSION, independentArticle } = require('./note-independent-monitor-source');
const { publicationPayload, verifyPublicationSource } = require('./note-publication-source');
const sha = text => createHash('sha256').update(text).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const NOW = Date.parse('2026-09-28T16:01:00+09:00');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-note-test-'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function fixture() {
  // Synthetic test data only. Never written to the repository's article queue.
  const tickets = [{ ticket: '1-2-3', odds: 12.3 }, { ticket: '1-2-4', odds: 16.4 }];
  const freeText = '9月28日 丸亀6R｜締切 17:29\n\n通常AIの予想とは別の、独立した監視予想です。\n\n表示保持の単体テスト用原稿。';
  const paidText = '監視の根拠\n元の理由を短縮・差し替えしない。\n\n買い目\n\n・1-2-34\n\n計 2点';
  const paywallMarker = '──────── ここから先は有料部分です ────────';
  const tags = ['#ボートレース'];
  const article = { ok: true, publishable: true, format: 'formation-v3',
    title: '狙い目監視｜9月28日 丸亀6R｜締切 17:29｜イン逃げ',
    freeText, paidText, paywallMarker, tags,
    fullText: [freeText, paywallMarker, paidText,
      '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。', tags.join(' ')].join('\n\n'),
    practicalTickets: clone(tickets), boatEvaluations: [1, 2, 3, 4, 5, 6],
    meta: { date: '20260928', place: '丸亀', raceNo: 6, deadline: '17:29' } };
  const record = { raceKey: '20260928-15-6', date: '20260928', jcd: '15', place: '丸亀', raceNo: 6,
    source: 'independent-watch', selectedAt: '2026-09-28T16:00:00+09:00',
    deadlineAt: '2026-09-28T17:29:00+09:00', prediction: { practicalTickets: clone(tickets) },
    exhibitionSnapshot: { version: 'note-exhibition-v1', ready: true, capturedAt: '2026-09-28T15:59:00+09:00',
      entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
      startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.12, mappingSource: 'official-start-image' })) } };
  const sources = [['entry', 'racelist'], ['exhibition', 'beforeinfo']].map(([role, page]) => {
    const text = `UNIT TEST ONLY: synthetic ${role} evidence, not a real race observation.`;
    return { role, url: `https://www.boatrace.jp/owpc/pc/race/${page}?hd=20260928&jcd=15&rno=6`,
      observedAt: '2026-09-28T15:59:00+09:00', text, sha256: sha(text) };
  });
  return { version: VERSION, capturedAt: record.selectedAt, article, record, baselinePracticalTickets: clone(tickets),
    monitor: { origin: 'independent-watch', kind: 'escape', raceKey: record.raceKey,
      status: 'confirmed-after-exhibition', confirmedAt: record.selectedAt,
      sources, tickets: clone(tickets), article: clone(article),
      boatAssessments: [1,2,3,4,5,6].map(boat => ({ boat, reason: `単体テストの${boat}号艇評価。` })) } };
}
function save(bundle) {
  const text = JSON.stringify(bundle);
  const file = `data/note-drafts/20260928/20260928-15-6-${sha(text)}.json`;
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
  return file;
}
try {
  test('independent original is returned without mutation', () => {
    const b = fixture(), before = JSON.stringify(b);
    assert.strictEqual(independentArticle(b), b.article);
    assert.equal(JSON.stringify(b), before);
  });
  test('actual publication adapter preserves title, reasons, formation and paywall', () => {
    const b = fixture(), p = publicationPayload(save(b), root, NOW);
    assert.equal(p.title, b.article.title); assert.equal(p.freeText, b.article.freeText);
    assert.equal(p.paidText, b.article.paidText); assert.equal(p.body, b.article.fullText);
    assert.equal(p.price, 300); assert.equal(p.practicalTicketCount, 2);
    assert.deepEqual(verifyPublicationSource(p, root, NOW), p);
  });
  const rejects = [
    ['changed original', b => { b.article.paidText += '\nChanged'; }],
    ['normal AI mixing', b => { b.record.prediction.mainSheet = {}; }],
    ['unconfirmed exhibition', b => { b.monitor.status = 'provisional'; }],
    ['missing observed sources', b => { b.monitor.sources = []; }],
    ['wrong source race', b => { b.monitor.sources[0].url = b.monitor.sources[0].url.replace('rno=6', 'rno=5'); }],
    ['modified raw evidence', b => { b.monitor.sources[0].text += 'changed'; }],
    ['missing individual assessment', b => { b.monitor.boatAssessments.pop(); }],
    ['normal app branding', b => { b.article.title = 'チャッピーボートレースAI'; b.monitor.article = clone(b.article); }]
  ];
  for (const [name, mutate] of rejects) test(name + ' rejected', () => {
    const b = fixture(); mutate(b); assert.throws(() => independentArticle(b));
  });
  test('deadline audit is still enforced', () => {
    assert.throws(() => publicationPayload(save(fixture()), root, Date.parse('2026-09-28T17:28:00+09:00')),
      error => error.issueCodes?.includes('DEADLINE_TOO_CLOSE'));
  });
  test('missing exhibition data is not bypassed', () => {
    const b = fixture(); b.record.exhibitionSnapshot.entries[0].exhibition.displayTime = null;
    assert.throws(() => publicationPayload(save(b), root, NOW), /note_exhibition_not_verified/);
  });
  test('changed public handoff is rejected', () => {
    const p = publicationPayload(save(fixture()), root, NOW); p.paidText += '\nextra';
    assert.throws(() => verifyPublicationSource(p, root, NOW), /publication_handoff_mismatch_paidText/);
  });
  test('invented ticket mentions fail the existing audit', () => {
    const b = fixture(); b.article.paidText = b.article.paidText.replace('1-2-34', '1-2-35');
    b.article.fullText = b.article.fullText.replace('1-2-34', '1-2-35'); b.monitor.article = clone(b.article);
    assert.throws(() => publicationPayload(save(b), root, NOW), error =>
      error.issueCodes?.includes('RENDERED_TICKETS_MISMATCH'));
  });
  test('free paywall leakage fails the existing audit', () => {
    const b = fixture(); b.article.freeText += '\n1-2-3';
    b.article.fullText = [b.article.freeText, b.article.paywallMarker, b.article.paidText,
      '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。', b.article.tags.join(' ')].join('\n\n');
    b.monitor.article = clone(b.article);
    assert.throws(() => publicationPayload(save(b), root, NOW), error => error.issueCodes?.includes('FREE_TICKET_LEAK'));
  });
  console.log(`independent monitor source: ${passed} tests passed`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
