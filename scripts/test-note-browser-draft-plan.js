'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBrowserDraftPlan } = require('./note-browser-draft-plan');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-browser-plan-'));
const bundlePath = path.join(dir, 'bundle.json');
fs.writeFileSync(bundlePath, JSON.stringify({
  version: 'note-draft-bundle-v1',
  article: { ok: true, title: 'race title', freeText: 'free body', paidText: 'paid body' }
}));

const plan = buildBrowserDraftPlan(bundlePath, []);
assert.strictEqual(plan.ok, true);
assert.strictEqual(plan.mode, 'draft_only');
assert.strictEqual(plan.target, 'note');
assert.deepStrictEqual(plan.steps.map((step) => step.action), [
  'require_authenticated_session',
  'check_duplicate_title',
  'open_new_draft',
  'fill_title',
  'fill_free_text',
  'fill_paid_text',
  'save_draft',
  'verify_draft_saved'
]);
assert.deepStrictEqual(plan.forbiddenActions, ['publish', 'set_price', 'schedule', 'store_credentials']);

const duplicate = buildBrowserDraftPlan(bundlePath, ['race title']);
assert.deepStrictEqual(duplicate, { ok: false, reason: 'duplicate_title' });

console.log('note-browser-draft-plan tests passed');
