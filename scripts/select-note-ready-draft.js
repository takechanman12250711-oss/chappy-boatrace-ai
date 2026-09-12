'use strict';

const path = require('node:path');
const { buildQueue } = require('./build-note-ready-queue');

function selectReadyDraft(root = 'data/note-drafts', strategy = 'latest') {
  const queue = buildQueue(root);
  if (!queue.ready.length) throw new Error('note_ready_draft_missing');
  if (!['latest', 'earliest'].includes(strategy)) throw new Error('note_ready_strategy_invalid');

  const item = strategy === 'earliest'
    ? queue.ready[0]
    : queue.ready[queue.ready.length - 1];

  return {
    ...item,
    absolutePath: path.resolve(item.relativePath),
    strategy,
    readyCount: queue.readyCount,
    blockedCount: queue.blockedCount
  };
}

if (require.main === module) {
  const root = process.argv[2] || process.env.NOTE_DRAFT_ROOT || 'data/note-drafts';
  const strategy = process.argv[3] || process.env.NOTE_READY_STRATEGY || 'latest';
  const selected = selectReadyDraft(root, strategy);
  process.stdout.write(`${JSON.stringify(selected, null, 2)}\n`);
}

module.exports = { selectReadyDraft };
