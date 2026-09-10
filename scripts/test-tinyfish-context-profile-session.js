'use strict';

const assert = require('assert');
const { startSetupSession, saveSetupSession } = require('./tinyfish-context-profile-session');

const config = { ok: true, apiKey: 'test-key', profileId: 'profile-1' };

(async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/setup-session')) {
      return { ok: true, status: 200, json: async () => ({ session_id: 'session-1', cdp_url: 'wss://cdp.test/session-1' }) };
    }
    if (url.endsWith('/save')) {
      return { ok: true, status: 200, json: async () => ({ saved: true }) };
    }
    throw new Error('unexpected url');
  };

  const setup = await startSetupSession({ config, fetchImpl });
  assert.deepStrictEqual(setup, { ok: true, sessionId: 'session-1', cdpUrl: 'wss://cdp.test/session-1' });
  assert.strictEqual(requests[0].url, 'https://agent.tinyfish.ai/v1/profiles/profile-1/setup-session');
  assert.strictEqual(requests[0].options.method, 'POST');
  assert.strictEqual(requests[0].options.headers['X-API-Key'], 'test-key');

  const saved = await saveSetupSession('session-1', { config, fetchImpl });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(requests[1].url, 'https://agent.tinyfish.ai/v1/profiles/profile-1/save');
  assert.deepStrictEqual(JSON.parse(requests[1].options.body), { session_id: 'session-1' });
  assert.strictEqual(requests[1].options.headers['X-API-Key'], 'test-key');

  assert.deepStrictEqual(await startSetupSession({ config: { ok: true, apiKey: 'x' }, fetchImpl }), { ok: false, reason: 'tinyfish_profile_id_missing' });
  assert.deepStrictEqual(await saveSetupSession('', { config, fetchImpl }), { ok: false, reason: 'tinyfish_setup_session_id_missing' });

  console.log('tinyfish-context-profile-session tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
