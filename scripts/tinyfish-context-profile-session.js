'use strict';

const API_BASE = 'https://agent.tinyfish.ai/v1/profiles';

async function postJson(url, apiKey, body, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'fetch_unavailable' };
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
  if (!response.ok) return { ok: false, reason: 'tinyfish_profile_http_error', status: response.status };
  const data = await response.json();
  return { ok: true, data };
}

async function startProfileSetupSession({ profileId, apiKey, fetchImpl } = {}) {
  if (!profileId) return { ok: false, reason: 'profile_id_missing' };
  if (!apiKey) return { ok: false, reason: 'tinyfish_api_key_missing' };
  const result = await postJson(`${API_BASE}/${encodeURIComponent(profileId)}/setup-session`, apiKey, {}, fetchImpl);
  if (!result.ok) return result;
  const sessionId = result.data.session_id || result.data.id || null;
  const cdpUrl = result.data.cdp_url || null;
  if (!sessionId || !cdpUrl) return { ok: false, reason: 'setup_session_response_invalid' };
  return { ok: true, sessionId, cdpUrl };
}

async function saveProfileSetupSession({ profileId, sessionId, apiKey, fetchImpl } = {}) {
  if (!profileId) return { ok: false, reason: 'profile_id_missing' };
  if (!sessionId) return { ok: false, reason: 'session_id_missing' };
  if (!apiKey) return { ok: false, reason: 'tinyfish_api_key_missing' };
  const result = await postJson(
    `${API_BASE}/${encodeURIComponent(profileId)}/save`,
    apiKey,
    { session_id: sessionId },
    fetchImpl
  );
  if (!result.ok) return result;
  return { ok: true, saved: true, data: result.data };
}

module.exports = { API_BASE, startProfileSetupSession, saveProfileSetupSession };
