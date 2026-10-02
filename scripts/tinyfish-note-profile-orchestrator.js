'use strict';

const { startProfileSetupSession, saveProfileSetupSession } = require('./tinyfish-context-profile-session');
const { inspectNoteAuthentication } = require('./tinyfish-note-cdp-controller');

async function setupAndSaveAuthenticatedNoteProfile({
  profileId,
  apiKey,
  chromium,
  fetchImpl,
  startSession = startProfileSetupSession,
  inspectAuth = inspectNoteAuthentication,
  saveSession = saveProfileSetupSession
} = {}) {
  if (!profileId) return { ok: false, reason: 'profile_id_missing' };
  if (!apiKey) return { ok: false, reason: 'tinyfish_api_key_missing' };

  const setup = await startSession({ profileId, apiKey, fetchImpl });
  if (!setup.ok) return setup;

  const auth = await inspectAuth({ cdpUrl: setup.cdpUrl, chromium });
  if (!auth.ok) return { ...auth, sessionId: setup.sessionId, profileSaved: false };
  if (!auth.authenticated) {
    return {
      ok: false,
      reason: 'note_not_authenticated',
      sessionId: setup.sessionId,
      page: auth.page,
      profileSaved: false
    };
  }

  const saved = await saveSession({ profileId, sessionId: setup.sessionId, apiKey, fetchImpl });
  if (!saved.ok) return { ...saved, sessionId: setup.sessionId, profileSaved: false };

  return {
    ok: true,
    reason: 'note_authenticated_profile_saved',
    sessionId: setup.sessionId,
    page: auth.page,
    profileSaved: true
  };
}

module.exports = { setupAndSaveAuthenticatedNoteProfile };
