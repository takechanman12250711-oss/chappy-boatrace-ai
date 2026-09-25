'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compactArticle } = require('../js/note-generator');
const { auditNotePublication } = require('./note-publication-audit');
const MAX_PUBLICATION_TICKETS = 7;

function requirePublicationTicketCount(article) {
  const tickets = article?.practicalTickets;
  if (!Array.isArray(tickets) || tickets.length < 1) throw new Error('publication_ticket_count_invalid');
  if (tickets.length > MAX_PUBLICATION_TICKETS) throw new Error('publication_ticket_count_exceeds_7');
  return tickets.length;
}

function sourceArticle(sourcePath, rootDir = process.cwd(), now = Date.now()) {
  const match = /^data\/note-drafts\/(\d{8})\/\1-(\d{2})-(\d{1,2})-([a-f0-9]{64})\.json$/.exec(String(sourcePath));
  if (!match) throw new Error('publication_source_path_invalid');
  const bytes = fs.readFileSync(path.join(rootDir, sourcePath), 'utf8');
  if (createHash('sha256').update(bytes).digest('hex') !== match[4]) throw new Error('publication_source_hash_mismatch');
  const bundle = JSON.parse(bytes);
  const raceKey = `${match[1]}-${match[2]}-${match[3]}`;
  if (bundle.version !== 'note-draft-bundle-v1' || bundle.record?.raceKey !== raceKey) throw new Error('publication_source_identity_mismatch');
  require('./note-exhibition').requireExhibition(bundle.record);
  const article = compactArticle(bundle.article, bundle.record.prediction);
  const audit = auditNotePublication({ ...bundle, article, now: new Date(now).toISOString() });
  if (!audit.contentReady) {
    const error = new Error('publication_content_audit_blocked');
    error.issueCodes = [...new Set(audit.issues.map(issue => issue.code))];
    throw error;
  }
  return { bundle, article, sha256: match[4] };
}

function publicationPayload(sourcePath, rootDir = process.cwd(), now = Date.now()) {
  const { bundle, article, sha256 } = sourceArticle(sourcePath, rootDir, now);
  const practicalTicketCount = requirePublicationTicketCount(article);
  return {
    version: 'note-publication-handoff-v1', sourcePath, sourceSha256: sha256,
    raceKey: bundle.record.raceKey,
    raceDate: `${bundle.record.date.slice(0, 4)}-${bundle.record.date.slice(4, 6)}-${bundle.record.date.slice(6, 8)}`,
    title: article.title, freeText: article.freeText.trim(), paidText: article.paidText.trim(),
    body: article.fullText, price: 300, deadlineAt: bundle.record.deadlineAt,
    practicalTicketCount,
    canPublish: true, blockReason: null
  };
}

function verifyPublicationSource(payload, rootDir = process.cwd(), now = Date.now()) {
  const expected = publicationPayload(payload?.sourcePath, rootDir, now);
  for (const key of Object.keys(expected)) {
    if (payload[key] !== expected[key]) throw new Error(`publication_handoff_mismatch_${key}`);
  }
  return expected;
}

module.exports = { MAX_PUBLICATION_TICKETS, requirePublicationTicketCount, sourceArticle, publicationPayload, verifyPublicationSource };


