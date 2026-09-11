'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createAuthSession } = require('./note-browserbase-auth-session');
const { loginNoteViaX } = require('./note-browserbase-x-login');

const NOTE_EDITOR_URL = 'https://editor.note.com/new';
const AUTOSAVE_WAIT_MS = 10000;

function loadDraftBundle(bundlePath) {
  if (!bundlePath) throw new Error('note_draft_bundle_path_required');
  const absolute = path.resolve(bundlePath);
  const bundle = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const article = bundle?.article;
  const title = String(article?.title || '').trim();
  const body = String(article?.fullText || '').trim();
  if (!title) throw new Error('note_draft_title_missing');
  if (!body) throw new Error('note_draft_body_missing');
  return { absolute, bundle, title, body };
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function ensureAuthenticated(page, env = process.env) {
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (new URL(page.url()).hostname === 'editor.note.com') return { ok: true, alreadyAuthenticated: true };
  return loginNoteViaX(page, { env });
}

async function fillDraft(page, { title, body }) {
  const titleInput = await firstVisible(page, [
    'textarea[placeholder*="タイトル"]',
    'input[placeholder*="タイトル"]',
    'textarea',
    'input[type="text"]'
  ]);
  if (!titleInput) throw new Error('note_title_input_missing');

  const bodyInput = await firstVisible(page, [
    '[contenteditable="true"][role="textbox"]',
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"]'
  ]);
  if (!bodyInput) throw new Error('note_body_input_missing');

  await titleInput.fill(title);
  await bodyInput.fill(body);
  await page.waitForTimeout(AUTOSAVE_WAIT_MS);

  const currentTitle = String(await titleInput.inputValue().catch(() => '')).trim();
  const currentBody = String(await bodyInput.innerText().catch(() => '')).trim();
  if (currentTitle !== title) throw new Error('note_title_verification_failed');
  if (!currentBody || !currentBody.includes(body.slice(0, Math.min(80, body.length)))) {
    throw new Error('note_body_verification_failed');
  }

  return {
    ok: true,
    url: page.url(),
    titleLength: title.length,
    bodyLength: body.length
  };
}

async function runDraftSaveCli({ env = process.env } = {}) {
  const bundlePath = process.argv[2] || env.NOTE_DRAFT_BUNDLE_PATH;
  const draft = loadDraftBundle(bundlePath);
  const session = await createAuthSession({ env });
  if (!session?.ok) throw new Error(`browserbase_session_unavailable_${session?.reason || 'unknown'}`);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();
    const auth = await ensureAuthenticated(page, env);
    if (!auth?.ok) throw new Error(`note_auth_failed_${auth?.reason || 'unknown'}`);

    const result = await fillDraft(page, draft);
    console.log(`NOTE_DRAFT_SAVED=true`);
    console.log(`NOTE_DRAFT_URL=${result.url}`);
    console.log(`NOTE_DRAFT_TITLE_LENGTH=${result.titleLength}`);
    console.log(`NOTE_DRAFT_BODY_LENGTH=${result.bodyLength}`);
    console.log(`NOTE_DRAFT_BUNDLE=${draft.absolute}`);
    console.log('NOTE_PUBLICATION_ENABLED=false');
    console.log('NOTE_PUBLISH_CLICKED=false');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runDraftSaveCli().catch((error) => {
    console.error(`NOTE_DRAFT_SAVE_FAILED=${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  NOTE_EDITOR_URL,
  AUTOSAVE_WAIT_MS,
  loadDraftBundle,
  fillDraft,
  runDraftSaveCli
};
