'use strict';

const NOTE_EDITOR_URL = 'https://editor.note.com/new';
const BROWSERBASE_PROVIDER = 'browserbase';

function buildNoteCloudBrowserConfig(env = process.env) {
  const apiKey = String(env.BROWSERBASE_API_KEY || '').trim();
  const projectId = String(env.BROWSERBASE_PROJECT_ID || '').trim();
  const contextId = String(env.BROWSERBASE_CONTEXT_ID || '').trim();

  if (!apiKey) return { ok: false, reason: 'browserbase_api_key_missing' };
  if (!projectId) return { ok: false, reason: 'browserbase_project_id_missing' };
  if (!contextId) return { ok: false, reason: 'browserbase_context_id_missing' };

  return {
    ok: true,
    provider: BROWSERBASE_PROVIDER,
    apiKey,
    projectId,
    contextId,
    editorUrl: NOTE_EDITOR_URL,
    persistContext: true,
    allowPublish: false,
    allowSchedule: false,
    allowPriceChange: false,
    requiredChecks: [
      'authenticated_note_session',
      'draft_bundle_sha_match',
      'fresh_publication_audit',
      'duplicate_publication_guard'
    ]
  };
}

function buildBrowserbaseSessionOptions(config) {
  if (!config || config.ok !== true || config.provider !== BROWSERBASE_PROVIDER) {
    return { ok: false, reason: 'browserbase_config_invalid' };
  }
  return {
    ok: true,
    projectId: config.projectId,
    browserSettings: {
      context: {
        id: config.contextId,
        persist: true
      }
    }
  };
}

module.exports = {
  NOTE_EDITOR_URL,
  BROWSERBASE_PROVIDER,
  buildNoteCloudBrowserConfig,
  buildBrowserbaseSessionOptions
};
