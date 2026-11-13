'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLoginConfig, signIn, runDirectAuth, NOTE_LOGIN_URL } = require('./note-direct-login');

function fakePage({ after = 'https://note.com/', form = true, enabled = true } = {}) {
  const state = { url: 'about:blank', filled: {}, clicks: 0, visited: [] };
  const field = name => ({ waitFor: async () => {}, count: async () => (form ? 1 : 0),
    fill: async value => { state.filled[name] = value; } });
  const page = {
    state,
    goto: async url => { state.visited.push(url); state.url = url; },
    url: () => state.url,
    getByLabel: label => field(label),
    getByRole: () => ({ count: async () => (form ? 1 : 0), isEnabled: async () => enabled,
      click: async () => { state.clicks++; state.url = after; } }),
    waitForURL: async () => {}
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
    [fakePage({ after: 'https://accounts.example.invalid/check?x=secret' }), /^note_login_left_note_accounts\.example\.invalid$/],
    [fakePage({ form: false }), /^note_login_form_not_found$/],
    [fakePage({ enabled: false }), /^note_login_button_disabled$/]
  ]) {
    await assert.rejects(signIn(page, config), error => pattern.test(error.message) && !error.message.includes('secret'));
    assert.ok(page.state.clicks <= 1, 'never retried');
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
