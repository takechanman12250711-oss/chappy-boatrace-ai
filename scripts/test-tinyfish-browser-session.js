'use strict';

const assert = require('assert');
const { createBrowserSession } = require('./tinyfish-browser-session');

const config = {
  ok: true,
  apiKey: 'test-key',
  browserApiUrl: 'https://api.browser.tinyfish.ai'
};

(async () => {
  let request;
  const success = await createBrowserSession({
    config,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ session_id: 's1', cdp_url: 'wss://example.test/cdp' }) };
    }
  });
  assert.deepStrictEqual(success, { ok: true, sessionId: 's1', cdpUrl: 'wss://example.test/cdp' });
  assert.strictEqual(request.url, config.browserApiUrl);
  assert.strictEqual(request.options.headers['X-API-Key'], 'test-key');
  assert.strictEqual(request.options.method, 'POST');

  const httpError = await createBrowserSession({
    config,
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  assert.deepStrictEqual(httpError, { ok: false, reason: 'browser_session_http_error', status: 401 });

  const invalid = await createBrowserSession({
    config,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ session_id: 's1' }) })
  });
  assert.deepStrictEqual(invalid, { ok: false, reason: 'browser_session_response_invalid' });

  const network = await createBrowserSession({
    config,
    fetchImpl: async () => { throw new Error('network'); }
  });
  assert.deepStrictEqual(network, { ok: false, reason: 'browser_session_error' });

  console.log('tinyfish-browser-session tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
