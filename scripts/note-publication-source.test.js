'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MAX_PUBLICATION_TICKETS, requirePublicationTicketCount, publicationPayload, parsePublishedDisplayProof, verifyPublicationSource } = require('./note-publication-source');
const { requirePublicationGate, preparePublication, publishConfiguredArticle, recoverClaimedPublication, savePublicationReceipt } = require('./note-github-ui-transport');
global.ChappyPracticalSelection = { createPracticalSelection: prediction => prediction.practicalTickets };
const generator = require('../js/note-generator');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-publish-source-'));
fs.mkdirSync(path.join(root, 'config'), { recursive: true });
fs.copyFileSync(path.join(__dirname, '../config/note-marketing.json'), path.join(root, 'config/note-marketing.json'));
const clock = Date.parse('2030-09-14T06:00:00Z');
const oldClock = Date.now;
const prediction = {
  date: '20300914', race: { date: '20300914', stadiumName: '唐津', raceNo: 10, raceInfo: { deadline: '16:00' } },
  confidence: 84, mainSheet: { honmei: { boatNo: 1, name: "テスト選手", score: 84 },
    evaluations: [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, name: "テスト選手", score: 84 })),
    tickets: [{ ticket: '1-2-3', odds: 20 }, { ticket: '1-2-4', odds: 25 }],
    coverTickets: [{ ticket: '1-3-2', odds: 30 }], flowTickets: [{ ticket: '2-1-3', odds: 50 }] },
  manshuSheet: { tickets: [{ ticket: '3-4-5', odds: 120 }] },
  // This internal-only candidate must never enter publication proof.
  candidate24Tickets: [{ ticket: '6-5-4', odds: 180 }],
  practicalTickets: [{ ticket: '1-2-3', odds: 20, category: '本命' }],
  raceFlow: { title: 'イン逃げ本線', summary: '1号艇の逃げを中心に考える。' }
};
const article = generator.generateArticle(prediction);
const bundle = { version: 'note-draft-bundle-v1', article,
  record: { date: '20300914', jcd: '23', place: '唐津', raceNo: 10, raceKey: '20300914-23-10',
    deadlineAt: '2030-09-14T16:00:00+09:00', prediction },
  baselinePracticalTickets: prediction.practicalTickets, minLeadSeconds: 120, maxPracticalTickets: 10 };
bundle.record.selectedAt = new Date(clock).toISOString();
bundle.record.exhibitionSnapshot = require('./note-exhibition').exhibitionSnapshot({
  entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
  startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.12, mappingSource: 'official-start-image' }))
}, bundle.record.selectedAt);
const bytes = JSON.stringify(bundle);
const hash = createHash('sha256').update(bytes).digest('hex');
const sourcePath = `data/note-drafts/20300914/20300914-23-10-${hash}.json`;
fs.mkdirSync(path.dirname(path.join(root, sourcePath)), { recursive: true });
fs.writeFileSync(path.join(root, sourcePath), bytes);
const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_SHA: 'a'.repeat(40), NOTE_CLAIM_TOKEN: 'test-token' };

async function main() {
  Date.now = () => clock;
  const payload = publicationPayload(sourcePath, root, clock);
  assert.equal(payload.canPublish, true);
  assert.equal(payload.practicalTicketCount, 1);
  assert.equal(payload.presentationVersion, 'readable-v3');
  assert.equal(typeof payload.publishedDisplayProofJson, 'string');
  const displayProof = parsePublishedDisplayProof(payload);
  const sha = value => createHash('sha256').update(value).digest('hex');
  assert.equal(displayProof.version, 'published-ticket-sections-v1');
  assert.equal(displayProof.presentationVersion, payload.presentationVersion);
  assert.equal(displayProof.paidTextSha256, sha(payload.paidText));
  assert.equal(displayProof.publishedTicketsSha256, sha(JSON.stringify(['1-2-3', '1-2-4', '1-3-2', '2-1-3', '3-4-5'])));
  assert.equal(displayProof.publishedTicketCount, 5);
  assert.deepEqual(displayProof.sections.map(section => section.label), [
    '🎯 本命', '🛡️ 押さえ', '🌊 流し', '💥 万舟狙い'
  ]);
  assert.equal(displayProof.sections[0].ticketCount, 2);
  assert.deepEqual(displayProof.modelSubset, { version: 'note-korogashi-display-v1', label: '🔄 コロがし検証対象',
    sourceSha256: hash, ticketCount: 1, ticketsSha256: sha(JSON.stringify(['1-2-3'])), includedInPublishedResult: false });
  assert.ok(payload.paidText.includes('🔄 コロがし検証対象'));
  assert.throws(() => parsePublishedDisplayProof({ ...payload, sourceSha256: 'd'.repeat(64) }), /proof_mismatch/);
  assert.throws(() => parsePublishedDisplayProof({ ...payload, sourceSha256: undefined }), /source_hash_invalid/);
  assert.throws(() => parsePublishedDisplayProof({ ...payload, publishedDisplayProofJson: JSON.stringify({
    ...displayProof, modelSubset: { ...displayProof.modelSubset, tickets: ['1-2-3'] } }) }), /proof_mismatch/);
  assert.ok(displayProof.sections.every(section => section.includedInPublishedResult === true));
  assert.equal(displayProof.sections[0].ticketsSha256, sha(JSON.stringify(['1-2-3', '1-2-4'])));
  assert.equal(JSON.stringify(displayProof).includes('1-2-3'), false);
  assert.equal(JSON.stringify(displayProof).includes('6-5-4'), false);
  assert.equal(JSON.stringify(displayProof).includes(payload.paidText), false);
  assert.ok(payload.freeText.startsWith('🚤 9月14日 唐津10R\n🕒 締切 16:00'));
  assert.deepEqual(require('./note-readable-article').ticketsIn(payload.freeText), []);
  assert.ok(payload.paidText.includes('📌 合計（重複なし）\n公開予想：5点'));
  assert.ok(!/金額|予算|[0-9０-９]+円|[¥￥]/.test(payload.paidText));
  assert.ok(payload.freeText.includes('💡 すべての買い目を購入する前提ではありません。'));
  for (const [heading, changed] of [['🎯 本命', '本命'], ['🛡️ 押さえ', '🎯 独立本命'], ['💥 万舟狙い', '💥 当選確実']]) {
    assert.throws(() => parsePublishedDisplayProof({ ...payload, paidText: payload.paidText.replace(heading, changed) }));
  }
  // A valid legacy proof still round-trips by its explicit presentation version.
  const legacyArticle = require('./note-readable-article').readableArticle(article, bundle, { presentationVersion: 'readable-v1' });
  const legacyProof = require('./note-published-ticket-sections').sectionProof(legacyArticle.paidText, 'readable-v1');
  assert.deepEqual(parsePublishedDisplayProof({ paidText: legacyArticle.paidText, presentationVersion: 'readable-v1',
    publishedDisplayProofJson: JSON.stringify(legacyProof) }), legacyProof);
  const v2Article = require('./note-readable-article').readableArticle(article, bundle, { presentationVersion: 'readable-v2' });
  const v2Proof = require('./note-published-ticket-sections').sectionProof(v2Article.paidText, 'readable-v2');
  assert.deepEqual(parsePublishedDisplayProof({ paidText: v2Article.paidText, presentationVersion: 'readable-v2',
    publishedDisplayProofJson: JSON.stringify(v2Proof) }), v2Proof);
  assert.equal(Object.hasOwn(v2Proof, 'modelSubset'), false);
  assert.throws(() => parsePublishedDisplayProof({ ...payload, publishedDisplayProofJson: undefined }), /proof_missing/);
  assert.throws(() => parsePublishedDisplayProof({ ...payload, presentationVersion: undefined }), /proof_missing/);
  assert.throws(() => parsePublishedDisplayProof({ ...payload, publishedDisplayProofJson: '{' }), /proof_invalid/);
  for (const tampered of [null, [], { ...displayProof, paidTextSha256: 'a'.repeat(64) },
    { ...displayProof, publishedTicketsSha256: 'b'.repeat(64) }, { ...displayProof, tickets: ['1-2-3'] },
    { ...displayProof, paidText: payload.paidText }]) {
    assert.throws(() => parsePublishedDisplayProof({ ...payload, publishedDisplayProofJson: JSON.stringify(tampered) }), /proof_mismatch/);
  }
  assert.equal(MAX_PUBLICATION_TICKETS, 7);
  assert.equal(requirePublicationTicketCount({ practicalTickets: Array(7).fill({ ticket: '1-2-3' }) }), 7);
  assert.throws(() => requirePublicationTicketCount({ practicalTickets: Array(8).fill({ ticket: '1-2-3' }) }), /exceeds_7/);
  // The new appendix must not replace the established oversized-source reason.
  const oversized = structuredClone(bundle);
  const oversizedTickets = ['1-2-3', '1-2-4', '1-2-5', '1-2-6', '1-3-2', '1-3-4', '1-3-5', '1-3-6']
    .map(ticket => ({ ticket, odds: 20, category: '本命' }));
  oversized.baselinePracticalTickets = structuredClone(oversizedTickets);
  oversized.record.prediction.practicalTickets = structuredClone(oversizedTickets);
  oversized.record.prediction.mainSheet.tickets = structuredClone(oversizedTickets);
  oversized.article = generator.generateArticle(oversized.record.prediction);
  const oversizedBytes = JSON.stringify(oversized);
  const oversizedPath = `data/note-drafts/20300914/20300914-23-10-${sha(oversizedBytes)}.json`;
  fs.writeFileSync(path.join(root, oversizedPath), oversizedBytes);
  assert.throws(() => publicationPayload(oversizedPath, root, clock), /publication_ticket_count_exceeds_7/);
  assert.deepEqual(verifyPublicationSource(payload, root, clock), payload);
  assert.deepEqual(requirePublicationGate(payload, root, clock), payload);
  // An old source that today's compactor can display still cannot acquire a v3
  // receipt unless the immutable original supports frozen result reconstruction.
  const oldSource = structuredClone(bundle);
  oldSource.article.format = 'formation-v3';
  oldSource.article.paidText = '買い目\n\n・1-2-3\n\n計 1点';
  oldSource.article.fullText = [oldSource.article.freeText, oldSource.article.paywallMarker,
    oldSource.article.paidText, '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。', oldSource.article.tags.join(' ')].join('\n\n');
  const oldBytes = JSON.stringify(oldSource), oldPath = `data/note-drafts/20300914/20300914-23-10-${sha(oldBytes)}.json`;
  fs.writeFileSync(path.join(root, oldPath), oldBytes);
  assert.throws(() => publicationPayload(oldPath, root, clock), /published_original_format_unsupported/);
  const { loadCoverTemplate } = require('./note-cover');
  assert.ok(loadCoverTemplate(payload, root, clock).html.includes('ChappyRound'));
  assert.throws(() => loadCoverTemplate({ ...payload, paidText: '別原稿' }, root, clock), /mismatch/);
  for (const field of ['paidText', 'freeText', 'title', 'body', 'sourceSha256', 'price', 'deadlineAt', 'practicalTicketCount', 'articleSeries', 'publicationKey', 'presentationVersion', 'publishedDisplayProofJson']) {
    assert.throws(() => verifyPublicationSource({ ...payload, [field]: 'tampered' }, root, clock), /mismatch/);
  }
  assert.throws(() => requirePublicationGate(payload, root, Date.parse(bundle.record.deadlineAt) - 60000), /audit_blocked/);
  assert.throws(() => requirePublicationGate(payload, root, Date.parse(bundle.record.deadlineAt)), /deadline_passed/);
  assert.throws(() => publicationPayload('../../etc/passwd', root, clock), /path_invalid/);
  fs.writeFileSync(path.join(root, sourcePath), bytes + ' ');
  assert.throws(() => publicationPayload(sourcePath, root, clock), /hash_mismatch/);
  fs.writeFileSync(path.join(root, sourcePath), bytes);
  fs.mkdirSync(path.join(root, 'data/note-publish'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/note-publish/latest.json'), JSON.stringify({ candidates: [
    { raceKey: 'old', sourcePath: 'invalid' }, { raceKey: payload.raceKey, sourcePath }
  ] }));
  const ready = await preparePublication({ rootDir: root, env, request: async () => ({ status: 404 }) });
  assert.equal(ready.ok, true);
  assert.equal(ready.skipped.length, 1);
  const ref = require('./note-github-ui-transport').draftClaimRef(payload);
  const used = await preparePublication({ rootDir: root, env, request: async () => ({ status: 200, json: async () => ({ ref }) }) });
  assert.equal(used.ok, false);
  assert.equal(used.skipped[1].reason, 'prior_attempt_review_required');
  await assert.rejects(preparePublication({ rootDir: root, env, request: async () => ({ status: 403 }) }), /lookup_failed/);
  let posts = [];
  await savePublicationReceipt(payload, { raceKey: payload.raceKey, url: 'https://note.com/test/n123' }, env, async (url, options) => {
    const data = JSON.parse(options.body); posts.push({ url, data });
    return { status: 201, json: async () => url.endsWith('/refs') ? { ref: data.ref, object: { sha: data.sha } } : { sha: 'b'.repeat(40) } };
  });
  assert.equal(posts.length, 3);
  assert.match(posts[2].data.ref, /^refs\/tags\/note-published\//);
  assert.equal(JSON.stringify(posts).includes('test-token'), false);
  let clicks = 0;
  const blocks = [{ text: payload.freeText, widget: false }, { widget: true, buttons: 1, pressed: true },
    { text: payload.paidText, widget: false }];
  // Preserve the exact rendered body and its proof in the final-click fixture.
  const uiPayload = { ...payload };
  const submit = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clicks++; throw new Error('response_lost'); } };
  const page = { url: () => 'https://editor.note.com/notes/n123abc/publish/',
    getByRole: role => role === 'heading' ? { count: async () => 1, isVisible: async () => true } : submit,
    locator: () => ({ evaluate: async () => blocks }) };
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 500 }, () => {}), /price_unverified/);
  assert.equal(clicks, 0);
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 200 }, () => { throw new Error('stale'); }), /stale/);
  assert.equal(clicks, 0);
  await assert.rejects(publishConfiguredArticle(page, { ...uiPayload, publishedDisplayProofJson: undefined }, { price: 200 }, () => {}), /proof_missing/);
  await assert.rejects(publishConfiguredArticle(page, { ...uiPayload,
    publishedDisplayProofJson: JSON.stringify({ ...displayProof, publishedTicketCount: 24 }) }, { price: 200 }, () => {}), /proof_mismatch/);
  assert.equal(clicks, 0, 'missing or altered display proof fails before the one publish click');
  blocks[1].pressed = false;
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {}), /boundary_mismatch/);
  assert.equal(clicks, 0);
  blocks[1].pressed = true;
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {}), /response_lost/);
  assert.equal(clicks, 1, 'never retry an ambiguous publication click');
  let closed = 0;
  const publicUrl = 'https://note.com/test/n/n123abc';
  const publicPage = { goto: async () => ({ ok: () => true }), url: () => publicUrl,
    getByRole: (role, options) => ({ waitFor: async () => { if (role === 'button') assert.equal(options.name, '¥200'); } }),
    locator: () => ({ evaluateAll: async () => [new Date(clock).toISOString()] }) };
  page.context = () => ({ browser: () => ({ newContext: async () => ({ newPage: async () => publicPage, close: async () => { closed++; } }) }) });
  page.locator = selector => selector === 'a[href]' ? { evaluateAll: async () => [
    'https://note.com/test/n/n999', 'https://evil.example/test/n/n123abc', publicUrl
  ] } : { evaluate: async () => blocks };
  submit.click = async () => { clicks++; };
  const receipt = await publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {});
  assert.equal(receipt.url, publicUrl);
  assert.equal(receipt.price, 200);
  assert.equal(receipt.publishedAt, new Date(clock).toISOString());
  assert.equal(receipt.sourceSha256, hash);
  assert.deepEqual(receipt.publishedDisplayProof, displayProof);
  assert.equal(JSON.stringify(receipt).includes('1-2-3'), false);
  assert.equal(Object.hasOwn(receipt, 'paidText'), false);
  assert.equal(closed, 1);
  assert.equal(clicks, 2);
  publicPage.locator = () => ({ evaluateAll: async () => ['2020-01-01T00:00:00Z'] });
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {}), /timestamp_unverified/);
  assert.equal(closed, 2);
  assert.equal(clicks, 3);
  // A real 2026-09-23 publication was visible in /notes although the completion
  // screen exposed no public link. Recovery must still pass anonymous checks.
  let listingClosed = 0;
  const listing = {
    goto: async () => ({ ok: () => true }), url: () => 'https://note.com/notes',
    locator: () => ({ first: () => ({ waitFor: async () => {} }), evaluateAll: async () => [publicUrl] }),
    close: async () => { listingClosed++; }
  };
  const verification = { newPage: async () => publicPage, close: async () => { closed++; } };
  page.context = () => ({ newPage: async () => listing, browser: () => ({ newContext: async () => verification }) });
  page.waitForTimeout = async () => {};
  page.locator = selector => selector === 'a[href]' ? { evaluateAll: async () => [] } : { evaluate: async () => blocks };
  publicPage.locator = () => ({ evaluateAll: async () => [new Date(clock).toISOString()] });
  const recovered = await publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {});
  assert.equal(recovered.url, publicUrl);
  assert.equal(clicks, 4, 'list recovery never clicks publish a second time');
  assert.equal(listingClosed, 1);
  assert.equal(closed, 3);
  publicPage.getByRole = () => ({ waitFor: async () => { throw new Error('public_paywall_missing'); } });
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 200 }, () => {}), /public_paywall_missing/);
  assert.equal(clicks, 5);
  assert.equal(closed, 4, 'anonymous verification failure closes its context');
  let recoveryUrl;
  let recoveryBody = `${payload.freeText}\n\n${payload.paidText}\n¥200`;
  const recoveredLink = { first: () => ({ waitFor: async () => {} }), filter: () => recoveredLink,
    count: async () => 1, getAttribute: async () => publicUrl };
  const recoveryPage = {
    goto: async url => { recoveryUrl = url; return { ok: () => true }; }, url: () => recoveryUrl,
    getByRole: role => role === 'link' ? recoveredLink : { waitFor: async () => {} },
    locator: selector => selector === 'article' ? { innerText: async () => recoveryBody } :
      selector === '.note-common-styles__textnote-body' ? { count: async () => 1, innerText: async () => recoveryBody.replace(/\n¥200$/, '') } :
      { evaluateAll: async () => [new Date(clock).toISOString()] }
  };
  const recoveryMock = require('./note-recovery-test-fixture.cjs').requestFixture(payload, { rootDir: root });
  const recoveryGate = await require('./note-github-ui-transport').recoveryClaimStatus(payload, env, recoveryMock.request, root);
  const claimedReceipt = await recoverClaimedPublication(recoveryPage, payload, root, recoveryGate.recoveryEvidence);
  assert.equal(claimedReceipt.url, publicUrl);
  assert.equal(claimedReceipt.sourceSha256, hash);
  assert.deepEqual(claimedReceipt.publishedDisplayProof, displayProof);
  assert.equal(JSON.stringify(claimedReceipt).includes('1-2-3'), false);
  recoveryBody = recoveryBody.replace('3 → 4 → 5', '3 → 4 → 6');
  await assert.rejects(recoverClaimedPublication(recoveryPage, payload, root, recoveryGate.recoveryEvidence), /recovery_body_mismatch/);
  assert.equal(fs.readFileSync(path.join(root, sourcePath), 'utf8'), bytes, 'source remains immutable');
  console.log('note publication source, claim and final-click tests passed');
}
main().finally(() => { Date.now = oldClock; fs.rmSync(root, { recursive: true, force: true }); })
  .catch(error => { console.error(error); process.exitCode = 1; });
