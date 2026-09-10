'use strict';

const fs = require('fs');
const { buildDraftPayload } = require('./note-draft-adapter');
const { validateDraftPayload } = require('./note-browser-draft-contract');

function buildBrowserDraftPlan(bundlePath, existingTitles = []) {
  const sourceRaw = fs.readFileSync(bundlePath, 'utf8');
  const payload = buildDraftPayload(bundlePath);
  const validation = validateDraftPayload(payload, sourceRaw, existingTitles);
  if (!validation.ok) return validation;

  return {
    ok: true,
    mode: 'draft_only',
    target: 'note',
    sourcePath: bundlePath,
    sourceSha256: payload.sourceSha256,
    steps: [
      { action: 'require_authenticated_session' },
      { action: 'check_duplicate_title', title: validation.title },
      { action: 'open_new_draft' },
      { action: 'fill_title', value: validation.title },
      { action: 'fill_free_text', value: validation.freeText },
      { action: 'fill_paid_text', value: validation.paidText },
      { action: 'save_draft' },
      { action: 'verify_draft_saved' }
    ],
    forbiddenActions: validation.forbiddenActions
  };
}

if (require.main === module) {
  const bundlePath = process.argv[2];
  if (!bundlePath) {
    console.error('usage: node scripts/note-browser-draft-plan.js <draft-bundle.json>');
    process.exit(2);
  }
  const plan = buildBrowserDraftPlan(bundlePath);
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  process.exit(plan.ok ? 0 : 1);
}

module.exports = { buildBrowserDraftPlan };
