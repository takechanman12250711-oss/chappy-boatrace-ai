'use strict';

function buildContextProfileLifecycle(config) {
  if (!config || config.ok !== true) return { ok: false, reason: 'tinyfish_config_invalid' };
  if (!config.apiKey) return { ok: false, reason: 'tinyfish_api_key_missing' };

  return {
    ok: true,
    mode: 'setup_login_state_only',
    profileId: config.profileId || null,
    requiredSequence: [
      'resolve_or_create_profile',
      'start_setup_session',
      'connect_controller_to_cdp_url',
      'establish_note_authenticated_state',
      'verify_note_authenticated_state',
      'save_setup_session',
      'verify_profile_reuse'
    ],
    forbiddenActions: [
      'publish',
      'set_price',
      'schedule',
      'store_note_credentials',
      'log_api_key'
    ],
    requirements: {
      exactApiPathsMustBeVerifiedFromOfficialDocs: true,
      cdpUrlMustComeFromSetupSession: true,
      profileMustBeSavedBeforeReuse: true,
      apiKeyMustRemainEnvironmentOnly: true
    }
  };
}

module.exports = { buildContextProfileLifecycle };
