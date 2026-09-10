'use strict';

const assert = require('assert');
const { setupAndSaveAuthenticatedNoteProfile } = require('./tinyfish-note-profile-orchestrator');

(async () => {
  let saves = 0;
  const base = {
    profileId: 'profile-1',
    apiKey: 'key',
    startSession: async () => ({ ok: true, sessionId: 'session-1', cdpUrl: 'wss://cdp' }),
    saveSession: async () => { saves += 1; return { ok: true, saved: true }; }
  };

  const success = await setupAndSaveAuthenticatedNoteProfile({
    ...base,
    inspectAuth: async () => ({ ok: true, authenticated: true, page: 'https://note.com/' })
  });
  assert.deepStrictEqual(success, {
    ok: true,
    reason: 'note_authenticated_profile_saved',
    sessionId: 'session-1',
    page: 'https://note.com/',
    profileSaved: true
  });
  assert.strictEqual(saves, 1);

  saves = 0;
  const unauth = await setupAndSaveAuthenticatedNoteProfile({
    ...base,
    inspectAuth: async () => ({ ok: true, authenticated: false, page: 'https://note.com/' })
  });
  assert.strictEqual(unauth.ok, false);
  assert.strictEqual(unauth.reason, 'note_not_authenticated');
  assert.strictEqual(unauth.profileSaved, false);
  assert.strictEqual(saves, 0);

  saves = 0;
  const inspectFailure = await setupAndSaveAuthenticatedNoteProfile({
    ...base,
    inspectAuth: async () => ({ ok: false, reason: 'cdp_authentication_check_failed' })
  });
  assert.strictEqual(inspectFailure.ok, false);
  assert.strictEqual(inspectFailure.profileSaved, false);
  assert.strictEqual(saves, 0);

  const setupFailure = await setupAndSaveAuthenticatedNoteProfile({
    ...base,
    startSession: async () => ({ ok: false, reason: 'setup_failed' })
  });
  assert.deepStrictEqual(setupFailure, { ok: false, reason: 'setup_failed' });

  assert.deepStrictEqual(await setupAndSaveAuthenticatedNoteProfile({ apiKey: 'x' }), { ok: false, reason: 'profile_id_missing' });
  assert.deepStrictEqual(await setupAndSaveAuthenticatedNoteProfile({ profileId: 'x' }), { ok: false, reason: 'tinyfish_api_key_missing' });

  console.log('tinyfish-note-profile-orchestrator tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
