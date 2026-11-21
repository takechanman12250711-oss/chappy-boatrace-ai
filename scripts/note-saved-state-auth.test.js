'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LAUNCH_OPTIONS, safeError, runSavedStateAuth } = require('./note-saved-state-auth');
const { loadStorageState, run, NOTE_UI_ROUTES, noteUiRoute, prepareNoteBrowser } = require('./note-github-ui-transport');

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

test('the check opens a normal window and the workflow gives it a virtual display', () => {
  assert.deepEqual({ ...LAUNCH_OPTIONS }, { headless: false });
  assert.ok(Object.isFrozen(LAUNCH_OPTIONS));
  const workflow = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '.github', 'workflows', 'note-github-ui-transport.yml'), 'utf8');
  assert.match(workflow, /"\$NOTE_UI_BROWSER" = "github-state" \] \|\| \[ "\$NOTE_UI_ROUTE" = "saved-state" \]; then\r?\n\s+display="xvfb-run -a"/);
  assert.match(workflow, /\$display node scripts\/publish-note-queue\.js/);
  assert.match(workflow, /\$display node scripts\/note-github-ui-transport\.js/);
  assert.match(workflow, /NOTE_UI_ROUTE: \$\{\{ vars\.NOTE_UI_ROUTE \|\| 'browser-use' \}\}/);
});

test('the route defaults to Browser Use and rejects unknown names', () => {
  assert.deepEqual([...NOTE_UI_ROUTES], ['browser-use', 'saved-state']);
  assert.equal(noteUiRoute({}), 'browser-use');
  assert.equal(noteUiRoute({ NOTE_UI_ROUTE: ' saved-state ' }), 'saved-state');
  assert.throws(() => noteUiRoute({ NOTE_UI_ROUTE: 'other' }), /^Error: unsupported_note_ui_route$/);
  assert.throws(() => prepareNoteBrowser({}), /browser_use_api_key_missing/);
  assert.throws(() => prepareNoteBrowser({ NOTE_UI_ROUTE: 'saved-state' }), /note_state_missing/);
  assert.throws(() => prepareNoteBrowser({ NOTE_UI_ROUTE: 'saved-state', BROWSER_USE_API_KEY: 'k', BROWSER_USE_PROFILE_ID: 'p' }), /note_state_missing/);
});

test('the saved-state route opens a normal window whose first context is signed in, with no Browser Use call', async () => {
  const calls = [];
  const signedIn = { id: 'signed-in' };
  const chromium = {
    launch: async options => { calls.push(['launch', options]); return {
      newContext: async options => { calls.push(['newContext', options]); return signedIn; },
      contexts: () => [signedIn], close: async () => { calls.push(['close']); } }; },
    connectOverCDP: async () => { throw new Error('must_not_connect'); }
  };
  const never = async () => { throw new Error('must_not_call_browser_use'); };
  const route = prepareNoteBrowser({ ...validEnv(), NOTE_UI_ROUTE: 'saved-state' }, { createSession: never, stopSession: never });
  assert.equal(route.route, 'saved-state');
  const browser = await route.open(chromium);
  assert.equal(browser.contexts()[0], signedIn);
  assert.deepEqual(calls[0], ['launch', { headless: false }]);
  assert.equal(calls[1][1].storageState.cookies[0].value, SECRET);
  assert.equal(calls[1][1].locale, 'ja-JP');
  assert.deepEqual(await route.stop(), { ok: true });
});

test('a saved-state browser failure closes the browser and keeps only a fixed code', async () => {
  let closed = 0;
  const chromium = { launch: async () => ({ newContext: async () => { throw new Error(`bad cookie ${SECRET}`); }, close: async () => { closed++; } }) };
  const route = prepareNoteBrowser({ ...validEnv(), NOTE_UI_ROUTE: 'saved-state' });
  await assert.rejects(route.open(chromium), error => error.message === 'note_state_browser_start_failed' && !String(error.stack).includes(SECRET));
  assert.equal(closed, 1);
  await assert.rejects(route.open({ launch: async () => { throw new Error(SECRET); } }), error => error.message === 'note_state_browser_start_failed');
});

test('the Browser Use route still creates, connects and stops its session', async () => {
  const calls = [];
  const route = prepareNoteBrowser({ BROWSER_USE_API_KEY: 'key', BROWSER_USE_PROFILE_ID: 'profile' }, {
    createSession: async config => { calls.push(['create', config]); return { id: 'session-1', cdpUrl: 'wss://example.invalid/cdp' }; },
    stopSession: async (config, id) => { calls.push(['stop', id]); return { ok: true, status: 200 }; }
  });
  assert.equal(route.route, 'browser-use');
  assert.deepEqual(await route.stop(), { ok: true });
  assert.equal(calls.length, 0, 'nothing to stop before a session exists');
  const browser = await route.open({ connectOverCDP: async url => { calls.push(['connect', url]); return { id: 'remote' }; },
    launch: async () => { throw new Error('must_not_launch'); } });
  assert.equal(browser.id, 'remote');
  assert.deepEqual(await route.stop(), { ok: true, status: 200 });
  assert.deepEqual(calls, [['create', { apiKey: 'key', profileId: 'profile' }], ['connect', 'wss://example.invalid/cdp'], ['stop', 'session-1']]);
});

test('the transport uses the saved state only in auth mode', async () => {
  for (const NOTE_UI_MODE of ['draft', 'publish']) {
    await assert.rejects(run({ env: { NOTE_UI_MODE, NOTE_UI_BROWSER: 'github-state' } }), /saved_state_auth_mode_only/);
  }
  await assert.rejects(run({ env: { NOTE_UI_MODE: 'auth', NOTE_UI_BROWSER: 'github-state' } }), error => error.message === 'note_state_missing');
});
