'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDraftBundle, resolveDraftBundlePath } = require('./note-browserbase-draft-save');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-draft-save-'));
const file = path.join(dir, 'bundle.json');
fs.writeFileSync(file, JSON.stringify({
  article: {
    title: ' test title ',
    fullText: ' body text '
  }
}), 'utf8');

const loaded = loadDraftBundle(file);
assert.equal(loaded.title, 'test title');
assert.equal(loaded.body, 'body text');
assert.equal(loaded.absolute, path.resolve(file));

assert.throws(() => loadDraftBundle(''), /note_draft_bundle_path_required/);
assert.equal(resolveDraftBundlePath({ argv: ['node', 'script', file], env: {} }), file);
assert.equal(resolveDraftBundlePath({ argv: ['node', 'script'], env: { NOTE_DRAFT_BUNDLE_PATH: file } }), file);
assert.throws(
  () => resolveDraftBundlePath({ argv: ['node', 'script'], env: {} }),
  /note_draft_bundle_path_required/
);

const readyRoot = path.join(dir, 'ready-root');
const day = path.join(readyRoot, '20260912');
fs.mkdirSync(day, { recursive: true });
const older = path.join(day, 'older.json');
const newer = path.join(day, 'newer.json');
const blocked = path.join(day, 'blocked.json');
fs.writeFileSync(older, JSON.stringify({
  capturedAt: '2026-09-12T00:00:00.000Z',
  article: { ok: true, publishable: true, title: 'older', fullText: 'older body' }
}), 'utf8');
fs.writeFileSync(newer, JSON.stringify({
  capturedAt: '2026-09-12T01:00:00.000Z',
  article: { ok: true, publishable: true, title: 'newer', fullText: 'newer body' }
}), 'utf8');
fs.writeFileSync(blocked, JSON.stringify({
  capturedAt: '2026-09-12T02:00:00.000Z',
  article: { ok: true, publishable: false, title: 'blocked', fullText: 'blocked body' }
}), 'utf8');

const selectedLatest = resolveDraftBundlePath({
  argv: ['node', 'script'],
  env: { NOTE_DRAFT_AUTO_SELECT: 'true', NOTE_DRAFT_ROOT: readyRoot }
});
assert.equal(selectedLatest, path.resolve(newer));

const selectedEarliest = resolveDraftBundlePath({
  argv: ['node', 'script'],
  env: {
    NOTE_DRAFT_AUTO_SELECT: 'true',
    NOTE_DRAFT_ROOT: readyRoot,
    NOTE_READY_STRATEGY: 'earliest'
  }
});
assert.equal(selectedEarliest, path.resolve(older));

const noTitle = path.join(dir, 'no-title.json');
fs.writeFileSync(noTitle, JSON.stringify({ article: { fullText: 'body' } }), 'utf8');
assert.throws(() => loadDraftBundle(noTitle), /note_draft_title_missing/);

const noBody = path.join(dir, 'no-body.json');
fs.writeFileSync(noBody, JSON.stringify({ article: { title: 'title' } }), 'utf8');
assert.throws(() => loadDraftBundle(noBody), /note_draft_body_missing/);

console.log('note-browserbase-draft-save tests passed');
