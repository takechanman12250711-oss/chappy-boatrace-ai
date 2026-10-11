'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureEditorReady, NOTE_EDITOR_URL } = require('./note-github-ui-transport');

const PREFIX = 'NOTE_UI_EDITOR_READINESS=';
const PRIVATE = 'private-sentinel-token-and-article-text';
const TITLE_SELECTORS = ['textarea[placeholder*="タイトル"]', 'input[placeholder*="タイトル"]', '[aria-label*="タイトル"]'];
const BODY_SELECTORS = ['textarea[placeholder*="本文"]', '[data-placeholder*="本文"][contenteditable="true"]', '.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'];
const KEYS = ['version', 'stage', 'location', 'titleFound', 'bodyFound', 'titleEditable', 'bodyEditable', 'frameCountKnown', 'frameCount'];

function harness({ title = true, body = true, titleEditable = true, bodyEditable = true,
  finalUrl = NOTE_EDITOR_URL, frameFailure = false, loggerFailure = false } = {}) {
  const events = [];
  const logs = [];
  const forbidden = () => { throw new Error(`unexpected private read ${PRIVATE}`); };
  const frame = { get url() { return forbidden(); }, get content() { return forbidden(); } };
  const page = {
    goto: async (...args) => events.push(['goto', ...args]),
    waitForTimeout: async ms => events.push(['wait', ms]),
    url: () => events.some(event => event[0] === 'locate') ? finalUrl : NOTE_EDITOR_URL,
    frames: () => {
      events.push(['frames']);
      if (frameFailure) throw new Error(PRIVATE);
      return [frame, frame];
    },
    get content() { return forbidden(); },
    get evaluate() { return forbidden(); },
    get context() { return forbidden(); },
    get screenshot() { return forbidden(); }
  };
  const locate = async (receivedPage, selectors) => {
    assert.equal(receivedPage, page);
    const field = events.some(event => event[0] === 'locate') ? 'body' : 'title';
    assert.deepEqual(selectors, field === 'title' ? TITLE_SELECTORS : BODY_SELECTORS);
    events.push(['locate', field]);
    if (!(field === 'title' ? title : body)) return null;
    return {
      isEditable: async () => {
        events.push(['editable', field]);
        const result = field === 'title' ? titleEditable : bodyEditable;
        if (result === 'reject') throw new Error(PRIVATE);
        return result;
      },
      get toJSON() { return forbidden(); },
      get inputValue() { return forbidden(); },
      get evaluate() { return forbidden(); },
      get fill() { return forbidden(); }
    };
  };
  return {
    page, events,
    async run() {
      const previous = console.error;
      console.error = (...args) => {
        if (loggerFailure) throw new Error(PRIVATE);
        assert.equal(args.length, 1);
        logs.push(args[0]);
      };
      let result, failure;
      try { result = await ensureEditorReady(page, locate); }
      catch (error) { failure = error; }
      finally { console.error = previous; }
      return { result, failure, logs };
    }
  };
}

function diagnostic(logs) {
  assert.equal(logs.length, 1);
  assert.ok(logs[0].startsWith(PREFIX));
  assert.ok(Buffer.byteLength(logs[0]) < 512);
  assert.equal(logs[0].includes(PRIVATE), false);
  assert.equal(/https?:|cookie|password|placeholder|stack|textarea|ProseMirror/.test(logs[0]), false);
  const record = JSON.parse(logs[0].slice(PREFIX.length));
  assert.deepEqual(Object.keys(record), KEYS);
  assert.equal(record.version, 'note-editor-readiness-v1');
  assert.equal(record.stage, 'fields');
  assert.ok(['editor_https', 'note_https', 'other_https', 'non_https', 'invalid'].includes(record.location));
  for (const key of ['titleFound', 'bodyFound', 'frameCountKnown']) assert.equal(typeof record[key], 'boolean');
  for (const key of ['titleEditable', 'bodyEditable']) {
    assert.ok(['not_checked', 'editable', 'not_editable', 'check_failed'].includes(record[key]));
  }
  assert.ok(Number.isSafeInteger(record.frameCount) && record.frameCount >= 0);
  return record;
}

const cases = [
  ['both missing', { title: false, body: false }, false, false, 'not_checked', 'not_checked', []],
  ['title missing', { title: false }, false, true, 'not_checked', 'not_checked', []],
  ['body missing', { body: false }, true, false, 'not_checked', 'not_checked', []],
  ['title read-only', { titleEditable: false }, true, true, 'not_editable', 'not_checked', ['title']],
  ['body read-only', { bodyEditable: false }, true, true, 'editable', 'not_editable', ['title', 'body']],
  ['title check rejected', { titleEditable: 'reject' }, true, true, 'check_failed', 'not_checked', ['title']],
  ['body check rejected', { bodyEditable: 'reject' }, true, true, 'editable', 'check_failed', ['title', 'body']]
];
for (const [name, options, titleFound, bodyFound, titleEditable, bodyEditable, checked] of cases) {
  test(`readiness diagnostics: ${name}, same fail-closed evaluation order`, async () => {
    const h = harness(options);
    const { failure, logs } = await h.run();
    assert.equal(failure.message, 'note_editor_fields_not_ready');
    assert.deepEqual(diagnostic(logs), { version: 'note-editor-readiness-v1', stage: 'fields', location: 'editor_https',
      titleFound, bodyFound, titleEditable, bodyEditable, frameCountKnown: true, frameCount: 2 });
    assert.deepEqual(h.events, [
      ['goto', NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }], ['wait', 1000],
      ['locate', 'title'], ['locate', 'body'], ...checked.map(field => ['editable', field]), ['frames']
    ]);
  });
}

test('usable editor keeps original URL and makes no diagnostic probes/logs', async () => {
  const url = `${NOTE_EDITOR_URL}?token=${PRIVATE}#${PRIVATE}`;
  const h = harness({ finalUrl: url });
  const { result, failure, logs } = await h.run();
  assert.equal(result, url);
  assert.equal(failure, undefined);
  assert.deepEqual(logs, []);
  assert.equal(h.events.some(event => event[0] === 'frames'), false);
  assert.deepEqual(h.events.filter(event => event[0] === 'editable'), [['editable', 'title'], ['editable', 'body']]);
});

for (const [location, finalUrl] of [
  ['editor_https', `https://user:${PRIVATE}@editor.note.com/notes/${PRIVATE}/edit?token=${PRIVATE}#${PRIVATE}`],
  ['note_https', `https://note.com/login?token=${PRIVATE}`],
  ['other_https', `https://${PRIVATE}.example.invalid/${PRIVATE}?token=${PRIVATE}`],
  ['non_https', `http://editor.note.com/${PRIVATE}`],
  ['invalid', PRIVATE]
]) {
  test(`URL classification is fixed and private data never escapes: ${location}`, async () => {
    const h = harness({ finalUrl, title: false });
    const { failure, logs } = await h.run();
    assert.equal(failure.message, 'note_editor_fields_not_ready');
    assert.equal(diagnostic(logs).location, location);
    assert.equal(h.events.some(event => event[0] === 'editable'), false);
  });
}

test('final host redirect stops before editability checks even when both fields were found', async () => {
  const h = harness({ finalUrl: `https://note.com/login?token=${PRIVATE}` });
  const { failure, logs } = await h.run();
  assert.equal(failure.message, 'note_editor_fields_not_ready');
  const record = diagnostic(logs);
  assert.equal(record.titleFound, true);
  assert.equal(record.bodyFound, true);
  assert.equal(record.titleEditable, 'not_checked');
  assert.equal(record.bodyEditable, 'not_checked');
  assert.equal(h.events.some(event => event[0] === 'editable'), false);
});

test('closed/detached page diagnostics do not mask the original failure or leak exceptions', async () => {
  const h = harness({ titleEditable: 'reject', frameFailure: true });
  const { failure, logs } = await h.run();
  assert.equal(failure.message, 'note_editor_fields_not_ready');
  const record = diagnostic(logs);
  assert.equal(record.titleEditable, 'check_failed');
  assert.equal(record.frameCountKnown, false);
  assert.equal(record.frameCount, 0);
});

test('unavailable frame inventory differs from an observed empty inventory', async () => {
  for (const frames of [[], { length: PRIVATE }, new Proxy([], { get: () => PRIVATE })]) {
    const h = harness({ body: false });
    h.page.frames = () => frames;
    const { failure, logs } = await h.run();
    assert.equal(failure.message, 'note_editor_fields_not_ready');
    const record = diagnostic(logs);
    assert.equal(record.frameCountKnown, Array.isArray(frames) && Number.isSafeInteger(frames.length));
    assert.equal(record.frameCount, 0);
  }
});

test('a failed diagnostic logger leaves the same error and does not retry', async () => {
  const h = harness({ title: false, loggerFailure: true });
  const { failure, logs } = await h.run();
  assert.equal(failure.message, 'note_editor_fields_not_ready');
  assert.deepEqual(logs, []);
  assert.equal(h.events.filter(event => event[0] === 'goto').length, 1);
  assert.equal(h.events.filter(event => event[0] === 'frames').length, 1);
});

test('navigation and initial-host gates remain before field lookup', async () => {
  const h = harness();
  const original = new Error('navigation failed');
  h.page.goto = async () => { throw original; };
  assert.equal((await h.run()).failure, original);
  const redirect = harness();
  redirect.page.url = () => 'https://note.com/login';
  const { failure, logs } = await redirect.run();
  assert.equal(failure.message, 'note_editor_session_not_ready_note.com');
  assert.deepEqual(logs, []);
  assert.equal(redirect.events.some(event => event[0] === 'locate'), false);
});

test('default locator retains both 15-second waits, 500ms polls, selectors and frame traversal', async () => {
  let clock = 0;
  const waited = [];
  const selectors = [];
  let main, child;
  const empty = scope => selector => {
    selectors.push([scope, selector]);
    return { count: async () => 0 };
  };
  main = { locator: empty('main') };
  child = { locator: empty('child'), get url() { throw new Error(PRIVATE); } };
  const page = {
    goto: async (url, options) => assert.deepEqual([url, options], [NOTE_EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }]),
    waitForTimeout: async ms => { waited.push(ms); clock += ms; },
    url: () => NOTE_EDITOR_URL,
    locator: empty('page'), frames: () => [main, child], mainFrame: () => main
  };
  const realNow = Date.now, previous = console.error, logs = [];
  Date.now = () => clock;
  console.error = line => logs.push(line);
  try { await assert.rejects(ensureEditorReady(page), { message: 'note_editor_fields_not_ready' }); }
  finally { Date.now = realNow; console.error = previous; }
  assert.deepEqual(waited, [1000, ...Array(60).fill(500)]);
  assert.equal(clock, 31000);
  assert.deepEqual(selectors, [TITLE_SELECTORS, BODY_SELECTORS].flatMap(group =>
    Array.from({ length: 30 }, () => ['page', 'child'].flatMap(scope => group.map(selector => [scope, selector]))).flat()));
  assert.equal(diagnostic(logs).frameCount, 2);
});
