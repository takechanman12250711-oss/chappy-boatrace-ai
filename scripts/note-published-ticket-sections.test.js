'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const { readableArticle: currentReadableArticle } = require('./note-readable-article');
const readableArticle = (article, bundle) => currentReadableArticle(article, bundle, { presentationVersion: 'readable-v1' });
const { VERSION, EVIDENCE_VERSION, LEGACY_READABLE, sectionProof, extractPublishedTicketSections,
  publishedTicketSections, classifyPublishedTickets, verifiedModelSubset } = require('./note-published-ticket-sections');
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

function categoryInput(bundle, presentationVersion = 'readable-v2') {
  if (!bundle) {
    bundle = normalFixture();
    bundle.record.prediction.mainSheet.tickets.splice(1, 0, '1-2-4');
  }
  const args = input(bundle), article = currentReadableArticle(bundle.article, bundle, { presentationVersion });
  args.row.publicationEvidence.presentationVersion = article.presentationVersion;
  args.row.publicationEvidence.publishedDisplayProof = sectionProof(article.paidText, article.presentationVersion, { sourceSha256: args.row.sourceSha256 });
  return { ...args, bundle, article };
}
test('v2 exact source proof retains all category matches while excluding overlapping references from totals', () => {
  const { row, bytes, now, article } = categoryInput();
  const result = publishedTicketSections(row, bytes, now);
  assert.equal(result.status, 'verified'); assert.equal(result.presentationVersion, 'readable-v2');
  assert.equal(result.publishedTicketCount, 6); assert.equal(result.displayedPrimaryTicketCount, 9);
  assert.equal(result.referenceTicketCount, 2);
  assert.deepEqual(result.sections, [
    { label: '🎯 本命', tickets: ['1-2-3','1-2-4','1-3-2'] },
    { label: '🛡️ 押さえ', tickets: ['1-3-2','2-1-3'] },
    { label: '🌊 流し', tickets: ['1-2-3','3-1-2'] },
    { label: '💥 万舟狙い', tickets: ['3-1-2','4-1-2'] }
  ]);
  assert.deepEqual(classifyPublishedTickets(row, bytes, '1-3-2', now).matchedSections, ['🎯 本命','🛡️ 押さえ']);
  assert.deepEqual(classifyPublishedTickets(row, bytes, '3-1-2', now).matchedSections, ['🌊 流し','💥 万舟狙い']);
  assert.deepEqual(classifyPublishedTickets(row, bytes, '4-1-2', now).matchedSections, ['💥 万舟狙い']);
  assert.equal(classifyPublishedTickets(row, bytes, '5-1-2', now).status, 'miss');
  assert.equal(classifyPublishedTickets(row, bytes, '6-5-4', now).status, 'miss');
  assert.equal(row.publicationEvidence.publishedDisplayProof.paidTextSha256, hash(article.paidText));
  assert.equal(row.publicationEvidence.publishedDisplayProof.sections.at(-1).includedInPublishedResult, false);
  assert.ok(!JSON.stringify(row.publicationEvidence.publishedDisplayProof).includes('1-2-3'));
});
test('v2 rejects unknown headings, mixed families, duplicate tickets, count inflation and budget guidance', () => {
  const { article } = categoryInput(), text = article.paidText;
  for (const changed of [text.replace('🎯 本命', '🎯 絶対当たる本命'),
    text.replace('🌊 流し', '💥 独立万舟'), text.replace('3点', '4点'),
    text.replace('公開予想：6点', '公開予想：9点'), text + '\n\n💰 金額の目安（1点100円）\n公開予想のみ600円',
    text.replace('延べ9点', '延べ6点'), text.replace('参考予想：2点', '参考予想：1点'),
    text.replace('1 → 2 → 3・4', '1 → 2 → 3・4\n1 → 2 → 3'),
    text + '\n安全な買い目\n6 → 5 → 4', text.replace('🧾 別会計の参考予想', '参考')]) {
    assert.equal(extractPublishedTicketSections(changed, { presentationVersion: 'readable-v2' }).status, 'review');
    assert.throws(() => sectionProof(changed, 'readable-v2'));
  }
});
test('v2 binds exact source SHA, category membership, version and paid body', () => {
  const { row, bytes, now } = categoryInput();
  assert.equal(publishedTicketSections(row, bytes + '\n', now).reason, 'source_hash_mismatch');
  for (const edit of [proof => { proof.paidTextSha256 = 'c'.repeat(64); },
    proof => { proof.sections[1].ticketsSha256 = proof.sections[0].ticketsSha256; },
    proof => { proof.sections.at(-1).includedInPublishedResult = true; },
    proof => { proof.publishedTicketCount = 9; }, proof => { proof.sections.push(proof.sections[0]); }]) {
    const changed = clone(row); edit(changed.publicationEvidence.publishedDisplayProof);
    assert.equal(publishedTicketSections(changed, bytes, now).reason, 'published_display_proof_mismatch');
  }
  const wrongVersion = clone(row); wrongVersion.publicationEvidence.presentationVersion = 'readable-v1';
  assert.equal(publishedTicketSections(wrongVersion, bytes, now).reason, 'published_display_proof_mismatch');
  const bundle = JSON.parse(bytes); bundle.record.prediction.mainSheet.coverTickets = ['2-1-3'];
  const changedBytes = JSON.stringify(bundle), changedRow = clone(row);
  changedRow.sourceSha256 = hash(changedBytes); changedRow.publicationEvidence.sourceSha256 = hash(changedBytes);
  assert.equal(publishedTicketSections(changedRow, changedBytes, now).reason, 'published_display_proof_mismatch');
});
test('v2 cannot disclose paid membership before the deadline or infer missing source classifications', () => {
  const { row, bytes, now } = categoryInput();
  assert.deepEqual(publishedTicketSections(row, bytes, Date.parse(row.deadlineAt)), { status: 'pending', reason: 'official_result_pending' });
  for (const mutation of [b => { delete b.record.prediction.mainSheet.coverTickets; },
    b => { b.record.prediction.mainSheet.tickets = ['1-2-3','1-3-2']; }]) {
    const b = JSON.parse(bytes); mutation(b); const changedBytes = JSON.stringify(b), changedRow = clone(row);
    changedRow.sourceSha256 = hash(changedBytes); changedRow.publicationEvidence.sourceSha256 = hash(changedBytes);
    assert.equal(publishedTicketSections(changedRow, changedBytes, now).status, 'review');
  }
});
test('v2 independent kinds have exact receipt proofs and preserve reference overlaps without AI pools', () => {
  for (const kind of ['escape', 'manshu']) {
    const bundle = fixture(); bundle.monitor.kind = kind;
    bundle.article.paidText += '\n\n参考\n・1-2-3\n・6-1-2'; bundle.monitor.article = clone(bundle.article);
    const { row, bytes, now } = categoryInput(bundle), result = publishedTicketSections(row, bytes, now);
    assert.equal(result.status, 'verified'); assert.equal(result.publishedTicketCount, 2); assert.equal(result.referenceTicketCount, 2);
    assert.deepEqual(classifyPublishedTickets(row, bytes, '1-2-3', now).matchedSections, [kind === 'escape' ? '🎯 独立本命' : '💥 独立万舟']);
    assert.equal(classifyPublishedTickets(row, bytes, '6-1-2', now).status, 'miss');
  }
});
test('v1 byte fingerprint and grammar remain frozen when v2 is the generation default', () => {
  assert.deepEqual(LEGACY_READABLE, {
    presentationVersion: 'readable-v1',
    rendererSha256: 'f8bdeed262196f6e0a57d98e93a09c0a9b85f4c8bbbaa96bac383ddb5bcff389',
    publicationSourceSha256: 'd00657d58c8c9e35b679142bd5e7c981bdfa42905c0bb1ea85377fb234d47e4f',
    generatorSha256: '2f4b9769f34e29287e8b23bae208a694c39eca66700850397a64879619d48be3'
  });
  const legacy = readableArticle(fixture().article, fixture());
  assert.equal(sectionProof(legacy.paidText, 'readable-v1').paidTextSha256,
    'cb6fb0fb2fd0bd1e2ce4f7a9a914e7c888c10ef12926768c9741082d95a3010c');
  assert.equal(extractPublishedTicketSections(legacy.paidText, { presentationVersion: 'readable-v2' }).status, 'review');
  assert.equal(extractPublishedTicketSections(categoryInput().article.paidText, { presentationVersion: 'readable-v1' }).status, 'review');
});

function modelInput(presentationVersion = 'readable-v3', bundle) {
  const args = categoryInput(bundle, presentationVersion);
  args.row.url = 'https://note.com/great_robin3243/n/n123abc';
  args.row.price = 200;
  args.receipt = { version: 'note-publication-receipt-v1', raceKey: args.row.raceKey,
    articleSeries: args.row.articleSeries, publicationKey: args.row.publicationKey,
    url: args.row.url, price: args.row.price, sourceSha256: args.row.sourceSha256,
    publishedAt: args.row.publishedAt, verifiedAt: new Date(Date.parse(args.row.publishedAt) + 1000).toISOString(),
    publishedDisplayProof: clone(args.row.publicationEvidence.publishedDisplayProof) };
  args.beforeDeadline = Date.parse(args.row.deadlineAt) - 130000;
  return args;
}

test('v3 appends a source-bound model proof without changing v2 categories, union or matched labels', () => {
  const args = modelInput(), v2 = categoryInput(JSON.parse(args.bytes));
  const result = publishedTicketSections(args.row, args.bytes, args.now);
  const original = publishedTicketSections(v2.row, v2.bytes, v2.now);
  assert.equal(result.status, 'verified'); assert.equal(result.presentationVersion, 'readable-v3');
  for (const field of ['sections', 'sectionsSha256', 'publishedTicketsSha256', 'publishedTicketCount',
    'displayedPrimaryTicketCount', 'referenceTicketCount', 'unionTickets']) assert.deepEqual(result[field], original[field]);
  assert.equal(result.publishedTicketCount, 6);
  assert.equal(result.displayedPrimaryTicketCount, 9);
  assert.equal(result.referenceTicketCount, 2);
  assert.deepEqual(classifyPublishedTickets(args.row, args.bytes, '1-3-2', args.now).matchedSections, ['🎯 本命', '🛡️ 押さえ']);
  assert.deepEqual(classifyPublishedTickets(args.row, args.bytes, '3-1-2', args.now).matchedSections, ['🌊 流し', '💥 万舟狙い']);
  assert.equal(classifyPublishedTickets(args.row, args.bytes, '5-1-2', args.now).status, 'miss');
  assert.equal(classifyPublishedTickets(args.row, args.bytes, '6-5-4', args.now).status, 'miss');
  const proof = args.receipt.publishedDisplayProof;
  assert.deepEqual(proof.modelSubset, { version: 'note-korogashi-display-v1', label: '🔄 コロがし検証対象',
    sourceSha256: args.row.sourceSha256, ticketCount: 2, ticketsSha256: hash(JSON.stringify(['1-2-3', '1-2-4'])),
    includedInPublishedResult: false });
  assert.deepEqual(proof.sections, v2.row.publicationEvidence.publishedDisplayProof.sections);
  assert.equal(Object.hasOwn(result, 'modelSubset'), false);
  assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(proof)));
  assert.throws(() => sectionProof(args.article.paidText, 'readable-v3'), /source_hash_invalid/);
});

test('v3 pre-deadline model validator returns only hashes while public result APIs remain closed', () => {
  const { row, bytes, receipt, beforeDeadline, now } = modelInput(), before = JSON.stringify({ row, bytes, receipt });
  const evidence = verifiedModelSubset(row, bytes, receipt, beforeDeadline);
  assert.deepEqual(evidence, { version: 'note-korogashi-selection-evidence-v1', presentationVersion: 'readable-v3',
    sourceSha256: row.sourceSha256, paidTextSha256: receipt.publishedDisplayProof.paidTextSha256,
    ticketsSha256: hash(JSON.stringify(['1-2-3', '1-2-4'])), ticketCount: 2, label: '🔄 コロがし検証対象' });
  assert(Object.isFrozen(evidence));
  assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(evidence)));
  assert.deepEqual(verifiedModelSubset(row, Buffer.from(bytes), receipt, now), evidence, 'settlement revalidates original publication chronology');
  for (const clock of [beforeDeadline, Date.parse(row.deadlineAt)]) {
    assert.deepEqual(publishedTicketSections(row, bytes, clock), { status: 'pending', reason: 'official_result_pending' });
    assert.deepEqual(classifyPublishedTickets(row, bytes, '1-2-3', clock), { status: 'pending', reason: 'official_result_pending' });
  }
  assert.equal(JSON.stringify({ row, bytes, receipt }), before);
  // A fetched modern receipt can prove its displayed subset even if a cached
  // marketing row has not yet acquired legacy publisher-code fingerprints.
  const uncached = { ...row }; delete uncached.publicationEvidence;
  assert.deepEqual(verifiedModelSubset(uncached, bytes, receipt, beforeDeadline), evidence);
});

test('v3 proof rejects source rebinding even if only unrelated immutable bytes change', () => {
  const args = modelInput(), changed = JSON.parse(args.bytes);
  changed.unrelatedImmutableAnnotation = 'These bytes were not the publication original.';
  const bytes = JSON.stringify(changed), sourceSha256 = hash(bytes);
  const row = { ...args.row, sourceSha256, publicationEvidence: { ...args.row.publicationEvidence, sourceSha256 } };
  const receipt = { ...args.receipt, sourceSha256 };
  assert.equal(publishedTicketSections(row, bytes, args.now).reason, 'published_display_proof_mismatch');
  assert.throws(() => verifiedModelSubset(row, bytes, receipt, args.beforeDeadline), /published_display_proof_mismatch/);
  assert.throws(() => verifiedModelSubset(args.row, args.bytes + ' ', args.receipt, args.beforeDeadline), /source_hash_mismatch/);
});

test('v3 model proof rejects tampering, extra fields and altered paid subsection membership', () => {
  const args = modelInput();
  for (const edit of [
    proof => { proof.modelSubset.sourceSha256 = 'e'.repeat(64); },
    proof => { proof.modelSubset.ticketsSha256 = proof.sections[0].ticketsSha256; },
    proof => { proof.modelSubset.ticketCount = 3; },
    proof => { proof.modelSubset.includedInPublishedResult = true; },
    proof => { proof.modelSubset.label = '🎯 本命'; },
    proof => { proof.modelSubset.version = 'future-v2'; },
    proof => { proof.modelSubset.tickets = ['1-2-3']; },
    proof => { proof.paidText = args.article.paidText; },
    proof => { proof.sections.push({ ...proof.modelSubset }); },
    proof => { delete proof.modelSubset; },
    proof => { proof.paidTextSha256 = 'a'.repeat(64); }
  ]) {
    const row = clone(args.row), receipt = clone(args.receipt);
    edit(receipt.publishedDisplayProof); row.publicationEvidence.publishedDisplayProof = clone(receipt.publishedDisplayProof);
    assert.equal(publishedTicketSections(row, args.bytes, args.now).reason, 'published_display_proof_mismatch');
    assert.throws(() => verifiedModelSubset(row, args.bytes, receipt, args.beforeDeadline), /published_display_proof_mismatch/);
  }
  const model = require('./note-korogashi-presentation.cjs');
  const parsed = model.parsePaidText(args.article.paidText);
  const appendix = args.article.paidText.slice(parsed.basePaidText.length);
  const changedText = parsed.basePaidText + appendix.replace('1 → 2 → 3・4', '1 → 3 → 2・4');
  assert.throws(() => sectionProof(changedText, 'readable-v3', { sourceSha256: args.row.sourceSha256 }), /primary_membership_missing/);
});

test('model validator verifies actual receipt identity and clocks rather than a count or source label', () => {
  for (const edit of [
    args => { args.receipt.url = 'https://note.com/great_robin3243/n/n456abc'; },
    args => { args.receipt.sourceSha256 = 'a'.repeat(64); },
    args => { args.receipt.raceKey += '1'; },
    args => { args.receipt.articleSeries = 'escape'; },
    args => { args.receipt.publicationKey += ':escape'; },
    args => { args.receipt.price = 300; },
    args => { args.receipt.version = 'future-v2'; },
    args => { args.receipt.publishedAt = args.row.deadlineAt; },
    args => { args.receipt.verifiedAt = new Date(Date.parse(args.row.publishedAt) - 1).toISOString(); },
    args => { args.receipt.verifiedAt = args.row.deadlineAt; },
    args => { args.receipt.verifiedAt = new Date(args.beforeDeadline + 1).toISOString(); },
    args => { args.beforeDeadline = NaN; },
    args => { args.row.publicationEvidence.sourceSha256 = 'a'.repeat(64); },
    args => { args.row.publicationEvidence.publishedDisplayProof = undefined; },
    args => { args.receipt.publishedDisplayProof = undefined; }
  ]) {
    const args = modelInput(); edit(args);
    assert.throws(() => verifiedModelSubset(args.row, args.bytes, args.receipt, args.beforeDeadline));
  }
});

test('v3 rejects unknown source families and formats without substituting research pools', () => {
  for (const mutate of [
    bundle => { bundle.version = 'future-note-source-v9'; },
    bundle => { bundle.record.source = 'autonomous-research'; },
    bundle => { bundle.article.format = 'formation-future'; },
    bundle => { delete bundle.baselinePracticalTickets; },
    bundle => { delete bundle.article.practicalTickets; },
    bundle => { bundle.article.practicalTickets = [{ ticket: '6-5-4' }]; },
    bundle => { delete bundle.record.prediction.mainSheet.coverTickets; }
  ]) {
    const args = modelInput(), bundle = JSON.parse(args.bytes); mutate(bundle);
    const bytes = JSON.stringify(bundle), sourceSha256 = hash(bytes);
    const row = clone(args.row); row.sourceSha256 = sourceSha256; row.publicationEvidence.sourceSha256 = sourceSha256;
    const receipt = { ...args.receipt, sourceSha256 };
    assert.equal(publishedTicketSections(row, bytes, args.now).status, 'review');
    assert.throws(() => verifiedModelSubset(row, bytes, receipt, args.beforeDeadline));
  }
});

test('readable-v2 remains a valid ordinary result but cannot supply a fabricated model center', () => {
  const args = modelInput('readable-v2');
  assert.equal(publishedTicketSections(args.row, args.bytes, args.now).status, 'verified');
  assert.throws(() => verifiedModelSubset(args.row, args.bytes, args.receipt, args.beforeDeadline), /model_selection_presentation_unsupported/);
  const bundle = normalFixture();
  // Both sections happen to contain two tickets, but the actual published main
  // contains different tickets than the immutable practical selection.
  bundle.record.prediction.mainSheet = { tickets: ['1-2-3', '1-3-2'], coverTickets: ['1-2-4'], flowTickets: [] };
  const sameCount = modelInput('readable-v2', bundle);
  assert.equal(sameCount.receipt.publishedDisplayProof.sections[0].ticketCount, sameCount.row.ticketCount);
  assert.notEqual(sameCount.receipt.publishedDisplayProof.sections[0].ticketsSha256, hash(JSON.stringify(['1-2-3', '1-2-4'])));
  assert.throws(() => verifiedModelSubset(sameCount.row, sameCount.bytes, sameCount.receipt, sameCount.beforeDeadline), /model_selection_presentation_unsupported/);
});

test('legacy readable-v1 qualifies only with its actual center proof or validated publisher-code evidence', () => {
  const args = modelInput('readable-v1');
  const evidence = verifiedModelSubset(args.row, args.bytes, args.receipt, args.beforeDeadline);
  assert.equal(evidence.presentationVersion, 'readable-v1'); assert.equal(evidence.label, '中心の買い目');
  assert.equal(evidence.ticketCount, 2); assert.equal(evidence.ticketsSha256, hash(JSON.stringify(['1-2-3', '1-2-4'])));
  const legacyRow = clone(args.row), receipt = clone(args.receipt);
  delete legacyRow.publicationEvidence.publishedDisplayProof; delete receipt.publishedDisplayProof;
  assert.deepEqual(verifiedModelSubset(legacyRow, args.bytes, receipt, args.beforeDeadline), evidence);
  const missing = { ...legacyRow }; delete missing.publicationEvidence;
  assert.throws(() => verifiedModelSubset(missing, args.bytes, receipt, args.beforeDeadline), /published_renderer_evidence_missing/);
  legacyRow.publicationEvidence.rendererSha256 = 'f'.repeat(64);
  assert.throws(() => verifiedModelSubset(legacyRow, args.bytes, receipt, args.beforeDeadline), /published_renderer_unreviewed/);
});

test('v3 independent article kinds keep their own source and reference accounting', () => {
  for (const kind of ['escape', 'manshu']) {
    const bundle = fixture(); bundle.monitor.kind = kind;
    bundle.article.paidText += '\n\n参考\n・1-2-3\n・6-1-2'; bundle.monitor.article = clone(bundle.article);
    const args = modelInput('readable-v3', bundle);
    const selected = verifiedModelSubset(args.row, args.bytes, args.receipt, args.beforeDeadline);
    assert.equal(selected.ticketCount, 2);
    const result = publishedTicketSections(args.row, args.bytes, args.now);
    assert.equal(result.publishedTicketCount, 2); assert.equal(result.referenceTicketCount, 2);
    assert.deepEqual(classifyPublishedTickets(args.row, args.bytes, '1-2-3', args.now).matchedSections,
      [kind === 'escape' ? '🎯 独立本命' : '💥 独立万舟']);
    assert.equal(classifyPublishedTickets(args.row, args.bytes, '6-1-2', args.now).status, 'miss');
  }
});

test('v4 keeps v3 paid accounting and source-bound model proof with the corrected free explanation', () => {
  const v3=modelInput('readable-v3'), v4=modelInput('readable-v4');
  assert.equal(v4.article.paidText,v3.article.paidText);
  assert.deepEqual(v4.receipt.publishedDisplayProof.modelSubset,v3.receipt.publishedDisplayProof.modelSubset);
  const evidence=verifiedModelSubset(v4.row,v4.bytes,v4.receipt,v4.beforeDeadline);
  assert.equal(evidence.presentationVersion,'readable-v4');
  assert.equal(evidence.label,'🔄 コロがし検証対象');
  assert.deepEqual(publishedTicketSections(v4.row,v4.bytes,v4.beforeDeadline),{status:'pending',reason:'official_result_pending'});
  const result=publishedTicketSections(v4.row,v4.bytes,v4.now);
  assert.equal(result.status,'verified');
  assert.deepEqual(result.unionTickets,publishedTicketSections(v3.row,v3.bytes,v3.now).unionTickets);
  const changed=clone(v4);changed.receipt.publishedDisplayProof.modelSubset.ticketCount++;
  changed.row.publicationEvidence.publishedDisplayProof=clone(changed.receipt.publishedDisplayProof);
  assert.throws(()=>verifiedModelSubset(changed.row,changed.bytes,changed.receipt,changed.beforeDeadline),/proof_mismatch/);
});
