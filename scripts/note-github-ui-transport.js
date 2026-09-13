'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { loginNoteViaX } = require('./note-browserbase-x-login');
const { fillDraft, waitForVisibleAcrossFrames } = require('./note-browserbase-draft-save');

const DEFAULT_HANDOFF = path.join(process.cwd(), 'data', 'note-publish', 'iphone.json');
const EXPECTED_PRICE_YEN = 300;
const NOTE_EDITOR_URL = 'https://editor.note.com/new';

function loadHandoff(handoffPath = DEFAULT_HANDOFF) {
  const absolute = path.resolve(handoffPath);
  if (!fs.existsSync(absolute)) throw new Error('note_handoff_missing');
  const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  return { absolute, payload };
}

function firstPaidParagraph(paidText) {
  return String(paidText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function articleBody(payload) {
  return `${String(payload.freeText || '').trim()}\n\n${String(payload.paidText || '').trim()}`.trim();
}

function validateDraftGate(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'handoff_invalid' };
  if (payload.canPublish !== true) return { ok: false, reason: payload.blockReason || 'can_publish_false' };
  if (!String(payload.title || '').trim()) return { ok: false, reason: 'title_missing' };
  if (!String(payload.freeText || '').trim()) return { ok: false, reason: 'free_text_missing' };
  if (!String(payload.paidText || '').trim()) return { ok: false, reason: 'paid_text_missing' };
  if (Number(payload.price) !== EXPECTED_PRICE_YEN) return { ok: false, reason: 'price_not_300' };
  return { ok: true };
}

function isEditorUrl(value) {
  try {
    return new URL(String(value || '')).hostname === 'editor.note.com';
  } catch {
    return false;
  }
}

async function ensureEditorReady(page) {
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);
  if (!isEditorUrl(page.url())) {
    throw new Error(`note_editor_session_not_ready_${new URL(page.url()).hostname || 'unknown'}`);
  }
  return page.url();
}

async function clickVisibleText(page, texts) {
  for (const text of texts) {
    const roleButton = page.getByRole('button', { name: text, exact: false });
    for (let i = 0; i < await roleButton.count(); i += 1) {
      const item = roleButton.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return true;
      }
    }

    const textLocator = page.getByText(text, { exact: false });
    for (let i = 0; i < await textLocator.count(); i += 1) {
      const item = textLocator.nth(i);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return true;
      }
    }
  }
  return false;
}

async function setPaidPrice(page, price) {
  const input = await waitForVisibleAcrossFrames(page, [
    'input[placeholder*="価格"]',
    'input[aria-label*="価格"]',
    'input[name*="price"]',
    'input[inputmode="numeric"]',
    'input[type="number"]'
  ], 15000);
  if (!input) throw new Error('note_price_input_missing');
  await input.fill(String(price));
  const value = String(await input.inputValue().catch(() => '')).replace(/[^0-9]/g, '');
  if (value !== String(price)) throw new Error('note_price_verification_failed');
}

async function setPaidBoundary(page, paidText) {
  if (!(await clickVisibleText(page, ['有料エリア設定', '有料エリア']))) {
    throw new Error('note_paid_area_button_missing');
  }
  await page.waitForTimeout(1000);

  const start = firstPaidParagraph(paidText);
  if (!start) throw new Error('note_paid_start_missing');
  const snippet = start.slice(0, 40);
  const targets = page.getByText(snippet, { exact: false });
  for (let i = 0; i < await targets.count(); i += 1) {
    const target = targets.nth(i);
    if (!(await target.isVisible().catch(() => false))) continue;
    const container = target.locator('xpath=ancestor::*[.//button[contains(normalize-space(.), "ラインをこの場所に変更")]][1]');
    if (await container.count()) {
      const button = container.getByRole('button', { name: /ラインをこの場所に変更/ }).first();
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        return;
      }
    }
  }
  throw new Error('note_paid_boundary_target_missing');
}

async function configurePaidPublication(page, payload) {
  if (!(await clickVisibleText(page, ['公開に進む', '公開設定']))) {
    throw new Error('note_publish_settings_button_missing');
  }
  await page.waitForTimeout(1000);

  if (!(await clickVisibleText(page, ['有料']))) {
    throw new Error('note_paid_toggle_missing');
  }
  await setPaidPrice(page, EXPECTED_PRICE_YEN);
  await setPaidBoundary(page, payload.paidText);
  return { ok: true, price: EXPECTED_PRICE_YEN, paidStart: firstPaidParagraph(payload.paidText) };
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
    await ensureEditorReady(page);

    console.log('NOTE_UI_AUTH_OK=true');
    console.log(`NOTE_UI_AUTH_ALREADY=${Boolean(auth.alreadyAuthenticated)}`);
    console.log(`NOTE_UI_EDITOR_READY=${isEditorUrl(page.url())}`);

    if (mode === 'auth') {
      console.log('NOTE_UI_DRAFT_FILLED=false');
      console.log('NOTE_UI_PAID_CONFIGURED=false');
      console.log('NOTE_UI_PUBLISH_CLICKED=false');
      return;
    }

    const { absolute, payload } = loadHandoff(env.NOTE_IPHONE_HANDOFF || DEFAULT_HANDOFF);
    const gate = validateDraftGate(payload);
    if (!gate.ok) throw new Error(`note_publish_gate_blocked_${gate.reason}`);

    const result = await fillDraft(page, {
      title: String(payload.title).trim(),
      body: articleBody(payload)
    });
    const paid = await configurePaidPublication(page, payload);

    console.log('NOTE_UI_DRAFT_FILLED=true');
    console.log(`NOTE_UI_DRAFT_URL=${result.url}`);
    console.log(`NOTE_UI_HANDOFF=${absolute}`);
    console.log('NOTE_UI_PAID_CONFIGURED=true');
    console.log(`NOTE_UI_PRICE_YEN=${paid.price}`);
    console.log(`NOTE_UI_PAID_START=${paid.paidStart}`);
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

module.exports = {
  DEFAULT_HANDOFF,
  EXPECTED_PRICE_YEN,
  NOTE_EDITOR_URL,
  loadHandoff,
  firstPaidParagraph,
  articleBody,
  validateDraftGate,
  isEditorUrl,
  ensureEditorReady,
  configurePaidPublication,
  run
};
