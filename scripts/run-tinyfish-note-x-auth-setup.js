'use strict';

const { startProfileSetupSession, saveProfileSetupSession } = require('./tinyfish-context-profile-session');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  const maxWaitMs = Math.min(Number(process.env.X_AUTH_WAIT_MS || 480000), 480000);
  if (!apiKey) throw new Error('TINYFISH_API_KEY is not configured');
  if (!profileId) throw new Error('TINYFISH_PROFILE_ID is not configured');

  const { chromium } = require('playwright-core');
  const setup = await startProfileSetupSession({ profileId, apiKey });
  if (!setup.ok) throw new Error(setup.reason);

  const browser = await chromium.connectOverCDP(setup.cdpUrl, { timeout: 30000 });
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('browser_context_missing');
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const xLink = page.getByRole('link', { name: /X|Twitter/i }).first();
    const xButton = page.getByRole('button', { name: /X|Twitter/i }).first();
    if (await xLink.count()) await xLink.click();
    else if (await xButton.count()) await xButton.click();
    else throw new Error('note_x_login_control_missing');

    console.log(JSON.stringify({ ok: true, state: 'waiting_for_x_authentication', profileSaved: false }));

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await sleep(5000);
      const pages = context.pages();
      const active = pages[pages.length - 1] || page;
      const url = active.url();
      if (/^https:\/\/note\.com\//i.test(url) && !/\/login(?:[/?#]|$)/i.test(url)) {
        await active.goto('https://note.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const body = await active.locator('body').innerText();
        if (!/(^|\n)ログイン(\n|$)/.test(body)) {
          const saved = await saveProfileSetupSession({ profileId, sessionId: setup.sessionId, apiKey });
          if (!saved.ok) throw new Error(saved.reason);
          console.log(JSON.stringify({ ok: true, state: 'note_authenticated_profile_saved', profileSaved: true }));
          return;
        }
      }
    }

    console.log(JSON.stringify({ ok: false, state: 'x_authentication_timeout', profileSaved: false }));
    process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || 'tinyfish X auth setup failed');
  process.exit(1);
});
