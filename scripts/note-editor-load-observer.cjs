'use strict';

const ASSET_ORIGINS = new Set(['https://editor.note.com', 'https://frontend.st-note.com']);
const STAGES = new Set(['navigation', 'initial_wait', 'initial_host', 'fields', 'ready']);
const increment = (state, key) => { state[key] = Math.min(255, state[key] + 1); };

// Observe existing browser events only. Never read bodies, headers, DOM, error
// messages or stacks, and never retain a resource URL in the diagnostic record.
function startEditorLoadObserver(page) {
  const state = {
    version: 'note-editor-load-v1', stage: 'navigation', attached: false, detached: false,
    observerErrors: 0, dropped: 0, navigationCompleted: false, navigationFailed: false,
    navigationStatus: null, scriptRequests: 0, stylesheetRequests: 0,
    scriptHttpErrors: 0, stylesheetHttpErrors: 0, scriptFailed: 0, stylesheetFailed: 0,
    pageErrors: 0
  };
  const listeners = [], tracked = new WeakMap();
  let active = true, count = 0, final;
  const error = () => { if (active) increment(state, 'observerErrors'); };
  function onRequest(request) {
    if (!active) return;
    try {
      const type = request.resourceType();
      if (!['script', 'stylesheet'].includes(type) || request.method() !== 'GET' ||
          request.frame() !== page.mainFrame()) return;
      const url = new URL(request.url());
      if (url.username || url.password || !ASSET_ORIGINS.has(url.origin)) return;
      if (tracked.has(request)) return;
      if (count >= 64) { increment(state, 'dropped'); return; }
      tracked.set(request, { type, responded: false, failed: false });
      count += 1;
      increment(state, `${type}Requests`);
    } catch { error(); }
  }
  function onResponse(response) {
    if (!active) return;
    try {
      const record = tracked.get(response.request());
      if (!record || record.responded) return;
      record.responded = true;
      const status = response.status();
      if (!Number.isInteger(status) || status < 100 || status > 599) { error(); return; }
      if (status >= 400) increment(state, `${record.type}HttpErrors`);
    } catch { error(); }
  }
  function onFailed(request) {
    if (!active) return;
    try {
      const record = tracked.get(request);
      if (!record || record.failed) return;
      record.failed = true;
      increment(state, `${record.type}Failed`);
    } catch { error(); }
  }
  const onPageError = () => { if (active) increment(state, 'pageErrors'); };
  function stop() {
    if (final) return final;
    active = false;
    state.detached = true;
    for (const [event, handler] of listeners) {
      try { page.off(event, handler); }
      catch { state.detached = false; increment(state, 'observerErrors'); }
    }
    final = Object.freeze({ ...state });
    return final;
  }
  try {
    if (typeof page.on !== 'function' || typeof page.off !== 'function') throw new Error();
    for (const pair of [['request', onRequest], ['response', onResponse],
      ['requestfailed', onFailed], ['pageerror', onPageError]]) {
      listeners.push(pair); // Also detach if registration itself throws.
      page.on(...pair);
    }
    state.attached = true;
  } catch { error(); stop(); }
  return {
    stage(value) { if (active && STAGES.has(value)) state.stage = value; },
    navigation(response) {
      if (!active) return;
      state.navigationCompleted = true;
      if (!response) return; // Playwright may return null for a navigation.
      try {
        const status = response.status();
        if (Number.isInteger(status) && status >= 100 && status <= 599) state.navigationStatus = status;
        else error();
      } catch { error(); }
    },
    navigationFailed() { if (active) state.navigationFailed = true; },
    stop
  };
}

module.exports = { startEditorLoadObserver };
