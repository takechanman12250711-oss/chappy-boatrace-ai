'use strict';

const assert = require('assert');
const { buildContextProfileLifecycle } = require('./tinyfish-context-profile-contract');

assert.deepStrictEqual(buildContextProfileLifecycle(null), { ok: false, reason: 'tinyfish_config_invalid' });
assert.deepStrictEqual(buildContextProfileLifecycle({ ok: true }), { ok: false, reason: 'tinyfish_api_key_missing' });

const lifecycle = buildContextProfileLifecycle({ ok: true, apiKey: 'secret', profileId: 'profile-1' });
assert.strictEqual(lifecycle.ok, true);
assert.strictEqual(lifecycle.mode, 'setup_login_state_only');
assert.strictEqual(lifecycle.profileId, 'profile-1');
assert.deepStrictEqual(lifecycle.requiredSequence, [
  'resolve_or_create_profile',
  'start_setup_session',
  'connect_controller_to_cdp_url',
  'establish_note_authenticated_state',
  'verify_note_authenticated_state',
  'save_setup_session',
  'verify_profile_reuse'
]);
assert(lifecycle.forbiddenActions.includes('publish'));
assert(lifecycle.forbiddenActions.includes('set_price'));
assert(lifecycle.forbiddenActions.includes('schedule'));
assert(lifecycle.forbiddenActions.includes('store_note_credentials'));
assert(lifecycle.forbiddenActions.includes('log_api_key'));
assert.strictEqual(lifecycle.requirements.exactApiPathsMustBeVerifiedFromOfficialDocs, true);
assert.strictEqual(lifecycle.requirements.cdpUrlMustComeFromSetupSession, true);
assert.strictEqual(lifecycle.requirements.profileMustBeSavedBeforeReuse, true);
assert.strictEqual(lifecycle.requirements.apiKeyMustRemainEnvironmentOnly, true);

console.log('tinyfish-context-profile-contract tests passed');
