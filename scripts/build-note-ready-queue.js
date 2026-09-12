'use strict';

const fs = require('node:fs');
const path = require('node:path');

function listJsonFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listJsonFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(absolute);
  }
  return out.sort();
}

function inspectBundle(file, root) {
  const relativePath = path.relative(process.cwd(), file).split(path.sep).join('/');
  try {
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
    const article = bundle && bundle.article;
    const reasons = [];
    if (!article || article.ok !== true) reasons.push('article_not_ok');
    if (!article || article.publishable !== true) reasons.push('article_not_publishable');
    if (!article || typeof article.title !== 'string' || !article.title.trim()) reasons.push('title_missing');
    if (!article || typeof article.fullText !== 'string' || !article.fullText.trim()) reasons.push('body_missing');
    return {
      relativePath,
      ready: reasons.length === 0,
      reasons,
      capturedAt: typeof bundle.capturedAt === 'string' ? bundle.capturedAt : null,
      sourceCommit: typeof bundle.sourceCommit === 'string' ? bundle.sourceCommit : null,
      title: article && typeof article.title === 'string' ? article.title.trim() : null
    };
  } catch (error) {
    return {
      relativePath,
      ready: false,
      reasons: ['invalid_json'],
      capturedAt: null,
      sourceCommit: null,
      title: null
    };
  }
}

function buildQueue(root = 'data/note-drafts') {
  const absoluteRoot = path.resolve(root);
  const inspected = listJsonFiles(absoluteRoot).map((file) => inspectBundle(file, absoluteRoot));
  const ready = inspected.filter((item) => item.ready).sort((a, b) => {
    const byTime = String(a.capturedAt || '').localeCompare(String(b.capturedAt || ''));
    return byTime || a.relativePath.localeCompare(b.relativePath);
  });
  const blocked = inspected.filter((item) => !item.ready);
  return {
    version: 'note-ready-queue-v1',
    root: path.relative(process.cwd(), absoluteRoot).split(path.sep).join('/'),
    total: inspected.length,
    readyCount: ready.length,
    blockedCount: blocked.length,
    ready,
    blocked
  };
}

if (require.main === module) {
  const root = process.argv[2] || 'data/note-drafts';
  process.stdout.write(`${JSON.stringify(buildQueue(root), null, 2)}\n`);
}

module.exports = { listJsonFiles, inspectBundle, buildQueue };
