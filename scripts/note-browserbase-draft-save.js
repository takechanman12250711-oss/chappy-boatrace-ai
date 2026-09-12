'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createAuthSession } = require('./note-browserbase-auth-session');
const { loginNoteViaX } = require('./note-browserbase-x-login');
const { selectReadyDraft } = require('./select-note-ready-draft');

const NOTE_EDITOR_URL = 'https://editor.note.com/new';
const AUTOSAVE_WAIT_MS = 10000;
const EDITOR_WAIT_MS = 15000;

function resolveDraftBundlePath({ argv = process.argv, env = process.env } = {}) {
  const explicit = argv[2] || env.NOTE_DRAFT_BUNDLE_PATH;
  if (explicit) return explicit;
  if (env.NOTE_DRAFT_AUTO_SELECT !== 'true') throw new Error('note_draft_bundle_path_required');

  const selected = selectReadyDraft(
    env.NOTE_DRAFT_ROOT || 'data/note-drafts',
    env.NOTE_READY_STRATEGY || 'latest'
  );
  console.log(`NOTE_READY_SELECTED=${selected.relativePath}`);
  console.log(`NOTE_READY_COUNT=${selected.readyCount}`);
  console.log(`NOTE_BLOCKED_COUNT=${selected.blockedCount}`);
  return selected.absolutePath;
}

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

async function firstVisible(scope, selectors) {
  for (const selector of selectors) {
    const locator = scope.locator(selector);
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }
  return null;
}

async function waitForVisibleAcrossFrames(page, selectors, timeoutMs = EDITOR_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const direct = await firstVisible(page, selectors);
    if (direct) return direct;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const insideFrame = await firstVisible(frame, selectors).catch(() => null);
      if (insideFrame) return insideFrame;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function collectEditorDiagnostics(page) {
  const scopes = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
  const rows = [];
  for (const scope of scopes) {
    const frameUrl = typeof scope.url === 'function' ? scope.url() : page.url();
    const locator = scope.locator('textarea,input,[contenteditable="true"],[role="textbox"]');
    const count = Math.min(await locator.count().catch(() => 0), 20);
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (!(await item.isVisible().catch(() => false))) continue;
      const meta = await item.evaluate((el) => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        role: el.getAttribute('role'),
        placeholder: el.getAttribute('placeholder'),
        contenteditable: el.getAttribute('contenteditable'),
        className: typeof el.className === 'string' ? el.className : '',
        ariaLabel: el.getAttribute('aria-label'),
        dataPlaceholder: el.getAttribute('data-placeholder')
      })).catch(() => null);
      if (meta) rows.push({ frameUrl, ...meta });
    }
  }
  return rows.slice(0, 30);
}

async function ensureAuthenticated(page, env = process.env) {
  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (new URL(page.url()).hostname === 'editor.note.com') return { ok: true, alreadyAuthenticated: true };
  return loginNoteViaX(page, { env });
}

async function fillDraft(page, { title, body }) {
  const titleSelectors = [
    'textarea[placeholder*="タイトル"]',
    'input[placeholder*="タイトル"]',
    '[aria-label*="タイトル"]',
    'textarea',
    'input[type="text"]'
  ];
  const bodySelectors = [
    'textarea[placeholder*="本文"]',
    '[aria-label*="本文"]',
    '[data-placeholder*="本文"][contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"]',
    '[role="textbox"]'
  ];

  const titleInput = await waitForVisibleAcrossFrames(page, titleSelectors);
  if (!titleInput) {
    console.log(`NOTE_EDITOR_DIAGNOSTICS=${JSON.stringify(await collectEditorDiagnostics(page))}`);
    throw new Error('note_title_input_missing');
  }

  const bodyInput = await waitForVisibleAcrossFrames(page, bodySelectors);
  if (!bodyInput) {
    console.log(`NOTE_EDITOR_DIAGNOSTICS=${JSON.stringify(await collectEditorDiagnostics(page))}`);
    throw new Error('note_body_input_missing');
  }

  await titleInput.fill(title);
  await bodyInput.fill(body);
  await page.waitForTimeout(AUTOSAVE_WAIT_MS);

  const currentTitle = String(await titleInput.inputValue().catch(() => '')).trim();
  const currentBody = String(await bodyInput.innerText().catch(async () => await bodyInput.inputValue().catch(() => ''))).trim();
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
  const bundlePath = resolveDraftBundlePath({ env });
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
    console.log('NOTE_DRAFT_SAVED=true');
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
  EDITOR_WAIT_MS,
  resolveDraftBundlePath,
  loadDraftBundle,
  firstVisible,
  waitForVisibleAcrossFrames,
  collectEditorDiagnostics,
  fillDraft,
  runDraftSaveCli
};
