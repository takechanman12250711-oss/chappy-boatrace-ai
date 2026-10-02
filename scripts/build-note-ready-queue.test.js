'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildQueue } = require('./build-note-ready-queue');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-ready-queue-'));
const day = path.join(root, '20260912');
fs.mkdirSync(day, { recursive: true });

fs.writeFileSync(path.join(day, 'ready.json'), JSON.stringify({
  capturedAt: '2026-09-12T00:00:00.000Z',
  sourceCommit: 'abc123',
  article: { ok: true, publishable: true, title: ' Ready title ', fullText: ' Ready body ' }
}), 'utf8');
fs.writeFileSync(path.join(day, 'blocked.json'), JSON.stringify({
  capturedAt: '2026-09-12T00:01:00.000Z',
  article: { ok: true, publishable: false, title: 'Blocked', fullText: 'Body' }
}), 'utf8');
fs.writeFileSync(path.join(day, 'invalid.json'), '{', 'utf8');

const queue = buildQueue(root);
assert.equal(queue.version, 'note-ready-queue-v1');
assert.equal(queue.total, 3);
assert.equal(queue.readyCount, 1);
assert.equal(queue.blockedCount, 2);
assert.equal(queue.ready[0].title, 'Ready title');
assert.equal(queue.ready[0].sourceCommit, 'abc123');
assert.deepEqual(queue.blocked.find((item) => item.relativePath.endsWith('blocked.json')).reasons, ['article_not_publishable']);
assert.deepEqual(queue.blocked.find((item) => item.relativePath.endsWith('invalid.json')).reasons, ['invalid_json']);

const missing = buildQueue(path.join(root, 'missing'));
assert.equal(missing.total, 0);
assert.equal(missing.readyCount, 0);

console.log('note ready queue tests passed');
