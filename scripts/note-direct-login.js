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

const hostOf = value => {
  try { return new URL(value).hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 60) || 'unknown'; } catch { return 'unknown'; }
};

async function signIn(page, config) {
  await page.goto(NOTE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const id = page.getByLabel('メールアドレス または note ID', { exact: true });
  const password = page.getByLabel('パスワード', { exact: true });
  const submit = page.getByRole('button', { name: 'ログイン', exact: true });
  await id.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (await id.count() !== 1 || await password.count() !== 1 || await submit.count() !== 1) {
    throw new Error('note_login_form_not_found');
  }
  await id.fill(config.id);
  await password.fill(config.password);
  if (!(await submit.isEnabled())) throw new Error('note_login_button_disabled');
  // One attempt only. A wrong password or a bot check must never be retried
  // automatically: repeated failures could lock the account.
  await submit.click();
  await page.waitForURL(url => !/\/login\/?$/.test(new URL(String(url)).pathname), { timeout: 30000 }).catch(() => {});
  const url = page.url();
  if (hostOf(url) !== 'note.com') throw new Error(`note_login_left_note_${hostOf(url)}`);
  if (/\/login\/?$/.test(new URL(url).pathname)) throw new Error('note_login_not_accepted');
  return true;
}

async function runDirectAuth({ env = process.env, ensureEditorReady, launch, log = console.log } = {}) {
  const config = loadLoginConfig(env);
  const browser = await (launch || (() => require('playwright').chromium.launch({ headless: true })))();
  try {
    const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage();
    await signIn(page, config);
    log('NOTE_UI_DIRECT_LOGIN=accepted');
    await ensureEditorReady(page);
    log('NOTE_UI_EDITOR_READY=true');
    log('NOTE_UI_DRAFT_FILLED=false');
    log('NOTE_UI_PUBLISH_CLICKED=false');
    return { loggedIn: true, editorReady: true };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { NOTE_LOGIN_URL, loadLoginConfig, signIn, runDirectAuth };
