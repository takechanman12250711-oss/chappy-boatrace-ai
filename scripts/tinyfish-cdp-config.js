'use strict';

function getTinyFishCdpConfig(env = process.env) {
  const apiKey = String(env.TINYFISH_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, reason: 'tinyfish_api_key_missing' };
  }

  const profileId = String(env.TINYFISH_PROFILE_ID || '').trim();
  return {
    ok: true,
    apiKey,
    profileId: profileId || null,
    browserApiUrl: 'https://api.browser.tinyfish.ai',
    noteUrl: 'https://note.com/',
    mode: 'draft_only',
    safeguards: {
      publishAllowed: false,
      priceChangeAllowed: false,
      reservationAllowed: false,
      credentialStorageAllowed: false
    }
  };
}

function safeConfigForLog(config) {
  if (!config || config.ok !== true) return config;
  return {
    ...config,
    apiKey: '[REDACTED]'
  };
}

module.exports = { getTinyFishCdpConfig, safeConfigForLog };
