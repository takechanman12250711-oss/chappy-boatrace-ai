'use strict';
// Login check only (auth mode): can the browser inside GitHub Actions reach
// the note editor by reusing a saved signed-in state (Playwright storageState
// from the secret NOTE_STATE_JSON_BASE64), with no outside browser service and
// no password? It never signs in, writes an article, reserves a race or
// publishes. The state, cookies and page text are never logged; only short
// fixed codes are.
const SAFE_CODES = new Set(['note_state_missing', 'note_state_invalid', 'note_state_empty', 'note_editor_fields_not_ready']);
const SAFE_HOST_CODES = /^note_editor_session_not_ready_[a-z0-9.-]{1,60}$/;

// Browser errors can carry cookie values or page text. Only codes written in
// this file, the state loader or the editor check pass through; every other
// failure becomes a fixed code with no message, cause or stack.
function safeError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return new Error(SAFE_CODES.has(message) || SAFE_HOST_CODES.test(message) ? message : fallback);
}
async function step(fallback, action) {
  try { return await action(); } catch (error) { throw safeError(error, fallback); }
}

// 2026-11-16: with the same saved state, the editor showed no title/body field
// in a headless browser (run 43788103199 on the runner, and headless Chrome on
// the owner's PC) but was ready in a normal window on the same PC. So this
// check opens a normal window; the workflow gives it a virtual display (xvfb).
// Nothing else about the browser is changed or disguised.
const LAUNCH_OPTIONS = Object.freeze({ headless: false });

async function runSavedStateAuth({ env = process.env, loadStorageState, ensureEditorReady, launch, log = console.log } = {}) {
  const storageState = await step('note_state_invalid', async () => loadStorageState(env));
  const browser = await step('note_state_browser_start_failed',
    () => (launch || (() => require('playwright').chromium.launch({ ...LAUNCH_OPTIONS })))());
  try {
    const page = await step('note_state_browser_start_failed', async () => {
      const context = await browser.newContext({ storageState, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      return context.newPage();
    });
    log('NOTE_UI_STATE_LOADED=true');
    // One attempt only. A rejected session must be renewed by the account
    // owner; it is never retried automatically.
    await step('note_state_editor_check_failed', () => ensureEditorReady(page));
    log('NOTE_UI_EDITOR_READY=true');
    log('NOTE_UI_DRAFT_FILLED=false');
    log('NOTE_UI_PUBLISH_CLICKED=false');
    return { stateLoaded: true, editorReady: true };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { LAUNCH_OPTIONS, safeError, runSavedStateAuth };
