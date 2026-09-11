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

function navigateViaCdp(webSocketUrl, targetUrl) {
  if (typeof WebSocket !== 'function') throw new Error('websocket_unavailable');
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timer = setTimeout(() => {
      try { socket.close(); } catch (_) {}
      reject(new Error('cdp_navigate_timeout'));
    }, 10000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
      socket.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: targetUrl } }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch (_) { return; }
      if (message.id !== 2) return;
      clearTimeout(timer);
      try { socket.close(); } catch (_) {}
      if (message.error) reject(new Error(`cdp_navigate_failed_${message.error.code || 'unknown'}`));
      else resolve(message.result || {});
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('cdp_websocket_error'));
    });
  });
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
  const webSocketUrl = initialPage.webSocketDebuggerUrl || initialPage.web_socket_debugger_url || null;
  if (!webSocketUrl || !/^wss:\/\//i.test(webSocketUrl)) throw new Error('wss_debugger_url_missing');

  await navigateViaCdp(webSocketUrl, 'https://note.com/login');
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
    navigation: 'cdp',
    ttlSeconds: setup.timeoutSeconds || null,
    hasExpiry: Boolean(setup.expiresAt)
  }));
}

main().catch((error) => {
  console.error(error.message || 'tinyfish profile auth session failed');
  process.exit(1);
});
