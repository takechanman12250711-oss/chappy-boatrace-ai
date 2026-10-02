'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDraftPayload } = require('./note-draft-adapter');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-draft-adapter-'));
const validPath = path.join(dir, 'valid.json');
fs.writeFileSync(validPath, JSON.stringify({
  version: 'note-draft-bundle-v1',
  article: { ok: true, title: 'title', freeText: 'free', paidText: 'paid' }
}));

const payload = buildDraftPayload(validPath);
assert.strictEqual(payload.schema, 'note-draft-adapter-v1');
assert.strictEqual(payload.mode, 'draft_only');
assert.strictEqual(payload.title, 'title');
assert.strictEqual(payload.freeText, 'free');
assert.strictEqual(payload.paidText, 'paid');
assert.strictEqual(payload.safeguards.publishAllowed, false);
assert.strictEqual(payload.safeguards.priceChangeAllowed, false);
assert.strictEqual(payload.safeguards.reservationAllowed, false);
assert.strictEqual(payload.safeguards.credentialStorageAllowed, false);
assert.strictEqual(payload.safeguards.requireDuplicateCheck, true);
assert.strictEqual(payload.safeguards.requireSourceShaMatch, true);
assert.match(payload.sourceSha256, /^[a-f0-9]{64}$/);

const badVersion = path.join(dir, 'bad-version.json');
fs.writeFileSync(badVersion, JSON.stringify({ version: 'other', article: {} }));
assert.throws(() => buildDraftPayload(badVersion), /unsupported_bundle_version/);

const notReady = path.join(dir, 'not-ready.json');
fs.writeFileSync(notReady, JSON.stringify({ version: 'note-draft-bundle-v1', article: { ok: false } }));
assert.throws(() => buildDraftPayload(notReady), /article_not_ready/);

const missingText = path.join(dir, 'missing-text.json');
fs.writeFileSync(missingText, JSON.stringify({
  version: 'note-draft-bundle-v1',
  article: { ok: true, title: 'title', freeText: '', paidText: 'paid' }
}));
assert.throws(() => buildDraftPayload(missingText), /article_text_missing/);

console.log('note-draft-adapter tests passed');
