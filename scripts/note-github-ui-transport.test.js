'use strict';

const assert = require('node:assert/strict');
const {
  EXPECTED_PRICE_YEN,
  firstPaidParagraph,
  articleBody,
  validateDraftGate,
  isEditorUrl,
  loadStorageState
} = require('./note-github-ui-transport');

const valid = {
  canPublish: true,
  title: 't',
  freeText: '無料本文',
  paidText: '🔵 本命予想\n\n有料本文',
  price: 300
};

const storageState = { cookies: [{ name: 'session', value: 'redacted', domain: '.note.com', path: '/' }], origins: [] };
const encodedState = Buffer.from(JSON.stringify(storageState), 'utf8').toString('base64');

assert.equal(EXPECTED_PRICE_YEN, 300);
assert.deepEqual(validateDraftGate(valid), { ok: true });
assert.deepEqual(validateDraftGate({ ...valid, canPublish: false, blockReason: 'deadline_passed' }), { ok: false, reason: 'deadline_passed' });
assert.deepEqual(validateDraftGate({ ...valid, title: '' }), { ok: false, reason: 'title_missing' });
assert.deepEqual(validateDraftGate({ ...valid, freeText: '' }), { ok: false, reason: 'free_text_missing' });
assert.deepEqual(validateDraftGate({ ...valid, paidText: '' }), { ok: false, reason: 'paid_text_missing' });
assert.deepEqual(validateDraftGate({ ...valid, price: 500 }), { ok: false, reason: 'price_not_300' });
assert.equal(firstPaidParagraph(valid.paidText), '🔵 本命予想');
assert.equal(articleBody(valid), '無料本文\n\n🔵 本命予想\n\n有料本文');
assert.equal(articleBody(valid).includes('ここから先は有料部分です'), false);
assert.equal(isEditorUrl('https://editor.note.com/new'), true);
assert.equal(isEditorUrl('https://note.com/login?redirectPath=https%3A%2F%2Feditor.note.com%2Fnew'), false);
assert.equal(isEditorUrl('not-a-url'), false);
assert.deepEqual(loadStorageState({ NOTE_STATE_JSON_BASE64: encodedState }), storageState);
assert.throws(() => loadStorageState({}), /note_state_missing/);
assert.throws(() => loadStorageState({ NOTE_STATE_JSON_BASE64: 'not-valid-base64-json' }), /note_state_invalid/);
assert.throws(() => loadStorageState({ NOTE_STATE_JSON_BASE64: Buffer.from(JSON.stringify({ cookies: [], origins: [] })).toString('base64') }), /note_state_empty/);

console.log('note-github-ui-transport tests passed');
