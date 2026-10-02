'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDraftBundle } = require('./note-browserbase-draft-save');

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

const noTitle = path.join(dir, 'no-title.json');
fs.writeFileSync(noTitle, JSON.stringify({ article: { fullText: 'body' } }), 'utf8');
assert.throws(() => loadDraftBundle(noTitle), /note_draft_title_missing/);

const noBody = path.join(dir, 'no-body.json');
fs.writeFileSync(noBody, JSON.stringify({ article: { title: 'title' } }), 'utf8');
assert.throws(() => loadDraftBundle(noBody), /note_draft_body_missing/);

console.log('note-browserbase-draft-save tests passed');
