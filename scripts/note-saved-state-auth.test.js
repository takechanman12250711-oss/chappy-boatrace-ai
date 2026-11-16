'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeError, runSavedStateAuth } = require('./note-saved-state-auth');
const { loadStorageState, run } = require('./note-github-ui-transport');

const SECRET = 'cookie-value-must-never-be-logged';
const encode = state => Buffer.from(JSON.stringify(state)).toString('base64');
const validEnv = () => ({ NOTE_STATE_JSON_BASE64: encode({ cookies: [{ name: 's', value: SECRET, domain: '.note.com', path: '/' }], origins: [] }) });

function fakeBrowser() {
  const seen = { contexts: [], closed: 0 };
  return {
    seen,
    launch: async () => ({
      newContext: async options => { seen.contexts.push(options); return { newPage: async () => ({ id: 'page' }) }; },
      close: async () => { seen.closed++; }
    })
  };
}

test('the saved state reaches the editor check and only fixed lines are logged', async () => {
  const browser = fakeBrowser();
  const lines = [];
  let checked = 0;
  const result = await runSavedStateAuth({ env: validEnv(), loadStorageState, launch: browser.launch,
    ensureEditorReady: async page => { assert.equal(page.id, 'page'); checked++; }, log: line => lines.push(line) });
  assert.deepEqual(result, { stateLoaded: true, editorReady: true });
  assert.equal(checked, 1);
  assert.equal(browser.seen.contexts.length, 1);
  assert.equal(browser.seen.contexts[0].storageState.cookies[0].value, SECRET);
  assert.equal(browser.seen.closed, 1);
  assert.deepEqual(lines, ['NOTE_UI_STATE_LOADED=true', 'NOTE_UI_EDITOR_READY=true', 'NOTE_UI_DRAFT_FILLED=false', 'NOTE_UI_PUBLISH_CLICKED=false']);
  assert.ok(!lines.join('\n').includes(SECRET));
});

test('a missing, broken or empty state stops before any browser starts', async () => {
  for (const [env, pattern] of [
    [{}, /^note_state_missing$/],
    [{ NOTE_STATE_JSON_BASE64: 'not-json' }, /^note_state_invalid$/],
    [{ NOTE_STATE_JSON_BASE64: encode({ cookies: [], origins: [] }) }, /^note_state_empty$/]
  ]) {
    const browser = fakeBrowser();
    await assert.rejects(runSavedStateAuth({ env, loadStorageState, launch: browser.launch, ensureEditorReady: async () => {} }),
      error => pattern.test(error.message));
    assert.equal(browser.seen.contexts.length, 0);
  }
});

test('a rejected session is reported once with a fixed code and the browser is closed', async () => {
  for (const [thrown, pattern] of [
    ['note_editor_session_not_ready_note.com', /^note_editor_session_not_ready_note\.com$/],
    ['note_editor_fields_not_ready', /^note_editor_fields_not_ready$/],
    [`page.goto: failed with cookie ${SECRET}`, /^note_state_editor_check_failed$/]
  ]) {
    const browser = fakeBrowser();
    let checked = 0;
    await assert.rejects(runSavedStateAuth({ env: validEnv(), loadStorageState, launch: browser.launch, log: () => {},
      ensureEditorReady: async () => { checked++; throw new Error(thrown); } }),
      error => pattern.test(error.message) && !error.message.includes(SECRET) && !String(error.stack).includes(SECRET) && error.cause === undefined);
    assert.equal(checked, 1);
    assert.equal(browser.seen.closed, 1);
  }
});

test('browser start failures never carry the original error text', async () => {
  await assert.rejects(runSavedStateAuth({ env: validEnv(), loadStorageState, ensureEditorReady: async () => {},
    launch: async () => { throw new Error(`launch failed ${SECRET}`); } }),
    error => error.message === 'note_state_browser_start_failed');
  assert.equal(safeError(new Error(SECRET), 'fallback_code').message, 'fallback_code');
  assert.equal(safeError(new Error('note_state_missing'), 'fallback_code').message, 'note_state_missing');
});

test('the transport uses the saved state only in auth mode', async () => {
  for (const NOTE_UI_MODE of ['draft', 'publish']) {
    await assert.rejects(run({ env: { NOTE_UI_MODE, NOTE_UI_BROWSER: 'github-state' } }), /saved_state_auth_mode_only/);
  }
  await assert.rejects(run({ env: { NOTE_UI_MODE: 'auth', NOTE_UI_BROWSER: 'github-state' } }), error => error.message === 'note_state_missing');
});
