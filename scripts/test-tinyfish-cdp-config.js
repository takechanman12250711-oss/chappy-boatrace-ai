'use strict';

const assert = require('assert');
const { getTinyFishCdpConfig, safeConfigForLog } = require('./tinyfish-cdp-config');

assert.deepStrictEqual(getTinyFishCdpConfig({}), { ok: false, reason: 'tinyfish_api_key_missing' });

const config = getTinyFishCdpConfig({ TINYFISH_API_KEY: 'secret-key', TINYFISH_PROFILE_ID: 'profile-1' });
assert.strictEqual(config.ok, true);
assert.strictEqual(config.apiKey, 'secret-key');
assert.strictEqual(config.profileId, 'profile-1');
assert.strictEqual(config.mode, 'draft_only');
assert.strictEqual(config.safeguards.publishAllowed, false);
assert.strictEqual(config.safeguards.priceChangeAllowed, false);
assert.strictEqual(config.safeguards.reservationAllowed, false);
assert.strictEqual(config.safeguards.credentialStorageAllowed, false);

const safe = safeConfigForLog(config);
assert.strictEqual(safe.apiKey, '[REDACTED]');
assert.strictEqual(JSON.stringify(safe).includes('secret-key'), false);

console.log('tinyfish-cdp-config tests passed');
