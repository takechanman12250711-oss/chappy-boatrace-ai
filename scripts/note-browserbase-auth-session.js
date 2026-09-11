'use strict';

const {
  getBrowserbaseDebugLinks
} = require('./note-browserbase-session');
const { loginNoteViaX } = require('./note-browserbase-x-login');

const AUTH_SESSION_TIMEOUT_SECONDS = 1800;
const AUTH_SESSION_HOLD_MS = 25 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

async function createAuthSession({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('browserbase_fetch_unavailable');

  const config = require('./note-cloud-browser-contract').buildNoteCloudBrowserConfig(env);
  if (!config.ok) return config;

  const response = await fetchImpl('https://api.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BB-API-Key': config.apiKey
    },
    body: JSON.stringify({
      projectId: config.projectId,
      timeout: AUTH_SESSION_TIMEOUT_SECONDS,
      browserSettings: {
        context: {
          id: config.contextId,
          persist: true
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`browserbase_auth_session_create_failed_${response.status}`);
    error.payload = payload;
    throw error;
  }
  if (!payload?.id || !payload?.connectUrl) throw new Error('browserbase_auth_session_response_invalid');

  return {
    ok: true,
    sessionId: payload.id,
    connectUrl: payload.connectUrl,
    contextId: payload.contextId || config.contextId,
    editorUrl: config.editorUrl
  };
}

async function holdSession(page, holdMs = AUTH_SESSION_HOLD_MS) {
  const started = Date.now();
  while (Date.now() - started < holdMs) {
    await page.evaluate(() => document.readyState).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_MS));
  }
}

async function runAuthCli({ env = process.env } = {}) {
  const { chromium } = require('playwright-core');
  const session = await createAuthSession({ env });
  if (!session?.ok) {
    console.error(`BROWSERBASE_AUTH_SESSION_ERROR=${session?.reason || 'unknown'}`);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  const debug = await getBrowserbaseDebugLinks({ sessionId: session.sessionId, env });
  console.log(`BROWSERBASE_SESSION_ID=${session.sessionId}`);
  console.log(`LIVE_VIEW_URL=${debug.debuggerFullscreenUrl}`);
  console.log(`NOTE_EDITOR_URL=${session.editorUrl}`);
  console.log(`AUTH_SESSION_TIMEOUT_SECONDS=${AUTH_SESSION_TIMEOUT_SECONDS}`);
  console.log('NOTE_PUBLICATION_ENABLED=false');

  const loginResult = await loginNoteViaX(page, { env });
  if (loginResult.ok) {
    console.log('NOTE_AUTHENTICATED=true');
    console.log(`NOTE_AUTH_FINAL_URL=${loginResult.finalUrl}`);
    await page.waitForTimeout(3000);
    await browser.close();
    return;
  }

  if (loginResult.reason === 'x_credentials_missing') {
    console.log('NOTE_AUTHENTICATED=false');
    console.log('X_CREDENTIALS_CONFIGURED=false');
    console.log('AUTH_ACTION_REQUIRED=configure_X_LOGIN_ID_and_X_PASSWORD_repository_secrets');
    await browser.close();
    return;
  }

  console.log('NOTE_AUTHENTICATED=false');
  console.log(`NOTE_AUTH_REASON=${loginResult.reason}`);
  console.log(`NOTE_AUTH_FINAL_URL=${loginResult.finalUrl || page.url()}`);
  console.log('AUTH_SESSION_HELD_FOR_DIAGNOSTICS=true');
  await holdSession(page);
  await browser.close();
  process.exitCode = 1;
}

if (require.main === module) {
  runAuthCli().catch((error) => {
    console.error(`BROWSERBASE_AUTH_RUNNER_FAILED=${error.message}`);
    if (error?.payload) console.error(`BROWSERBASE_AUTH_RUNNER_PAYLOAD=${JSON.stringify(error.payload)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  AUTH_SESSION_TIMEOUT_SECONDS,
  AUTH_SESSION_HOLD_MS,
  HEARTBEAT_MS,
  createAuthSession,
  holdSession,
  runAuthCli
};
