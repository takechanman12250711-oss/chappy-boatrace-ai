'use strict';

const { getTinyFishCdpConfig } = require('./tinyfish-cdp-config');

async function createBrowserSession(options = {}) {
  const config = options.config || getTinyFishCdpConfig(options.env || process.env);
  if (!config.ok) return config;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'fetch_unavailable' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 60000);
  try {
    const response = await fetchImpl(config.browserApiUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ browser_profile: 'lite' }),
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, reason: 'browser_session_http_error', status: response.status };
    const data = await response.json();
    const cdpUrl = data.cdp_url || data.websocket_url || data.ws_url || null;
    const sessionId = data.session_id || data.id || null;
    if (!cdpUrl || !sessionId) return { ok: false, reason: 'browser_session_response_invalid' };
    return { ok: true, sessionId, cdpUrl };
  } catch (error) {
    return { ok: false, reason: error && error.name === 'AbortError' ? 'browser_session_timeout' : 'browser_session_error' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { createBrowserSession };
