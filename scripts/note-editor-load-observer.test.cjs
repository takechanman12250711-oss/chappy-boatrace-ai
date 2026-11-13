'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { startEditorLoadObserver } = require('./note-editor-load-observer.cjs');
const { ensureEditorReady, NOTE_EDITOR_URL } = require('./note-github-ui-transport');
const PRIVATE = 'private-sentinel-cookie-body-exception-token';
const PREFIX = 'NOTE_UI_EDITOR_LOAD=';

function fixture() {
  const page = new EventEmitter(), main = {}, child = {};
  const events = [];
  const forbidden = () => { throw new Error(PRIVATE); };
  Object.assign(page, {
    mainFrame: () => main, frames: () => [main], url: () => NOTE_EDITOR_URL,
    goto: async (...args) => { events.push(['goto', ...args]); return { status: () => 200 }; },
    waitForTimeout: async ms => events.push(['wait', ms]),
    evaluate: forbidden, content: forbidden, screenshot: forbidden, context: forbidden,
    request: forbidden
  });
  const request = ({ type = 'script', host = 'editor.note.com', frame = main, method = 'GET' } = {}) => ({
    resourceType: () => type, method: () => method, frame: () => frame,
    url: () => `https://${host}/private/${PRIVATE}?token=${PRIVATE}`,
    headers: forbidden, postData: forbidden, failure: forbidden
  });
  const assertDetached = () => {
    for (const event of ['request', 'response', 'requestfailed', 'pageerror']) assert.equal(page.listenerCount(event), 0);
  };
  return { page, main, child, request, events, assertDetached };
}

async function capture(work) {
  const logs = [], previous = console.error;
  console.error = line => logs.push(line);
  let result, failure;
  try { result = await work(); } catch (error) { failure = error; }
  finally { console.error = previous; }
  const observation = logs.filter(line => line.startsWith(PREFIX));
  assert.equal(logs.join('\n').includes(PRIVATE), false);
  return { result, failure, logs, observation: observation.map(line => JSON.parse(line.slice(PREFIX.length))) };
}

test('observes only existing main-frame note assets; emits fixed scalars with no private reads', () => {
  const f = fixture(), observer = startEditorLoadObserver(f.page);
  const script = f.request(), stylesheet = f.request({ type: 'stylesheet', host: 'frontend.st-note.com' });
  const ignored = [f.request({ host: 'unrelated.example' }), f.request({ type: 'xhr' }),
    f.request({ frame: f.child }), f.request({ method: 'POST' })];
  for (const request of [script, stylesheet, ...ignored]) f.page.emit('request', request);
  const response = { request: () => script, status: () => 503 };
  f.page.emit('response', response); f.page.emit('response', response);
  for (const request of [stylesheet, stylesheet, ...ignored]) f.page.emit('requestfailed', request);
  f.page.emit('pageerror', new Error(PRIVATE));
  observer.navigation({ status: () => 502 }); observer.stage('fields');
  const record = observer.stop();
  assert.deepEqual(record, {
    version: 'note-editor-load-v1', stage: 'fields', attached: true, detached: true,
    observerErrors: 0, dropped: 0, navigationCompleted: true, navigationFailed: false,
    navigationStatus: 502, scriptRequests: 1, stylesheetRequests: 1,
    scriptHttpErrors: 1, stylesheetHttpErrors: 0, scriptFailed: 0, stylesheetFailed: 1, pageErrors: 1
  });
  for (const value of Object.values(record)) assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
  assert.equal(JSON.stringify(record).includes(PRIVATE), false);
  assert.equal(/https?:|token|exception|cookie/.test(JSON.stringify(record)), false);
  f.assertDetached();
  f.page.emit('pageerror', new Error(PRIVATE));
  observer.navigationFailed(); observer.stage('ready');
  assert.equal(observer.stop(), record);
});

test('resource storage is bounded and malformed browser observations are sanitized', () => {
  const f = fixture(), observer = startEditorLoadObserver(f.page);
  for (let i = 0; i < 400; i += 1) {
    f.page.emit('request', f.request());
    f.page.emit('pageerror', new Error(PRIVATE));
  }
  f.page.emit('request', { resourceType() { throw new Error(PRIVATE); } });
  observer.navigation({ status: () => PRIVATE });
  const record = observer.stop();
  assert.equal(record.scriptRequests, 64);
  assert.equal(record.dropped, 255);
  assert.equal(record.pageErrors, 255);
  assert.equal(record.observerErrors, 2);
  assert.equal(record.navigationStatus, null);
  f.assertDetached();
});

test('successful readiness keeps calls and output unchanged and removes all listeners', async () => {
  const f = fixture();
  const { result, failure, logs } = await capture(() => ensureEditorReady(f.page, async () => ({ isEditable: async () => true })));
  assert.equal(result, NOTE_EDITOR_URL); assert.equal(failure, undefined); assert.deepEqual(logs, []);
  assert.deepEqual(f.events, [['goto', NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }], ['wait', 1000]]);
  f.assertDetached();
});

test('missing fields preserves v1 diagnostic and original gate while adding load observations', async () => {
  const f = fixture();
  f.page.goto = async () => {
    f.page.emit('request', f.request());
    f.page.emit('pageerror', new Error(PRIVATE));
    return { status: () => 503 };
  };
  const { failure, logs, observation } = await capture(() => ensureEditorReady(f.page, async () => null));
  assert.equal(failure.message, 'note_editor_fields_not_ready');
  assert.equal(logs.filter(line => line.startsWith('NOTE_UI_EDITOR_READINESS=')).length, 1);
  assert.equal(observation.length, 1); assert.equal(observation[0].navigationStatus, 503);
  assert.equal(observation[0].stage, 'fields'); assert.equal(observation[0].pageErrors, 1);
  f.assertDetached();
});

for (const stage of ['navigation', 'initial_wait', 'fields']) {
  test(`original ${stage} exception survives with listeners removed and no private exception logging`, async () => {
    const f = fixture(), original = new Error(PRIVATE);
    if (stage === 'navigation') f.page.goto = async () => { throw original; };
    if (stage === 'initial_wait') f.page.waitForTimeout = async () => { throw original; };
    const locate = async () => { throw original; };
    const { failure, observation } = await capture(() => ensureEditorReady(f.page, locate));
    assert.equal(failure, original); assert.equal(observation.length, 1);
    assert.equal(observation[0].stage, stage);
    assert.equal(observation[0].navigationFailed, stage === 'navigation');
    f.assertDetached();
  });
}

test('initial host redirect and diagnostic logger failure still detach without masking gates', async () => {
  const f = fixture(); f.page.url = () => 'https://note.com/login';
  const previous = console.error; console.error = () => { throw new Error(PRIVATE); };
  try { await assert.rejects(ensureEditorReady(f.page), { message: 'note_editor_session_not_ready_note.com' }); }
  finally { console.error = previous; }
  f.assertDetached();
});

test('partial listener registration failure cleans up and cannot stop a usable editor', async () => {
  const f = fixture(), originalOn = f.page.on;
  f.page.on = function(event, handler) {
    originalOn.call(this, event, handler);
    if (event === 'response') throw new Error(PRIVATE);
    return this;
  };
  const { failure, logs } = await capture(() => ensureEditorReady(f.page, async () => ({ isEditable: async () => true })));
  assert.equal(failure, undefined); assert.deepEqual(logs, []); f.assertDetached();
});

test('listener removal errors are counted without replacing a navigation failure', async () => {
  const f = fixture(), original = new Error(PRIVATE), originalOff = f.page.off;
  f.page.goto = async () => { throw original; };
  f.page.off = function(event, handler) {
    originalOff.call(this, event, handler);
    throw new Error(PRIVATE);
  };
  const { failure, observation } = await capture(() => ensureEditorReady(f.page));
  assert.equal(failure, original); assert.equal(observation[0].detached, false);
  assert.equal(observation[0].observerErrors, 4); f.assertDetached();
});
