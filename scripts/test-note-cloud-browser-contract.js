'use strict';

const assert = require('assert');
const {
  NOTE_EDITOR_URL,
  buildNoteCloudBrowserConfig,
  buildBrowserbaseSessionOptions
} = require('./note-cloud-browser-contract');

assert.deepStrictEqual(buildNoteCloudBrowserConfig({}), {
  ok: false,
  reason: 'browserbase_api_key_missing'
});

assert.deepStrictEqual(buildNoteCloudBrowserConfig({ BROWSERBASE_API_KEY: 'key' }), {
  ok: false,
  reason: 'browserbase_project_id_missing'
});

assert.deepStrictEqual(buildNoteCloudBrowserConfig({
  BROWSERBASE_API_KEY: 'key',
  BROWSERBASE_PROJECT_ID: 'project'
}), {
  ok: false,
  reason: 'browserbase_context_id_missing'
});

const config = buildNoteCloudBrowserConfig({
  BROWSERBASE_API_KEY: 'key',
  BROWSERBASE_PROJECT_ID: 'project',
  BROWSERBASE_CONTEXT_ID: 'context'
});
assert.strictEqual(config.ok, true);
assert.strictEqual(config.editorUrl, NOTE_EDITOR_URL);
assert.strictEqual(config.persistContext, true);
assert.strictEqual(config.allowPublish, false);
assert.strictEqual(config.allowSchedule, false);
assert.strictEqual(config.allowPriceChange, false);
assert(config.requiredChecks.includes('fresh_publication_audit'));
assert(config.requiredChecks.includes('duplicate_publication_guard'));

assert.deepStrictEqual(buildBrowserbaseSessionOptions(config), {
  ok: true,
  projectId: 'project',
  browserSettings: {
    context: {
      id: 'context',
      persist: true
    }
  }
});

assert.deepStrictEqual(buildBrowserbaseSessionOptions(null), {
  ok: false,
  reason: 'browserbase_config_invalid'
});

console.log('note-cloud-browser-contract tests passed');
