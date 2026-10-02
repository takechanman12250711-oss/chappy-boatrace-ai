'use strict';

const assert = require('assert');
const {
  BROWSERBASE_API_ORIGIN,
  createBrowserbaseSession,
  getBrowserbaseDebugLinks
} = require('./note-browserbase-session');

const env = {
  BROWSERBASE_API_KEY: 'secret-key',
  BROWSERBASE_PROJECT_ID: 'project-1',
  BROWSERBASE_CONTEXT_ID: 'context-1'
};

(async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/debug')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          debuggerFullscreenUrl: 'https://debug.example/full',
          debuggerUrl: 'https://debug.example/',
          wsUrl: 'wss://debug.example/ws',
          pages: [{ id: 'page-1', url: 'https://editor.note.com/new' }]
        })
      };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 'session-1',
        connectUrl: 'wss://connect.example/session-1',
        contextId: 'context-1',
        status: 'RUNNING'
      })
    };
  };

  const session = await createBrowserbaseSession({ env, fetchImpl });
  assert.strictEqual(session.ok, true);
  assert.strictEqual(session.sessionId, 'session-1');
  assert.strictEqual(session.contextId, 'context-1');
  assert.strictEqual(session.allowPublish, false);
  assert.strictEqual(session.allowSchedule, false);
  assert.strictEqual(session.allowPriceChange, false);

  assert.strictEqual(calls[0].url, `${BROWSERBASE_API_ORIGIN}/v1/sessions`);
  assert.strictEqual(calls[0].options.method, 'POST');
  assert.strictEqual(calls[0].options.headers['X-BB-API-Key'], 'secret-key');
  assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
    projectId: 'project-1',
    browserSettings: { context: { id: 'context-1', persist: true } }
  });

  const debug = await getBrowserbaseDebugLinks({ sessionId: 'session-1', env, fetchImpl });
  assert.strictEqual(debug.ok, true);
  assert.strictEqual(debug.debuggerFullscreenUrl, 'https://debug.example/full');
  assert.strictEqual(debug.pages.length, 1);
  assert.strictEqual(calls[1].url, `${BROWSERBASE_API_ORIGIN}/v1/sessions/session-1/debug`);

  const missing = await createBrowserbaseSession({ env: {}, fetchImpl });
  assert.deepStrictEqual(missing, { ok: false, reason: 'browserbase_api_key_missing' });

  await assert.rejects(
    () => createBrowserbaseSession({
      env,
      fetchImpl: async () => ({ ok: true, status: 201, json: async () => ({ id: 'session-1' }) })
    }),
    /browserbase_session_response_invalid/
  );

  await assert.rejects(
    () => getBrowserbaseDebugLinks({
      sessionId: 'session-1',
      env,
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) })
    }),
    /browserbase_session_debug_failed_401/
  );

  console.log('note-browserbase-session tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
