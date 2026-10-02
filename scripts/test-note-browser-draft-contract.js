'use strict';

const assert = require('assert');
const { validateDraftPayload, sha256 } = require('./note-browser-draft-contract');

const sourceRaw = '{"version":"note-draft-bundle-v1"}';
const base = {
  schema: 'note-draft-adapter-v1',
  mode: 'draft_only',
  sourceSha256: sha256(sourceRaw),
  title: 'title',
  freeText: 'free',
  paidText: 'paid',
  safeguards: {
    publishAllowed: false,
    priceChangeAllowed: false,
    reservationAllowed: false,
    credentialStorageAllowed: false,
    requireDuplicateCheck: true,
    requireSourceShaMatch: true
  }
};

const ok = validateDraftPayload(base, sourceRaw, []);
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.action, 'create_draft_only');
assert.deepStrictEqual(ok.forbiddenActions, ['publish', 'set_price', 'schedule', 'store_credentials']);

assert.deepStrictEqual(validateDraftPayload({ ...base, mode: 'publish' }, sourceRaw, []), { ok: false, reason: 'invalid_adapter_payload' });
assert.deepStrictEqual(validateDraftPayload({ ...base, sourceSha256: '0'.repeat(64) }, sourceRaw, []), { ok: false, reason: 'source_sha_mismatch' });
assert.deepStrictEqual(validateDraftPayload(base, sourceRaw, ['title']), { ok: false, reason: 'duplicate_title' });
assert.deepStrictEqual(validateDraftPayload({ ...base, paidText: '' }, sourceRaw, []), { ok: false, reason: 'article_text_missing' });

const unsafe = JSON.parse(JSON.stringify(base));
unsafe.safeguards.publishAllowed = true;
assert.deepStrictEqual(validateDraftPayload(unsafe, sourceRaw, []), { ok: false, reason: 'unsafe_permissions' });

console.log('note-browser-draft-contract tests passed');
