'use strict';

const {
  buildNoteCloudBrowserConfig,
  buildBrowserbaseSessionOptions
} = require('./note-cloud-browser-contract');

const BROWSERBASE_API_ORIGIN = 'https://api.browserbase.com';

async function parseJsonResponse(response, reason) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${reason}_invalid_json`);
  }
  if (!response.ok) {
    const error = new Error(`${reason}_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function createBrowserbaseSession({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('browserbase_fetch_unavailable');
  const config = buildNoteCloudBrowserConfig(env);
  if (!config.ok) return config;
  const options = buildBrowserbaseSessionOptions(config);
  if (!options.ok) return options;

  const response = await fetchImpl(`${BROWSERBASE_API_ORIGIN}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': config.apiKey
    },
    body: JSON.stringify({
      projectId: options.projectId,
      browserSettings: options.browserSettings
    })
  });
  const session = await parseJsonResponse(response, 'browserbase_session_create_failed');
  if (!session?.id || !session?.connectUrl) throw new Error('browserbase_session_response_invalid');

  return {
    ok: true,
    provider: config.provider,
    sessionId: session.id,
    connectUrl: session.connectUrl,
    contextId: session.contextId || config.contextId,
    status: session.status || '',
    editorUrl: config.editorUrl,
    allowPublish: config.allowPublish,
    allowSchedule: config.allowSchedule,
    allowPriceChange: config.allowPriceChange
  };
}

async function getBrowserbaseDebugLinks({ sessionId, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!sessionId) return { ok: false, reason: 'browserbase_session_id_missing' };
  if (typeof fetchImpl !== 'function') throw new Error('browserbase_fetch_unavailable');
  const config = buildNoteCloudBrowserConfig(env);
  if (!config.ok) return config;

  const response = await fetchImpl(`${BROWSERBASE_API_ORIGIN}/v1/sessions/${encodeURIComponent(sessionId)}/debug`, {
    headers: { 'X-BB-API-Key': config.apiKey }
  });
  const debug = await parseJsonResponse(response, 'browserbase_session_debug_failed');
  if (!debug?.debuggerFullscreenUrl || !debug?.wsUrl) throw new Error('browserbase_debug_response_invalid');

  return {
    ok: true,
    sessionId,
    debuggerFullscreenUrl: debug.debuggerFullscreenUrl,
    debuggerUrl: debug.debuggerUrl || '',
    wsUrl: debug.wsUrl,
    pages: Array.isArray(debug.pages) ? debug.pages : []
  };
}

module.exports = {
  BROWSERBASE_API_ORIGIN,
  createBrowserbaseSession,
  getBrowserbaseDebugLinks
};
