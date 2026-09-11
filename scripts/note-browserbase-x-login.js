'use strict';

const NOTE_EDITOR_URL = 'https://editor.note.com/new';
const NOTE_LOGIN_HOST_RE = /(^|\.)note\.com$/i;
const X_HOST_RE = /(^|\.)x\.com$/i;

function getCredentials(env = process.env) {
  const loginId = String(env.X_LOGIN_ID || '').trim();
  const password = String(env.X_PASSWORD || '');
  return {
    configured: Boolean(loginId && password),
    loginId,
    password
  };
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const item = await firstVisible(page.locator(selector));
    if (item) {
      await item.click();
      return true;
    }
  }
  return false;
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const item = await firstVisible(page.locator(selector));
    if (item) {
      await item.fill(value);
      return true;
    }
  }
  return false;
}

async function loginNoteViaX(page, { env = process.env } = {}) {
  const credentials = getCredentials(env);
  if (!credentials.configured) {
    return { ok: false, reason: 'x_credentials_missing' };
  }

  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (new URL(page.url()).hostname === 'editor.note.com') {
    return { ok: true, alreadyAuthenticated: true, finalUrl: page.url() };
  }

  const noteHost = new URL(page.url()).hostname;
  if (!NOTE_LOGIN_HOST_RE.test(noteHost)) {
    return { ok: false, reason: 'unexpected_note_login_redirect', finalUrl: page.url() };
  }

  const xClicked = await clickFirst(page, [
    'a:has-text("Xでログイン")',
    'button:has-text("Xでログイン")',
    'a[href*="twitter"]',
    'a[href*="x.com"]'
  ]);
  if (!xClicked) return { ok: false, reason: 'note_x_login_button_missing', finalUrl: page.url() };

  await page.waitForURL((url) => X_HOST_RE.test(url.hostname), { timeout: 60000 });

  const loginFilled = await fillFirst(page, [
    'input[name="username_or_email"]',
    'input[autocomplete="username"]',
    'input[name="text"]',
    'input[type="text"]'
  ], credentials.loginId);
  if (!loginFilled) return { ok: false, reason: 'x_login_id_field_missing', finalUrl: page.url() };

  await clickFirst(page, [
    'button:has-text("次へ")',
    'button:has-text("Next")',
    '[role="button"]:has-text("次へ")',
    '[role="button"]:has-text("Next")',
    'button:has-text("Continue")'
  ]);

  const passwordVisible = await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
  if (!passwordVisible) {
    return { ok: false, reason: 'x_password_field_missing_or_challenge', finalUrl: page.url() };
  }

  await page.locator('input[type="password"]').first().fill(credentials.password);
  const submitted = await clickFirst(page, [
    'button:has-text("ログイン")',
    'button:has-text("Log in")',
    '[role="button"]:has-text("ログイン")',
    '[role="button"]:has-text("Log in")',
    'button:has-text("Sign in")'
  ]);
  if (!submitted) return { ok: false, reason: 'x_login_submit_missing', finalUrl: page.url() };

  await page.waitForTimeout(1500);

  if (X_HOST_RE.test(new URL(page.url()).hostname)) {
    await clickFirst(page, [
      'button:has-text("Authorize app")',
      'button:has-text("アプリにアクセスを許可")',
      'input[value*="Authorize"]'
    ]);
  }

  const returnedToNote = await page.waitForURL((url) => NOTE_LOGIN_HOST_RE.test(url.hostname) || url.hostname === 'editor.note.com', { timeout: 60000 }).then(() => true).catch(() => false);
  if (!returnedToNote) return { ok: false, reason: 'x_oauth_callback_timeout', finalUrl: page.url() };

  await page.goto(NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (new URL(page.url()).hostname !== 'editor.note.com') {
    return { ok: false, reason: 'note_authentication_not_persisted', finalUrl: page.url() };
  }

  return { ok: true, alreadyAuthenticated: false, finalUrl: page.url() };
}

module.exports = {
  NOTE_EDITOR_URL,
  getCredentials,
  loginNoteViaX
};
