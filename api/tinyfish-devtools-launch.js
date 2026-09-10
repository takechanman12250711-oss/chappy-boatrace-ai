'use strict';

const crypto = require('crypto');

const API_BASE = 'https://agent.tinyfish.ai/v1/profiles';
const MAX_TTL_SECONDS = 900;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function tinyfishJson(url, apiKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`tinyfish_http_${response.status}`);
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, reason: 'method_not_allowed' });

  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  const launchSecret = String(process.env.TINYFISH_LAUNCH_SECRET || '').trim();
  const suppliedSecret = String(req.headers['x-launch-secret'] || '').trim();
  if (!apiKey || !profileId || !launchSecret) return json(res, 503, { ok: false, reason: 'tinyfish_launch_not_configured' });
  if (!safeEqual(suppliedSecret, launchSecret)) return json(res, 401, { ok: false, reason: 'unauthorized' });

  try {
    const setup = await tinyfishJson(`${API_BASE}/${encodeURIComponent(profileId)}/setup-session`, apiKey, {
      method: 'POST',
      body: '{}'
    });
    const baseUrl = setup.base_url;
    if (!baseUrl) throw new Error('setup_base_url_missing');

    const pages = await tinyfishJson(`${String(baseUrl).replace(/\/$/, '')}/pages`, apiKey, { method: 'GET' });
    const list = Array.isArray(pages) ? pages : Array.isArray(pages.pages) ? pages.pages : [];
    const page = list.find((item) => item && item.url && item.url !== 'about:blank') || list[0];
    const devtoolsUrl = page && (page.devtoolsFrontendUrl || page.devtools_frontend_url);
    if (!devtoolsUrl) throw new Error('devtools_url_missing');

    const timeout = Math.max(1, Math.min(MAX_TTL_SECONDS, Number(setup.timeout_seconds) || MAX_TTL_SECONDS));
    return json(res, 200, {
      ok: true,
      launchUrl: devtoolsUrl,
      expiresAt: setup.expires_at || new Date(Date.now() + timeout * 1000).toISOString(),
      ttlSeconds: timeout,
      sessionId: setup.session_id || null
    });
  } catch (error) {
    return json(res, 502, { ok: false, reason: error.message || 'tinyfish_launch_failed' });
  }
};
