'use strict';

const assert = require('assert');
const { inspectNoteAuthentication } = require('./tinyfish-note-cdp-controller');

function fakeChromium(state, options = {}) {
  return {
    connectOverCDP: async () => {
      if (options.failConnect) throw new Error('connect failed');
      const page = {
        goto: async () => {},
        evaluate: async () => state
      };
      return {
        contexts: () => options.noContext ? [] : [{ pages: () => [page], newPage: async () => page }],
        close: async () => {}
      };
    }
  };
}

(async () => {
  assert.deepStrictEqual(await inspectNoteAuthentication({}), { ok: false, reason: 'cdp_url_missing' });
  assert.deepStrictEqual(await inspectNoteAuthentication({ cdpUrl: 'wss://x' }), { ok: false, reason: 'playwright_chromium_unavailable' });

  const authenticated = await inspectNoteAuthentication({
    cdpUrl: 'wss://x',
    chromium: fakeChromium({ loginVisible: false, hasAccountLink: true, url: 'https://note.com/' })
  });
  assert.deepStrictEqual(authenticated, { ok: true, authenticated: true, page: 'https://note.com/', reason: 'note_authenticated' });

  const unauthenticated = await inspectNoteAuthentication({
    cdpUrl: 'wss://x',
    chromium: fakeChromium({ loginVisible: true, hasAccountLink: false, url: 'https://note.com/' })
  });
  assert.deepStrictEqual(unauthenticated, { ok: true, authenticated: false, page: 'https://note.com/', reason: 'note_not_authenticated' });

  assert.deepStrictEqual(await inspectNoteAuthentication({
    cdpUrl: 'wss://x', chromium: fakeChromium({}, { noContext: true })
  }), { ok: false, reason: 'browser_context_missing' });

  assert.deepStrictEqual(await inspectNoteAuthentication({
    cdpUrl: 'wss://x', chromium: fakeChromium({}, { failConnect: true })
  }), { ok: false, reason: 'cdp_authentication_check_failed' });

  console.log('tinyfish-note-cdp-controller tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
