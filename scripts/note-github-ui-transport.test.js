'use strict';

const assert = require('node:assert/strict');
const {
  EXPECTED_PRICE_YEN,
  firstPaidParagraph,
  articleBody,
  validateDraftGate,
  requireDraftGate,
  run,
  ensureEditorReady,
  isEditorUrl,
  loadStorageState,
  loadBrowserUseConfig,
  createBrowserUseSession,
  stopBrowserUseSession
} = require('./note-github-ui-transport');

const valid = {
  canPublish: true,
  blockReason: null,
  raceKey: '20260913-10-7',
  raceDate: '2026-09-13',
  deadlineAt: '2026-09-13T12:00:00+09:00',
  title: 't',
  freeText: '無料本文',
  paidText: '🔵 本命予想\n\n有料本文',
  price: 300
};
const now = Date.parse('2026-09-13T11:00:00+09:00');
const gate = (payload) => validateDraftGate(payload, now);

const storageState = { cookies: [{ name: 'session', value: 'redacted', domain: '.note.com', path: '/' }], origins: [] };
const encodedState = Buffer.from(JSON.stringify(storageState), 'utf8').toString('base64');

assert.equal(EXPECTED_PRICE_YEN, 300);
assert.deepEqual(gate(valid), { ok: true });
assert.deepEqual(gate({ ...valid, canPublish: false, blockReason: 'deadline_passed' }), { ok: false, reason: 'deadline_passed' });
assert.deepEqual(gate({ ...valid, blockReason: 'audit_error' }), { ok: false, reason: 'audit_error' });
assert.deepEqual(gate({ ...valid, title: '' }), { ok: false, reason: 'title_missing' });
assert.deepEqual(gate({ ...valid, freeText: '' }), { ok: false, reason: 'free_text_missing' });
assert.deepEqual(gate({ ...valid, paidText: '' }), { ok: false, reason: 'paid_text_missing' });
assert.deepEqual(gate({ ...valid, price: 500 }), { ok: false, reason: 'price_not_300' });
assert.deepEqual(gate({ ...valid, deadlineAt: '' }), { ok: false, reason: 'deadline_unavailable' });
assert.deepEqual(gate({ ...valid, deadlineAt: '2026-09-13T12:00:00' }), { ok: false, reason: 'deadline_unavailable' });
assert.deepEqual(gate({ ...valid, raceKey: '20260912-10-7' }), { ok: false, reason: 'race_day_mismatch' });
assert.deepEqual(gate({ ...valid, raceDate: '2026-09-12' }), { ok: false, reason: 'race_day_mismatch' });
assert.deepEqual(validateDraftGate(valid, NaN), { ok: false, reason: 'clock_invalid' });
// A previously valid, unchanged handoff must stop exactly at its deadline.
const deadline = Date.parse(valid.deadlineAt);
assert.deepEqual(validateDraftGate(valid, deadline - 1), { ok: true });
assert.throws(() => requireDraftGate(valid, deadline), /deadline_passed/);
assert.throws(() => requireDraftGate(valid, deadline + 1), /deadline_passed/);
// Date validation follows JST, including UTC's previous day.
assert.deepEqual(validateDraftGate(valid, Date.parse('2026-09-12T15:00:00Z')), { ok: true });
assert.deepEqual(validateDraftGate(valid, Date.parse('2026-09-12T14:59:59Z')), { ok: false, reason: 'race_day_mismatch' });
assert.equal(firstPaidParagraph(valid.paidText), '🔵 本命予想');
assert.equal(articleBody(valid), '無料本文\n\n🔵 本命予想\n\n有料本文');
assert.equal(articleBody(valid).includes('ここから先は有料部分です'), false);
assert.equal(isEditorUrl('https://editor.note.com/new'), true);
assert.equal(isEditorUrl('https://note.com/login?redirectPath=https%3A%2F%2Feditor.note.com%2Fnew'), false);
assert.equal(isEditorUrl('not-a-url'), false);
assert.equal(isEditorUrl('http://editor.note.com/new'), false);
assert.equal(isEditorUrl('https://editor.note.com.example.org/new'), false);
assert.deepEqual(loadStorageState({ NOTE_STATE_JSON_BASE64: encodedState }), storageState);
assert.throws(() => loadStorageState({}), /note_state_missing/);
assert.throws(() => loadStorageState({ NOTE_STATE_JSON_BASE64: 'not-valid-base64-json' }), /note_state_invalid/);
assert.throws(() => loadStorageState({ NOTE_STATE_JSON_BASE64: Buffer.from(JSON.stringify({ cookies: [], origins: [] })).toString('base64') }), /note_state_empty/);

// Missing state stops the CLI before even loading a browser dependency.
async function checkAsyncGuards() {
  await assert.rejects(run({ env: {} }), /browser_use_api_key_missing/);
  await assert.rejects(run({ env: { BROWSER_USE_API_KEY: 'key' } }), /browser_use_profile_id_missing/);
  assert.deepEqual(loadBrowserUseConfig({ BROWSER_USE_API_KEY: ' key ', BROWSER_USE_PROFILE_ID: ' profile ' }), {
    apiKey: 'key',
    profileId: 'profile'
  });
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? { ok: true, status: 201, json: async () => ({ id: 'session', cdpUrl: 'wss://example.invalid/cdp' }) }
      : { ok: true, status: 200 };
  };
  const session = await createBrowserUseSession({ apiKey: 'secret', profileId: 'profile' }, request);
  assert.deepEqual(session, { id: 'session', cdpUrl: 'wss://example.invalid/cdp' });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    profileId: 'profile',
    proxyCountryCode: 'jp',
    timeout: 10
  });
  assert.equal(calls[0].options.headers['X-Browser-Use-API-Key'], 'secret');
  assert.deepEqual(await stopBrowserUseSession({ apiKey: 'secret' }, session.id, request), { ok: true, status: 200 });
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), { action: 'stop' });
  const page = { goto: async () => {}, waitForTimeout: async () => {}, url: () => 'https://editor.note.com/new' };
  // An editor URL alone is not proof of usable authentication.
  await assert.rejects(ensureEditorReady(page, async () => null), /note_editor_fields_not_ready/);
  await assert.rejects(ensureEditorReady(page, async () => ({ isEditable: async () => false })), /note_editor_fields_not_ready/);
  assert.equal(await ensureEditorReady(page, async () => ({ isEditable: async () => true })), 'https://editor.note.com/new');
  await assert.rejects(ensureEditorReady({ ...page, url: () => 'https://note.com/login' }), /note_editor_session_not_ready/);
}
checkAsyncGuards()
  .then(() => console.log('note-github-ui-transport tests passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
