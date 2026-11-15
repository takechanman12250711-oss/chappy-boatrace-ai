'use strict';
// Login check only (auth mode): can the browser inside GitHub Actions sign in
// to note with the account's own email and password, with no outside browser
// service? It opens the login page, signs in once and checks that the editor
// is usable. It never writes an article, reserves a race or publishes.
// Credentials are read from the environment and never logged; page text is
// never logged either, only short fixed codes.
const NOTE_LOGIN_URL = 'https://note.com/login';

function loadLoginConfig(env = process.env) {
  const id = String(env.NOTE_LOGIN_ID || '').trim();
  const password = String(env.NOTE_LOGIN_PASSWORD || '');
  if (!id) throw new Error('note_login_id_missing');
  if (!password) throw new Error('note_login_password_missing');
  return { id, password };
}

// Browser libraries put the typed value into their error text (for example
// Playwright's call log shows fill("...")). Nothing from such an error may
// reach a log, so only codes written in this file or the editor check pass
// through; every other failure becomes a fixed code with no message, cause or
// stack from the original.
const SAFE_CODES = new Set(['note_login_id_missing', 'note_login_password_missing', 'note_login_form_not_found',
  'note_login_button_disabled', 'note_login_bot_check', 'note_login_not_accepted', 'note_editor_fields_not_ready']);
const SAFE_HOST_CODES = /^(?:note_login_left_note|note_editor_session_not_ready)_[a-z0-9.-]{1,60}$/;
function safeError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return new Error(SAFE_CODES.has(message) || SAFE_HOST_CODES.test(message) ? message : fallback);
}
async function step(fallback, action) {
  try { return await action(); } catch (error) { throw safeError(error, fallback); }
}

const hostOf = value => {
  try { return new URL(value).hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 60) || 'unknown'; } catch { return 'unknown'; }
};

async function signIn(page, config) {
  await step('note_login_page_open_failed', () => page.goto(NOTE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }));
  const { id, password, submit } = await step('note_login_form_check_failed', async () => {
    const id = page.getByLabel('メールアドレス または note ID', { exact: true });
    const password = page.getByLabel('パスワード', { exact: true });
    const submit = page.getByRole('button', { name: 'ログイン', exact: true });
    await id.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    if (await id.count() !== 1 || await password.count() !== 1 || await submit.count() !== 1) {
      throw new Error('note_login_form_not_found');
    }
    return { id, password, submit };
  });
  await step('note_login_input_failed', async () => {
    await id.fill(config.id);
    await password.fill(config.password);
    if (!(await submit.isEnabled())) throw new Error('note_login_button_disabled');
  });
  // One attempt only. A wrong password or a bot check must never be retried
  // automatically: repeated failures could lock the account.
  await step('note_login_submit_failed', () => submit.click());
  return step('note_login_result_check_failed', async () => {
    await page.waitForURL(url => !/\/login\/?$/.test(new URL(String(url)).pathname), { timeout: 30000 }).catch(() => {});
    const url = page.url();
    if (hostOf(url) !== 'note.com') throw new Error(`note_login_left_note_${hostOf(url).toLowerCase()}`);
    if (/\/login\/?$/.test(new URL(url).pathname)) {
      // Tell a bot check apart from a rejected password: the next step differs.
      const botCheck = await page.locator(
        'textarea[name="g-recaptcha-response"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]'
      ).count().catch(() => 0);
      throw new Error(botCheck > 0 ? 'note_login_bot_check' : 'note_login_not_accepted');
    }
    return true;
  });
}

async function runDirectAuth({ env = process.env, ensureEditorReady, launch, log = console.log } = {}) {
  const config = loadLoginConfig(env);
  const browser = await step('note_direct_browser_start_failed',
    () => (launch || (() => require('playwright').chromium.launch({ headless: true })))());
  try {
    const page = await step('note_direct_browser_start_failed', async () => {
      const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      return context.newPage();
    });
    await signIn(page, config);
    log('NOTE_UI_DIRECT_LOGIN=accepted');
    await step('note_direct_editor_check_failed', () => ensureEditorReady(page));
    log('NOTE_UI_EDITOR_READY=true');
    log('NOTE_UI_DRAFT_FILLED=false');
    log('NOTE_UI_PUBLISH_CLICKED=false');
    return { loggedIn: true, editorReady: true };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { NOTE_LOGIN_URL, loadLoginConfig, safeError, signIn, runDirectAuth };
