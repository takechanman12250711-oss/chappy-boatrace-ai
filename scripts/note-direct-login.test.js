'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLoginConfig, safeError, signIn, runDirectAuth, NOTE_LOGIN_URL } = require('./note-direct-login');

function fakePage({ after = 'https://note.com/', form = true, enabled = true, components = [] } = {}) {
  const state = { url: 'about:blank', filled: {}, clicks: 0, visited: [], observations: [] };
  const field = name => ({ waitFor: async () => {}, count: async () => (form ? 1 : 0),
    fill: async value => { state.filled[name] = value; } });
  const page = {
    state,
    goto: async url => { state.visited.push(url); state.url = url; },
    url: () => state.url,
    getByLabel: label => field(label),
    getByRole: () => ({ count: async () => (form ? 1 : 0), isEnabled: async () => enabled,
      click: async () => { state.clicks++; state.url = after; } }),
    waitForURL: async () => {},
    locator: () => ({ count: async () => components.length,
      nth: index => ({ isVisible: async () => { state.observations.push(index); return components[index]; } }) })
  };
  return page;
}

test('credentials are required and are never part of an error', () => {
  assert.throws(() => loadLoginConfig({}), /note_login_id_missing/);
  assert.throws(() => loadLoginConfig({ NOTE_LOGIN_ID: 'a@example.invalid' }), /note_login_password_missing/);
  assert.deepEqual(loadLoginConfig({ NOTE_LOGIN_ID: ' a@example.invalid ', NOTE_LOGIN_PASSWORD: ' p w ' }),
    { id: 'a@example.invalid', password: ' p w ' });
});

test('one sign-in attempt, accepted only when note leaves the login page', async () => {
  const config = { id: 'a@example.invalid', password: 'secret-value' };
  const ok = fakePage();
  assert.equal(await signIn(ok, config), true);
  assert.deepEqual(ok.state.visited, [NOTE_LOGIN_URL]);
  assert.equal(ok.state.clicks, 1);
  assert.deepEqual(ok.state.filled, { 'メールアドレス または note ID': 'a@example.invalid', 'パスワード': 'secret-value' });
  for (const [page, pattern] of [
    [fakePage({ after: 'https://note.com/login' }), /^note_login_not_accepted$/],
    [fakePage({ after: 'https://note.com/login', components: [false] }), /^note_login_verification_component_detected$/],
    [fakePage({ after: 'https://accounts.example.invalid/check?x=secret' }), /^note_login_left_note_accounts\.example\.invalid$/],
    [fakePage({ form: false }), /^note_login_form_not_found$/],
    [fakePage({ enabled: false }), /^note_login_button_disabled$/]
  ]) {
    await assert.rejects(signIn(page, config), error => pattern.test(error.message) && !error.message.includes('secret'));
    assert.ok(page.state.clicks <= 1, 'never retried');
  }
});

test('verification components describe observations, including hidden fields and visible badges, without diagnosing rejection', async () => {
  const config = { id: 'a@example.invalid', password: 'secret-value' };
  for (const [name, components, code] of [
    ['no component', [], 'note_login_not_accepted'],
    ['hidden response textarea', [false], 'note_login_verification_component_detected'],
    ['hidden iframe', [false, false], 'note_login_verification_component_detected'],
    ['visible badge', [true], 'note_login_verification_component_visible'],
    ['visible checkbox with hidden response', [false, true], 'note_login_verification_component_visible']
  ]) {
    const page = fakePage({ after: 'https://note.com/login', components });
    await assert.rejects(signIn(page, config), error => error.message === code, name);
    assert.equal(page.state.clicks, 1, `${name}: no retry`);
    assert.deepEqual(page.state.observations, components.map((_, index) => index), name);
  }
});

test('failed or malformed component observations are unknown, not component absence or login rejection', async () => {
  const config = { id: 'a@example.invalid', password: 'secret-value "q"\nline' };
  const raw = () => Object.assign(new Error(`Call log: ${config.id} ${config.password} ページの本文`),
    { cause: new Error(config.password) });
  const failing = () => { throw raw(); };
  const cases = [
    ['locator failure', page => { page.locator = failing; }],
    ['count failure', page => { page.locator = () => ({ count: failing }); }],
    // Even an exception resembling another safe code is an observation failure.
    ['misleading count exception', page => { page.locator = () => ({ count: async () => { throw new Error('note_login_not_accepted'); } }); }],
    ['nth failure', page => { page.locator = () => ({ count: async () => 1, nth: failing }); }],
    ['visibility failure', page => { page.locator = () => ({ count: async () => 1, nth: () => ({ isVisible: failing }) }); }],
    ['later visibility failure', page => { page.locator = () => ({ count: async () => 2,
      nth: index => ({ isVisible: async () => { if (index) throw raw(); return true; } }) }); }]
  ];
  for (const count of [-1, 1.5, NaN, Infinity, '1', null, undefined, 65, Number.MAX_SAFE_INTEGER]) {
    cases.push([`invalid count ${String(count)}`, page => { page.locator = () => ({ count: async () => count,
      nth: () => assert.fail('invalid count must not enumerate components') }); }]);
  }
  for (const visible of ['false', 0, null, undefined]) {
    cases.push([`invalid visibility ${String(visible)}`, page => { page.locator = () => ({ count: async () => 1,
      nth: () => ({ isVisible: async () => visible }) }); }]);
  }
  for (const [name, breakPage] of cases) {
    const page = fakePage({ after: 'https://note.com/login', components: [false] }); breakPage(page);
    let closed = 0, checked = 0;
    const logs = [];
    const result = runDirectAuth({ env: { NOTE_LOGIN_ID: config.id, NOTE_LOGIN_PASSWORD: config.password },
      launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close: async () => { closed++; } }),
      ensureEditorReady: async () => { checked++; }, log: line => logs.push(line) });
    await assert.rejects(result, error => {
      assert.equal(error.message, 'note_login_verification_observation_failed', name);
      assert.equal(error.cause, undefined, name);
      for (const secret of [config.id, 'secret-value', 'Call log', 'ページ']) {
        assert.ok(!`${error.message}\n${error.stack}`.includes(secret), `${name}: sanitized error`);
      }
      assert.equal(`NOTE_UI_TRANSPORT_FAILED=${error.message}`, 'NOTE_UI_TRANSPORT_FAILED=note_login_verification_observation_failed');
      return true;
    });
    assert.equal(page.state.clicks, 1, `${name}: no retry`);
    assert.equal(closed, 1, `${name}: browser closed`);
    assert.equal(checked, 0, `${name}: editor never opened`);
    assert.deepEqual(logs, [], `${name}: no success logs`);
  }
});

test('the check signs in, verifies the editor, logs fixed codes only and always closes the browser', async () => {
  const env = { NOTE_LOGIN_ID: 'a@example.invalid', NOTE_LOGIN_PASSWORD: 'secret-value' };
  for (const editorFails of [false, true]) {
    const logs = []; let closed = 0, checked = 0;
    const page = fakePage();
    const launch = async () => ({ newContext: async options => {
      assert.deepEqual(options, { locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      return { newPage: async () => page };
    }, close: async () => { closed++; } });
    const ensureEditorReady = async () => { checked++; if (editorFails) throw new Error('note_editor_fields_not_ready'); };
    const run = runDirectAuth({ env, ensureEditorReady, launch, log: line => logs.push(line) });
    if (editorFails) await assert.rejects(run, /note_editor_fields_not_ready/);
    else assert.deepEqual(await run, { loggedIn: true, editorReady: true });
    assert.equal(closed, 1); assert.equal(checked, 1);
    assert.equal(logs[0], 'NOTE_UI_DIRECT_LOGIN=accepted');
    assert.ok(logs.every(line => !line.includes('secret-value') && !line.includes('example.invalid')));
    assert.equal(logs.includes('NOTE_UI_PUBLISH_CLICKED=false'), !editorFails);
  }
  await assert.rejects(runDirectAuth({ env: {}, launch: async () => assert.fail('no browser without credentials') }), /note_login_id_missing/);
});

// Review of #1469: a browser library error carries the typed value in its call
// log. No part of such an error may leave this module.
test('raw browser errors become fixed codes and never carry credentials, page text, cause or stack', async () => {
  const config = { id: 'a@example.invalid', password: 'secret-value "q"\nline' };
  const raw = stage => Object.assign(new Error(`locator.${stage}: Timeout 30000ms exceeded.\nCall log:\n  - fill("${config.password}")\n  - ${config.id}\n  <input value="ページの本文">`),
    { cause: new Error(config.password) });
  const leaks = error => [config.password, 'secret-value', config.id, 'example.invalid', 'Call log', 'ページ']
    .some(text => `${error.message}\n${error.stack}\n${String(error.cause)}`.includes(text));
  const cases = [
    ['goto', page => { page.goto = async () => { throw raw('goto'); }; }, 'note_login_page_open_failed'],
    ['count', page => { page.getByLabel = () => ({ waitFor: async () => {}, count: async () => { throw raw('count'); } }); }, 'note_login_form_check_failed'],
    ['fill', page => { const get = page.getByLabel; page.getByLabel = label => ({ ...get(label), fill: async () => { throw raw('fill'); } }); }, 'note_login_input_failed'],
    ['click', page => { const get = page.getByRole; page.getByRole = () => ({ ...get(), click: async () => { throw raw('click'); } }); }, 'note_login_submit_failed'],
    ['url', page => { const url = page.url; let n = 0; page.url = () => { if (n++) throw raw('url'); return url(); };
      page.waitForURL = async () => { page.url(); }; }, 'note_login_result_check_failed']
  ];
  for (const [name, breakPage, code] of cases) {
    const page = fakePage(); breakPage(page);
    await assert.rejects(signIn(page, config), error => error.message === code && !leaks(error) && error.cause === undefined, name);
  }
  const env = { NOTE_LOGIN_ID: config.id, NOTE_LOGIN_PASSWORD: config.password };
  const logs = [];
  const launch = page => async () => ({ newContext: async () => ({ newPage: async () => page }), close: async () => {} });
  const failingFill = fakePage(); cases[2][1](failingFill);
  // The same text the transport CLI prints: NOTE_UI_TRANSPORT_FAILED=<message>.
  const printed = await runDirectAuth({ env, launch: launch(failingFill), log: line => logs.push(line), ensureEditorReady: async () => {} })
    .catch(error => `NOTE_UI_TRANSPORT_FAILED=${error.message}`);
  assert.equal(printed, 'NOTE_UI_TRANSPORT_FAILED=note_login_input_failed');
  await assert.rejects(runDirectAuth({ env, launch: launch(fakePage()), log: line => logs.push(line),
    ensureEditorReady: async () => { throw raw('editor'); } }), error => error.message === 'note_direct_editor_check_failed' && !leaks(error));
  await assert.rejects(runDirectAuth({ env, launch: async () => { throw raw('launch'); } }),
    error => error.message === 'note_direct_browser_start_failed' && !leaks(error));
  assert.ok(logs.every(line => !leaks({ message: line, stack: '', cause: '' })));
  // Known codes pass through unchanged; anything shaped differently does not.
  for (const code of ['note_login_bot_check', 'note_login_not_accepted', 'note_editor_fields_not_ready',
    'note_login_verification_component_visible', 'note_login_verification_component_detected', 'note_login_verification_observation_failed',
    'note_editor_session_not_ready_note.com', 'note_login_left_note_accounts.example.invalid']) {
    assert.equal(safeError(new Error(code), 'fallback').message, code);
  }
  for (const message of ['note_login_bot_check secret-value', 'note_login_verification_observation_failed secret-value',
    'note_login_verification_component_visible\nCall log', 'note_login_left_note_a b', `note_login_${config.password}`, '', undefined]) {
    assert.equal(safeError(message === undefined ? null : new Error(message), 'fallback').message, 'fallback');
  }
});
