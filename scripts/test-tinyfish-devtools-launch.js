'use strict';

const assert = require('assert');

function loadHandler() {
  delete require.cache[require.resolve('../api/tinyfish-devtools-launch')];
  return require('../api/tinyfish-devtools-launch');
}

function responseCapture() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value || ''; }
  };
}

(async () => {
  const original = { ...process.env };
  try {
    process.env.TINYFISH_API_KEY = 'api-test';
    process.env.TINYFISH_PROFILE_ID = 'profile-test';
    process.env.TINYFISH_LAUNCH_SECRET = 'launch-test';
    const handler = loadHandler();

    let res = responseCapture();
    await handler({ method: 'GET', headers: {} }, res);
    assert.strictEqual(res.statusCode, 405);

    res = responseCapture();
    await handler({ method: 'POST', headers: { 'x-launch-secret': 'wrong' } }, res);
    assert.strictEqual(res.statusCode, 401);

    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/setup-session')) return {
        ok: true,
        json: async () => ({
          session_id: 'session-test',
          base_url: 'https://browser.example/session-test',
          expires_at: '2026-09-10T15:00:00Z',
          timeout_seconds: 900
        })
      };
      if (url.endsWith('/pages')) return {
        ok: true,
        json: async () => [{
          url: 'https://x.com/i/flow/login',
          devtoolsFrontendUrl: 'https://devtools.example/inspector?ws=browser.example/devtools/page/1'
        }]
      };
      throw new Error('unexpected_url');
    };

    res = responseCapture();
    await handler({ method: 'POST', headers: { 'x-launch-secret': 'launch-test' } }, res);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.ttlSeconds, 900);
    assert.strictEqual(body.sessionId, 'session-test');
    assert.strictEqual(body.launchUrl.startsWith('https://devtools.example/'), true);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls.every((call) => call.options.headers['X-API-Key'] === 'api-test'), true);
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');

    console.log('tinyfish-devtools-launch tests passed');
  } finally {
    process.env = original;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
