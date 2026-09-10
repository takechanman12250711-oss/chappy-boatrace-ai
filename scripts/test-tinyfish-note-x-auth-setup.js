'use strict';

const assert = require('assert');
const { saveAfterNoteAuthentication } = require('./tinyfish-note-x-auth-setup');

function fakeChromium({ bodyText = '', noContext = false } = {}) {
  const page = {
    goto: async () => {},
    locator: () => ({ innerText: async () => bodyText })
  };
  return {
    connectOverCDP: async () => ({
      contexts: () => noContext ? [] : [{ pages: () => [page], newPage: async () => page }],
      close: async () => {}
    })
  };
}

(async () => {
  let saveCalls = 0;
  const fetchImpl = async (url, options) => {
    if (!url.endsWith('/save')) throw new Error('unexpected request');
    saveCalls += 1;
    assert.deepStrictEqual(JSON.parse(options.body), { session_id: 'session-1' });
    return { ok: true, status: 200, json: async () => ({ saved: true }) };
  };

  const unauthenticated = await saveAfterNoteAuthentication({
    profileId: 'profile-1', apiKey: 'key', sessionId: 'session-1', cdpUrl: 'wss://cdp',
    chromium: fakeChromium({ bodyText: 'ホーム\nログイン\n新規登録' }), fetchImpl
  });
  assert.deepStrictEqual(unauthenticated, { ok: false, reason: 'note_not_authenticated', profileSaved: false });
  assert.strictEqual(saveCalls, 0, 'must never save an unauthenticated profile');

  const authenticated = await saveAfterNoteAuthentication({
    profileId: 'profile-1', apiKey: 'key', sessionId: 'session-1', cdpUrl: 'wss://cdp',
    chromium: fakeChromium({ bodyText: 'ホーム\n記事を書く\nプロフィール' }), fetchImpl
  });
  assert.deepStrictEqual(authenticated, { ok: true, reason: 'note_x_authenticated_profile_saved', profileSaved: true });
  assert.strictEqual(saveCalls, 1, 'must save exactly once after authentication');

  const missingSession = await saveAfterNoteAuthentication({ profileId: 'profile-1', apiKey: 'key' });
  assert.deepStrictEqual(missingSession, { ok: false, reason: 'setup_session_missing' });

  const missingContext = await saveAfterNoteAuthentication({
    profileId: 'profile-1', apiKey: 'key', sessionId: 'session-1', cdpUrl: 'wss://cdp',
    chromium: fakeChromium({ noContext: true }), fetchImpl
  });
  assert.deepStrictEqual(missingContext, { ok: false, reason: 'browser_context_missing' });

  console.log('tinyfish-note-x-auth-setup tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
