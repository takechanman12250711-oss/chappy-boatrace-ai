'use strict';
const { createHash } = require('node:crypto');

// Public reader contracts inspected on 2026-10-13. Unknown revisions are not
// guessed or invoked. These are read-operation fingerprints, not credentials.
const VIEWER_QUERY_SHA256 = 'd9554249d8f102238a9b59b39eabd51ce7e88e1cfec98510bf6bf3697ab21a96';
const DETAIL_ACTION = '709c79b9329feb20ed26da558ffe306d294c4fd3c5';
const ASSETS = new Set(['10961-02318a79c2dbfa50.js', '81986-3bc5090b50ab7d82.js',
  '337-0a15753b7145f5c6.js', '71773-089b77511250c2ed.js'].map(name => '/next/_next/static/chunks/' + name));
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
const increment = (object, field) => { object[field] = Math.min(255, object[field] + 1); };
const counter = () => ({ requests: 0, responses: 0, failed: 0, httpStatus: null, httpStatusConflict: false });

function startRecoveryReaderObserver(page, target) {
  const state = { version: 'note-recovery-reader-diagnostic-v1', attached: false,
    navigationObserved: false, detached: false, observerErrors: 0, dropped: 0, pendingAtDetach: 0,
    viewer: { ...counter(), state: 'not_observed', ownerMatch: null },
    creator: { ...counter(), state: 'not_observed' }, auth: counter(), detail: counter(),
    assets: { ...counter(), httpErrors: 0 } };
  const listeners = [], pending = new Set(), classifications = new Set(), tracked = new WeakMap();
  const viewerRows = [], creatorRows = [];
  let active = true, navigationRequested = false, navigation = false, requestCount = 0, final;
  const valid = /^https:\/\/note\.com\/great_robin3243\/n\/(n[a-f0-9]+)$/.exec(target?.url || '');
  const targetValid = valid && target.noteId === valid[1];
  const error = () => { if (active) increment(state, 'observerErrors'); };
  const inTarget = () => active && navigation && page.url() === target.url;
  const mainFrame = request => request.frame() === page.mainFrame();
  function enqueue(work) {
    if (!active) return;
    if (pending.size >= 64) { increment(state, 'dropped'); return; }
    const task = Promise.resolve().then(work).catch(error).finally(() => pending.delete(task));
    pending.add(task);
  }
  function candidate(request) {
    if (!inTarget() || !mainFrame(request)) return null;
    const url = new URL(request.url()), method = request.method();
    if (url.username || url.password || url.hash) return null;
    if (url.origin === 'https://graphql.note.com' && url.pathname === '/graphql' && !url.search && method === 'POST') return 'viewer';
    if (url.origin === 'https://note.com' && !url.search) {
      if (url.pathname === `/api/v3/notes/${target.noteId}` && method === 'GET') return 'creator';
      if (url.pathname === '/api/v3/graphql/auth' && method === 'POST') return 'auth';
      if (url.href === target.url && method === 'POST') return 'detail';
    }
    if (url.origin === 'https://frontend.st-note.com' && !url.search && ASSETS.has(url.pathname) && method === 'GET') return 'assets';
    return null;
  }
  async function classify(request, kind) {
    if (!inTarget()) return null;
    if (kind === 'viewer') {
      // Read only the known public query document; variables/other fields are
      // neither retained nor emitted. Never inspect authentication headers.
      const data = request.postDataJSON();
      if (!data || Array.isArray(data) || data.operationName !== 'ViewerQuery' ||
          typeof data.query !== 'string' || data.query.length > 4096 ||
          createHash('sha256').update(data.query).digest('hex') !== VIEWER_QUERY_SHA256) return null;
    } else if (kind === 'detail') {
      if (await request.headerValue('next-action') !== DETAIL_ACTION) return null;
    }
    if (!inTarget()) return null;
    increment(state[kind], 'requests');
    return kind;
  }
  function onRequest(request) {
    try {
      if (active && !navigation && mainFrame(request) && request.isNavigationRequest() &&
          request.method() === 'GET' && request.url() === target.url) navigationRequested = true;
      const kind = candidate(request);
      if (!kind) return;
      if (requestCount++ >= 64) { increment(state, 'dropped'); return; }
      const classification = Promise.resolve().then(() => classify(request, kind)).catch(() => { error(); return null; })
        .finally(() => classifications.delete(classification));
      classifications.add(classification);
      tracked.set(request, { classification, responseSeen: false, failedSeen: false }); // Responses to older in-flight requests are excluded.
    } catch { error(); }
  }
  function onResponse(response) {
    let record;
    try { record = tracked.get(response.request()); } catch { error(); }
    if (!record || record.responseSeen) return;
    record.responseSeen = true;
    const { classification } = record;
    enqueue(async () => {
      const kind = await classification;
      if (!kind || !inTarget()) return;
      const count = state[kind], status = response.status();
      const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
      if (count.responses === 0) count.httpStatus = safeStatus;
      else if (count.httpStatus !== safeStatus) { count.httpStatus = null; count.httpStatusConflict = true; }
      increment(count, 'responses');
      if (kind === 'assets' && (status < 200 || status >= 400)) increment(count, 'httpErrors');
      if (!['viewer', 'creator'].includes(kind)) return; // Auth/action/asset bodies are never read.
      const rows = kind === 'viewer' ? viewerRows : creatorRows;
      let row = { state: 'unknown', key: null };
      try {
        if (status < 200 || status >= 300) { rows.push(row); return; }
        const data = await response.json();
        if (!inTarget()) return;
        if (kind === 'viewer') {
          if (data?.errors === undefined || (Array.isArray(data.errors) && data.errors.length === 0)) {
            const viewer = data?.data?.viewer;
            if (viewer?.__typename === 'NotLoggedInViewer') row = { state: 'not_logged_in', key: null };
            else if (viewer?.__typename === 'Viewer') row = { state: 'viewer', key: key(viewer.key) };
          }
        } else {
          const note = data?.data;
          if (note?.key === target.noteId && note?.user?.urlname === 'great_robin3243' && key(note.user.key)) {
            row = { state: 'verified', key: key(note.user.key) };
          }
        }
      } catch { error(); }
      if (inTarget()) rows.push(row);
    });
  }
  function onFailed(request) {
    try {
      const record = tracked.get(request);
      if (!record || record.failedSeen) return;
      record.failedSeen = true;
      enqueue(async () => {
        const kind = await record.classification;
        if (kind && inTarget()) increment(state[kind], 'failed');
      });
    } catch { error(); }
  }
  function onNavigation(frame) {
    try {
      if (active && navigationRequested && frame === page.mainFrame() && frame.url() === target.url) {
        navigation = true; state.navigationObserved = true;
      }
    } catch { error(); }
  }
  function summarize(rows, count) {
    if (count.requests > rows.length + count.failed) return 'pending';
    if (count.failed || rows.some(row => row.state === 'unknown')) return 'unknown';
    if (!rows.length) return 'not_observed';
    if (rows.some(row => row.state !== rows[0].state || row.key !== rows[0].key)) return 'conflicting';
    return rows[0].state;
  }
  function stop() {
    if (final) return final;
    active = false; // No late parser or listener may commit after this point.
    // Pending async classifications/parsers, not the number of unresponded requests.
    state.pendingAtDetach = pending.size + classifications.size;
    state.detached = true;
    for (const [event, handler] of listeners) {
      try { page.off(event, handler); } catch { state.detached = false; increment(state, 'observerErrors'); }
    }
    state.viewer.state = summarize(viewerRows, state.viewer);
    state.creator.state = summarize(creatorRows, state.creator);
    if (!state.pendingAtDetach && !state.dropped && !state.observerErrors &&
        state.viewer.state === 'viewer' && state.creator.state === 'verified' && viewerRows[0].key) {
      state.viewer.ownerMatch = viewerRows[0].key === creatorRows[0].key;
    }
    viewerRows.length = 0; creatorRows.length = 0; // Discard transient identity keys.
    final = JSON.parse(JSON.stringify(state));
    return final;
  }
  if (targetValid) {
    try {
      for (const pair of [['framenavigated', onNavigation], ['request', onRequest], ['response', onResponse],
        ['requestfailed', onFailed]]) {
        listeners.push(pair); page.on(...pair);
      }
      state.attached = true;
    } catch { error(); stop(); }
  } else { error(); stop(); }
  return { stop };
}
module.exports = { startRecoveryReaderObserver, VIEWER_QUERY_SHA256, DETAIL_ACTION };
