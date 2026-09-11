'use strict';

const fs = require('fs');
const path = require('path');
const { startProfileSetupSession } = require('./tinyfish-context-profile-session');

async function getPages(baseUrl, apiKey) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/pages`, {
    headers: { 'X-API-Key': apiKey }
  });
  if (!response.ok) throw new Error(`pages_request_failed_${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : Array.isArray(payload.pages) ? payload.pages : [];
}

async function main() {
  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  if (!apiKey) throw new Error('TINYFISH_API_KEY is not configured');
  if (!profileId) throw new Error('TINYFISH_PROFILE_ID is not configured');

  const setup = await startProfileSetupSession({ profileId, apiKey });
  if (!setup.ok) throw new Error(setup.reason || 'setup_failed');
  if (!setup.baseUrl) throw new Error('setup_base_url_missing');

  let pages = await getPages(setup.baseUrl, apiKey);
  const initialPage = pages[0] || {};
  const pageId = initialPage.id || initialPage.pageId || initialPage.page_id || null;
  if (!pageId) throw new Error('page_id_missing');

  const navigateResponse = await fetch(`${setup.baseUrl.replace(/\/$/, '')}/pages/${encodeURIComponent(pageId)}/navigate`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url: 'https://note.com/login' })
  });
  if (!navigateResponse.ok) throw new Error(`navigate_request_failed_${navigateResponse.status}`);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  pages = await getPages(setup.baseUrl, apiKey);
  const page = pages.find((item) => item && /^https:\/\/note\.com\/login/i.test(item.url || '')) || pages[0] || {};
  const launchUrl = page.devtoolsFrontendUrl || page.devtools_frontend_url || null;
  if (!launchUrl || !/^https:\/\//i.test(launchUrl)) throw new Error('https_devtools_url_missing');

  const outputDir = path.resolve(process.env.RUNNER_TEMP || '.', 'tinyfish-profile-auth');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'OPEN-ON-IPHONE.txt');
  fs.writeFileSync(outputPath, [
    'TinyFish Browser Context Profile authentication session',
    '',
    'Open this URL on iPhone immediately (session is short-lived):',
    launchUrl,
    '',
    `Expires at: ${setup.expiresAt || 'unknown'}`,
    `Session ID: ${setup.sessionId}`,
    '',
    'The remote browser is pre-opened at https://note.com/login.',
    'After completing note/X login, return to ChatGPT so the profile can be saved.'
  ].join('\n'), { mode: 0o600 });

  console.log(JSON.stringify({
    ok: true,
    artifactPrepared: true,
    preopenedNoteLogin: true,
    ttlSeconds: setup.timeoutSeconds || null,
    hasExpiry: Boolean(setup.expiresAt)
  }));
}

main().catch((error) => {
  console.error(error.message || 'tinyfish profile auth session failed');
  process.exit(1);
});
