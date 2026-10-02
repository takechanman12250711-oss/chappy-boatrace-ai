'use strict';

const NOTE_HOME = 'https://note.com/';

async function inspectNoteAuthentication({ cdpUrl, chromium, timeoutMs = 30000 } = {}) {
  if (!cdpUrl) return { ok: false, reason: 'cdp_url_missing' };
  if (!chromium || typeof chromium.connectOverCDP !== 'function') {
    return { ok: false, reason: 'playwright_chromium_unavailable' };
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: timeoutMs });
    const contexts = browser.contexts();
    if (!contexts.length) return { ok: false, reason: 'browser_context_missing' };
    const context = contexts[0];
    const pages = context.pages();
    const page = pages[0] || await context.newPage();
    await page.goto(NOTE_HOME, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const state = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : '';
      const loginVisible = /(^|\n)ログイン(\n|$)/.test(bodyText);
      const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href') || '');
      const hasAccountLink = links.some((href) => /^\/@[^/]+\/?$/.test(href) || /\/settings(?:\/|$)/.test(href));
      return { loginVisible, hasAccountLink, url: location.href };
    });

    const authenticated = state.hasAccountLink && !state.loginVisible;
    return {
      ok: true,
      authenticated,
      page: state.url,
      reason: authenticated ? 'note_authenticated' : 'note_not_authenticated'
    };
  } catch (error) {
    return { ok: false, reason: 'cdp_authentication_check_failed' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { NOTE_HOME, inspectNoteAuthentication };
