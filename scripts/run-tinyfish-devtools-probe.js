'use strict';

const { startProfileSetupSession } = require('./tinyfish-context-profile-session');

function inspectUrl(raw) {
  if (!raw || typeof raw !== 'string') return { present: false };
  try {
    const url = new URL(raw);
    const sensitiveNames = /(?:key|token|secret|auth|password|credential)/i;
    return {
      present: true,
      protocol: url.protocol.replace(':', ''),
      hasUserInfo: Boolean(url.username || url.password),
      hasQuery: Boolean(url.search),
      hasSensitiveQueryName: [...url.searchParams.keys()].some((name) => sensitiveNames.test(name)),
      hostClass: /tinyfish\.ai$/i.test(url.hostname) || /\.tinyfish\.ai$/i.test(url.hostname) ? 'tinyfish' : 'other'
    };
  } catch (_) {
    return { present: true, validUrl: false };
  }
}

async function main() {
  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  if (!apiKey) throw new Error('TINYFISH_API_KEY is not configured');
  if (!profileId) throw new Error('TINYFISH_PROFILE_ID is not configured');

  const setup = await startProfileSetupSession({ profileId, apiKey });
  if (!setup.ok) throw new Error(setup.reason || 'setup_failed');
  if (!setup.baseUrl) throw new Error('setup_base_url_missing');

  const response = await fetch(`${setup.baseUrl.replace(/\/$/, '')}/pages`, {
    headers: { 'X-API-Key': apiKey }
  });
  if (!response.ok) throw new Error(`pages_request_failed_${response.status}`);
  const payload = await response.json();
  const pages = Array.isArray(payload) ? payload : Array.isArray(payload.pages) ? payload.pages : [];
  const page = pages.find((item) => item && item.url && item.url !== 'about:blank') || pages[0] || {};
  const devtools = page.devtoolsFrontendUrl || page.devtools_frontend_url || null;
  const websocket = page.webSocketDebuggerUrl || page.web_socket_debugger_url || null;

  console.log(JSON.stringify({
    ok: true,
    pageCount: pages.length,
    devtools: inspectUrl(devtools),
    websocket: inspectUrl(websocket),
    sessionTimeoutSeconds: setup.timeoutSeconds,
    hasExpiry: Boolean(setup.expiresAt)
  }));
}

main().catch((error) => {
  console.error(error.message || 'tinyfish pages probe failed');
  process.exit(1);
});
