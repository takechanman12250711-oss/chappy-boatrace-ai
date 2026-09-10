'use strict';

const { setupAndSaveAuthenticatedNoteProfile } = require('./tinyfish-note-profile-orchestrator');

async function main() {
  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  if (!apiKey) throw new Error('TINYFISH_API_KEY is not configured');
  if (!profileId) throw new Error('TINYFISH_PROFILE_ID is not configured');

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (_) {
    throw new Error('playwright-core is not installed');
  }

  const result = await setupAndSaveAuthenticatedNoteProfile({ profileId, apiKey, chromium });
  const safe = {
    ok: result.ok,
    reason: result.reason,
    profileSaved: Boolean(result.profileSaved),
    page: result.page || null
  };
  console.log(JSON.stringify(safe));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || 'tinyfish live profile check failed');
  process.exit(1);
});
