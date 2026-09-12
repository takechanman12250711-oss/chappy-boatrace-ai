'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { loginNoteViaX } = require('./note-browserbase-x-login');
const { fillDraft } = require('./note-browserbase-draft-save');

const DEFAULT_HANDOFF = path.join(process.cwd(), 'data', 'note-publish', 'iphone.json');

function loadHandoff(handoffPath = DEFAULT_HANDOFF) {
  const absolute = path.resolve(handoffPath);
  if (!fs.existsSync(absolute)) throw new Error('note_handoff_missing');
  const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  return { absolute, payload };
}

function validateDraftGate(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'handoff_invalid' };
  if (payload.canPublish !== true) return { ok: false, reason: payload.blockReason || 'can_publish_false' };
  if (!String(payload.title || '').trim()) return { ok: false, reason: 'title_missing' };
  if (!String(payload.body || '').trim()) return { ok: false, reason: 'body_missing' };
  return { ok: true };
}

async function run({ env = process.env } = {}) {
  const mode = String(env.NOTE_UI_MODE || 'auth').trim().toLowerCase();
  if (!['auth', 'draft'].includes(mode)) throw new Error('unsupported_note_ui_mode');

  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    const auth = await loginNoteViaX(page, { env });
    if (!auth?.ok) throw new Error(`note_auth_failed_${auth?.reason || 'unknown'}`);

    console.log('NOTE_UI_AUTH_OK=true');
    console.log(`NOTE_UI_AUTH_ALREADY=${Boolean(auth.alreadyAuthenticated)}`);

    if (mode === 'auth') {
      console.log('NOTE_UI_DRAFT_FILLED=false');
      console.log('NOTE_UI_PUBLISH_CLICKED=false');
      return;
    }

    const { absolute, payload } = loadHandoff(env.NOTE_IPHONE_HANDOFF || DEFAULT_HANDOFF);
    const gate = validateDraftGate(payload);
    if (!gate.ok) throw new Error(`note_publish_gate_blocked_${gate.reason}`);

    const result = await fillDraft(page, {
      title: String(payload.title).trim(),
      body: String(payload.body).trim()
    });

    console.log('NOTE_UI_DRAFT_FILLED=true');
    console.log(`NOTE_UI_DRAFT_URL=${result.url}`);
    console.log(`NOTE_UI_HANDOFF=${absolute}`);
    console.log('NOTE_UI_PUBLISH_CLICKED=false');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`NOTE_UI_TRANSPORT_FAILED=${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_HANDOFF, loadHandoff, validateDraftGate, run };
