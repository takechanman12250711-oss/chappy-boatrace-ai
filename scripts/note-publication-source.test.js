'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { publicationPayload, verifyPublicationSource } = require('./note-publication-source');
const { requirePublicationGate, preparePublication, publishConfiguredArticle, savePublicationReceipt } = require('./note-github-ui-transport');
global.ChappyPracticalSelection = { createPracticalSelection: prediction => prediction.practicalTickets };
const generator = require('../js/note-generator');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-publish-source-'));
const clock = Date.parse('2030-09-14T06:00:00Z');
const oldClock = Date.now;
const prediction = {
  date: '20300914', race: { date: '20300914', stadiumName: '唐津', raceNo: 10, raceInfo: { deadline: '16:00' } },
  confidence: 84, mainSheet: { honmei: { boatNo: 1, name: "テスト選手", score: 84 },
    evaluations: [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, name: "テスト選手", score: 84 })),
    tickets: [{ ticket: '1-2-3', odds: 20 }] },
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
  assert.deepEqual(verifyPublicationSource(payload, root, clock), payload);
  assert.deepEqual(requirePublicationGate(payload, root, clock), payload);
  for (const field of ['paidText', 'freeText', 'title', 'body', 'sourceSha256', 'price', 'deadlineAt']) {
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
  // Use a one-paragraph paid body for the captured boundary interaction fixture.
  const uiPayload = { ...payload, paidText: '有料本文' };
  blocks[2].text = uiPayload.paidText;
  const submit = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => { clicks++; throw new Error('response_lost'); } };
  const page = { url: () => 'https://editor.note.com/notes/n123abc/publish/',
    getByRole: role => role === 'heading' ? { count: async () => 1, isVisible: async () => true } : submit,
    locator: () => ({ evaluate: async () => blocks }) };
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 500 }, () => {}), /price_unverified/);
  assert.equal(clicks, 0);
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 300 }, () => { throw new Error('stale'); }), /stale/);
  assert.equal(clicks, 0);
  blocks[1].pressed = false;
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {}), /boundary_mismatch/);
  assert.equal(clicks, 0);
  blocks[1].pressed = true;
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {}), /response_lost/);
  assert.equal(clicks, 1, 'never retry an ambiguous publication click');
  let closed = 0;
  const publicUrl = 'https://note.com/test/n/n123abc';
  const publicPage = { goto: async () => ({ ok: () => true }), url: () => publicUrl,
    getByRole: () => ({ waitFor: async () => {} }),
    locator: () => ({ evaluateAll: async () => [new Date(clock).toISOString()] }) };
  page.context = () => ({ browser: () => ({ newContext: async () => ({ newPage: async () => publicPage, close: async () => { closed++; } }) }) });
  page.locator = selector => selector === 'a[href]' ? { evaluateAll: async () => [
    'https://note.com/test/n/n999', 'https://evil.example/test/n/n123abc', publicUrl
  ] } : { evaluate: async () => blocks };
  submit.click = async () => { clicks++; };
  const receipt = await publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {});
  assert.equal(receipt.url, publicUrl);
  assert.equal(receipt.publishedAt, new Date(clock).toISOString());
  assert.equal(closed, 1);
  assert.equal(clicks, 2);
  publicPage.locator = () => ({ evaluateAll: async () => ['2020-01-01T00:00:00Z'] });
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {}), /timestamp_unverified/);
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
  const recovered = await publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {});
  assert.equal(recovered.url, publicUrl);
  assert.equal(clicks, 4, 'list recovery never clicks publish a second time');
  assert.equal(listingClosed, 1);
  assert.equal(closed, 3);
  publicPage.getByRole = () => ({ waitFor: async () => { throw new Error('public_paywall_missing'); } });
  await assert.rejects(publishConfiguredArticle(page, uiPayload, { price: 300 }, () => {}), /public_paywall_missing/);
  assert.equal(clicks, 5);
  assert.equal(closed, 4, 'anonymous verification failure closes its context');
  assert.equal(fs.readFileSync(path.join(root, sourcePath), 'utf8'), bytes, 'source remains immutable');
  console.log('note publication source, claim and final-click tests passed');
}
main().finally(() => { Date.now = oldClock; fs.rmSync(root, { recursive: true, force: true }); })
  .catch(error => { console.error(error); process.exitCode = 1; });

