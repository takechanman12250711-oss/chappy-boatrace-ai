'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const { readableArticle } = require('./note-readable-article');
const { VERSION, EVIDENCE_VERSION, LEGACY_READABLE, sectionProof, extractPublishedTicketSections,
  publishedTicketSections, classifyPublishedTickets } = require('./note-published-ticket-sections');
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function normalFixture() {
  const bundle = fixture();
  bundle.version = 'note-draft-bundle-v1';
  delete bundle.record.source; delete bundle.monitor;
  bundle.record.prediction.mainSheet = { tickets: ['1-2-3', '1-3-2'],
    coverTickets: ['1-3-2', '2-1-3'], flowTickets: ['1-2-3', '3-1-2'] };
  bundle.record.prediction.manshuSheet = { tickets: ['3-1-2', '4-1-2'] };
  bundle.record.prediction.candidate24Tickets = [{ ticket: '6-5-4' }];
  bundle.record.prediction.ticketSheets = { main: ['6-5-4'] };
  bundle.article.format = 'formation-v4';
  bundle.article.paidText = '🔥 実戦厳選\n\n・1-2-34\n\n計 2点\n\n本命とは別会計の参考予想\n・4-1-2\n・5-1-2';
  return bundle;
}
function input(bundle = normalFixture(), modern = false) {
  const bytes = JSON.stringify(bundle), deadline = Date.parse(bundle.record.deadlineAt);
  const series = bundle.version === 'independent-monitor-note-v1' ? bundle.monitor.kind : 'normal';
  const row = { raceKey: bundle.record.raceKey, publicationKey: `${bundle.record.raceKey}:${series}`, articleSeries: series,
    sourceSha256: hash(bytes), place: bundle.record.place, raceNo: bundle.record.raceNo,
    deadlineAt: bundle.record.deadlineAt, publishedAt: new Date(deadline - 180000).toISOString(), ticketCount: bundle.baselinePracticalTickets.length };
  row.publicationEvidence = { version: EVIDENCE_VERSION, receiptCommitSha: 'a'.repeat(40), publisherCommitSha: 'b'.repeat(40),
    sourceSha256: row.sourceSha256, ...LEGACY_READABLE, presentationVersion: null };
  if (modern) row.publicationEvidence.publishedDisplayProof = sectionProof(readableArticle(bundle.article, bundle).paidText, 'readable-v1');
  return { row, bytes, now: deadline + 3600000 };
}

test('actual readable labels and deduplicated primary union exclude separate reference and internal candidate24', () => {
  const args = input(), before = JSON.stringify(args);
  const result = publishedTicketSections(args.row, args.bytes, args.now);
  assert.equal(result.status, 'verified');
  assert.equal(result.version, VERSION);
  assert.equal(result.publishedTicketCount, 6);
  assert.equal(result.referenceTicketCount, 1);
  assert.deepEqual(result.sections, [
    { label: '中心の買い目', tickets: ['1-2-3', '1-2-4'] },
    { label: '相手を広げるなら', tickets: ['1-3-2', '2-1-3'] },
    { label: '別の展開を考えるなら', tickets: ['3-1-2'] },
    { label: '高配当を狙うなら', tickets: ['4-1-2'] }
  ]);
  assert.ok(!result.unionTickets.includes('5-1-2'));
  assert.ok(!result.unionTickets.includes('6-5-4'));
  assert.equal(JSON.stringify(args), before);
});

test('each rendered primary section can hit while original overlapping categories are not invented', () => {
  const { row, bytes, now } = input();
  for (const [ticket, label] of [['1-2-3','中心の買い目'], ['2-1-3','相手を広げるなら'],
    ['3-1-2','別の展開を考えるなら'], ['4-1-2','高配当を狙うなら']]) {
    const result = classifyPublishedTickets(row, bytes, ticket, now);
    assert.equal(result.status, 'hit');
    assert.deepEqual(result.matchedSections, [label]);
  }
  for (const ticket of ['5-1-2', '6-5-4']) {
    const result = classifyPublishedTickets(row, bytes, ticket, now);
    assert.equal(result.status, 'miss'); assert.deepEqual(result.matchedSections, []);
  }
  assert.equal(classifyPublishedTickets(row, bytes, '1-1-2', now).reason, 'official_combination_invalid');
});

test('current published paid text and frozen reconstruction have exact matching proof', () => {
  const { row, bytes, now } = input(normalFixture(), true);
  const result = publishedTicketSections(row, bytes, now);
  assert.equal(result.status, 'verified');
  assert.equal(result.evidenceBasis, 'receipt-display-proof');
  const proof = row.publicationEvidence.publishedDisplayProof;
  assert.equal(proof.publishedTicketsSha256, hash(JSON.stringify(result.unionTickets)));
  assert.equal(proof.sectionsSha256, result.sectionsSha256);
  assert.equal(proof.sections.at(-1).includedInPublishedResult, false);
  assert.equal(proof.sections.at(-1).label, '別会計の参考予想');
  assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(proof)));
});

test('missing original, identity changes, missing/unknown renderer evidence fail closed', () => {
  const { row, bytes, now } = input();
  assert.equal(publishedTicketSections(row, bytes + ' ', now).reason, 'source_hash_mismatch');
  assert.equal(publishedTicketSections({ ...row, raceNo: 7 }, bytes, now).reason, 'source_identity_mismatch');
  assert.equal(publishedTicketSections({ ...row, publicationEvidence: null }, bytes, now).reason, 'published_renderer_evidence_missing');
  for (const field of ['rendererSha256', 'publicationSourceSha256', 'generatorSha256']) {
    const changed = clone(row); changed.publicationEvidence[field] = 'e'.repeat(64);
    assert.equal(publishedTicketSections(changed, bytes, now).reason, 'published_renderer_unreviewed');
  }
  const generationOnly = clone(row); generationOnly.publicationEvidence = { sourceCommit: 'b'.repeat(40), presentationVersion: 'readable-v1' };
  assert.equal(publishedTicketSections(generationOnly, bytes, now).status, 'review');
});

test('receipt display proof binds exact paid bytes, ticket union, section membership and counts', () => {
  const { row, bytes, now } = input(normalFixture(), true);
  for (const edit of [proof => { proof.paidTextSha256 = 'a'.repeat(64); }, proof => { proof.sectionsSha256 = 'a'.repeat(64); },
    proof => { proof.publishedTicketsSha256 = 'a'.repeat(64); }, proof => { proof.publishedTicketCount++; },
    proof => { proof.sections[1].label = '押さえ'; }, proof => { proof.sections.at(-1).includedInPublishedResult = true; },
    proof => { proof.extraTickets = ['6-5-4']; }]) {
    const changed = clone(row); edit(changed.publicationEvidence.publishedDisplayProof);
    assert.equal(publishedTicketSections(changed, bytes, now).reason, 'published_display_proof_mismatch');
  }
});

test('result API never returns paid tickets or sections at or before deadline', () => {
  const { row, bytes } = input(normalFixture(), true), deadline = Date.parse(row.deadlineAt);
  for (const now of [deadline - 1000, deadline]) {
    const result = publishedTicketSections(row, bytes, now);
    assert.deepEqual(result, { status: 'pending', reason: 'official_result_pending' });
    assert.deepEqual(classifyPublishedTickets(row, bytes, '1-2-3', now), result);
    assert.ok(!JSON.stringify(result).includes('1-2-3'));
  }
});

test('normal reference cleaning is the reviewed compactArticle preprocessing, never the raw pool', () => {
  const bundle = normalFixture();
  bundle.article.paidText += '\n除外説明（6-1-2）\n内訳 6-2-1';
  const args = input(bundle), result = publishedTicketSections(args.row, args.bytes, args.now);
  assert.equal(result.status, 'verified');
  assert.equal(result.referenceTicketCount, 1);
  const cleaned = { ...bundle.article, paidText: bundle.article.paidText.replace('（6-1-2）', '').replace('\n内訳 6-2-1','') };
  args.row.publicationEvidence.publishedDisplayProof = sectionProof(readableArticle(cleaned, bundle).paidText);
  assert.equal(publishedTicketSections(args.row, args.bytes, args.now).status, 'verified');
});

test('independent originals stay independent, including duplicate reference exclusion', () => {
  for (const kind of ['escape', 'manshu']) {
    const bundle = fixture(); bundle.monitor.kind = kind;
    bundle.article.paidText += '\n\n参考\n・1-2-3\n・6-1-2';
    bundle.monitor.article = clone(bundle.article);
    const { row, bytes, now } = input(bundle, true);
    const result = publishedTicketSections(row, bytes, now);
    assert.equal(result.status, 'verified');
    assert.equal(result.publishedTicketCount, 2); assert.equal(result.referenceTicketCount, 1);
    assert.equal(classifyPublishedTickets(row, bytes, '6-1-2', now).status, 'miss');
    const changed = JSON.parse(bytes); changed.monitor.article.paidText += '\n6-5-4';
    const tampered = JSON.stringify(changed); row.sourceSha256 = hash(tampered);
    assert.equal(publishedTicketSections(row, tampered, now).reason, 'monitor_tickets_mismatch');
  }
});

test('unpublished pools cannot be promoted by format guess, malformed center or old original labels', () => {
  for (const mutate of [bundle => { bundle.article.format = 'formation-v3'; },
    bundle => { bundle.article.paidText = bundle.article.paidText.replace('・1-2-34', '・1-2-35'); },
    bundle => { bundle.record.prediction.mainSheet.coverTickets = ['7-2-1']; }]) {
    const bundle = normalFixture(); mutate(bundle);
    const { row, bytes, now } = input(bundle);
    assert.equal(publishedTicketSections(row, bytes, now).status, 'review');
  }
});

test('paid parser rejects invalid, unlabelled, duplicate and count-mismatched ticket text', () => {
  const bundle = normalFixture(), paidText = readableArticle(bundle.article, bundle).paidText;
  for (const changed of [paidText.replace('中心の買い目', '本命'), paidText.replace('2点', '3点'),
    paidText.replace('1 → 2 → 3・4', '7 → 2 → 3・4'), paidText + '\n6 → 5 → 4',
    paidText.replace('4 → 1 → 2', '3 → 1 → 2')]) {
    assert.equal(extractPublishedTicketSections(changed).status, 'review');
    assert.throws(() => sectionProof(changed));
  }
  assert.equal(extractPublishedTicketSections(paidText, { presentationVersion: 'future-v2' }).reason, 'published_presentation_version_unsupported');
});

test('formation regrouping exactly matches current publication renderer over non-adjacent rectangles', () => {
  const bundle = normalFixture();
  bundle.record.prediction.mainSheet = { tickets: ['1-2-4','1-2-5','1-3-4','1-3-5','6-2-4','6-3-4','6-2-5','6-3-5'], coverTickets: [], flowTickets: [] };
  bundle.record.prediction.manshuSheet = { tickets: [] };
  const { row, bytes, now } = input(bundle, true);
  assert.equal(publishedTicketSections(row, bytes, now).status, 'verified');
});
