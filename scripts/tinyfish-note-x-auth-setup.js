'use strict';

const { startProfileSetupSession, saveProfileSetupSession } = require('./tinyfish-context-profile-session');

const NOTE_LOGIN = 'https://note.com/login';

async function prepareNoteXAuthSetup({ profileId, apiKey, chromium, fetchImpl, timeoutMs = 30000 } = {}) {
  if (!profileId) return { ok: false, reason: 'profile_id_missing' };
  if (!apiKey) return { ok: false, reason: 'tinyfish_api_key_missing' };
  if (!chromium || typeof chromium.connectOverCDP !== 'function') return { ok: false, reason: 'playwright_chromium_unavailable' };

  const setup = await startProfileSetupSession({ profileId, apiKey, fetchImpl });
  if (!setup.ok) return setup;

  let browser;
  try {
    browser = await chromium.connectOverCDP(setup.cdpUrl, { timeout: timeoutMs });
    const context = browser.contexts()[0];
    if (!context) return { ok: false, reason: 'browser_context_missing', sessionId: setup.sessionId };
    const page = context.pages()[0] || await context.newPage();
    await page.goto(NOTE_LOGIN, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const xLink = page.getByRole('link', { name: /X|Twitter/i }).first();
    const xButton = page.getByRole('button', { name: /X|Twitter/i }).first();
    if (await xLink.count()) await xLink.click();
    else if (await xButton.count()) await xButton.click();
    else return { ok: false, reason: 'note_x_login_control_missing', sessionId: setup.sessionId };

    await page.waitForURL(/(?:x\.com|twitter\.com)\//i, { timeout: timeoutMs });
    return {
      ok: true,
      reason: 'x_authentication_ready',
      sessionId: setup.sessionId,
      cdpUrl: setup.cdpUrl,
      page: page.url(),
      profileSaved: false
    };
  } catch (_) {
    return { ok: false, reason: 'x_authentication_setup_failed', sessionId: setup.sessionId, profileSaved: false };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function saveAfterNoteAuthentication({ profileId, apiKey, sessionId, chromium, cdpUrl, fetchImpl, timeoutMs = 30000 } = {}) {
  if (!sessionId || !cdpUrl) return { ok: false, reason: 'setup_session_missing' };
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: timeoutMs });
    const context = browser.contexts()[0];
    if (!context) return { ok: false, reason: 'browser_context_missing' };
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://note.com/', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const body = await page.locator('body').innerText();
    if (/(^|\n)ログイン(\n|$)/.test(body)) return { ok: false, reason: 'note_not_authenticated', profileSaved: false };
    const saved = await saveProfileSetupSession({ profileId, sessionId, apiKey, fetchImpl });
    if (!saved.ok) return { ...saved, profileSaved: false };
    return { ok: true, reason: 'note_x_authenticated_profile_saved', profileSaved: true };
  } catch (_) {
    return { ok: false, reason: 'note_authentication_finalize_failed', profileSaved: false };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { prepareNoteXAuthSetup, saveAfterNoteAuthentication };
