'use strict';

const fs = require('fs');
const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadDraftBundle(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const bundle = JSON.parse(raw);
  if (bundle.version !== 'note-draft-bundle-v1') throw new Error('unsupported_bundle_version');
  if (!bundle.article || bundle.article.ok !== true) throw new Error('article_not_ready');
  const { title, freeText, paidText } = bundle.article;
  if (![title, freeText, paidText].every((v) => typeof v === 'string' && v.length > 0)) {
    throw new Error('article_text_missing');
  }
  return { raw, bundle, title, freeText, paidText };
}

function buildDraftPayload(path) {
  const loaded = loadDraftBundle(path);
  return {
    schema: 'note-draft-adapter-v1',
    mode: 'draft_only',
    sourcePath: path,
    sourceSha256: sha256(loaded.raw),
    title: loaded.title,
    freeText: loaded.freeText,
    paidText: loaded.paidText,
    safeguards: {
      publishAllowed: false,
      priceChangeAllowed: false,
      reservationAllowed: false,
      credentialStorageAllowed: false,
      requireDuplicateCheck: true,
      requireSourceShaMatch: true
    }
  };
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/note-draft-adapter.js <draft-bundle.json>');
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(buildDraftPayload(path), null, 2) + '\n');
  } catch (error) {
    console.error(`note-draft-adapter: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildDraftPayload, loadDraftBundle, sha256 };
