'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compactArticle } = require('../js/note-generator');
const { auditNotePublication } = require('./note-publication-audit');
const { VERSION: MONITOR_VERSION, independentArticle } = require('./note-independent-monitor-source');
const { seriesOfBundle, publicationKey, seriesTitle } = require('./note-article-series');
const { NOTE_PRICE_YEN } = require('./note-pricing');
const { sectionProof } = require('./note-published-ticket-sections');
const MAX_PUBLICATION_TICKETS = 7;

function requirePublicationTicketCount(article) {
  const tickets = article?.practicalTickets;
  if (!Array.isArray(tickets) || tickets.length < 1) throw new Error('publication_ticket_count_invalid');
  if (tickets.length > MAX_PUBLICATION_TICKETS) throw new Error('publication_ticket_count_exceeds_7');
  return tickets.length;
}

function sourceArticle(sourcePath, rootDir = process.cwd(), now = Date.now(), { presentationVersion = 'readable-v3' } = {}) {
  if (!['readable-v1', 'readable-v2', 'readable-v3'].includes(presentationVersion)) throw Error('published_presentation_version_unsupported');
  const match = /^data\/note-drafts\/(\d{8})\/\1-(\d{2})-(\d{1,2})-([a-f0-9]{64})\.json$/.exec(String(sourcePath));
  if (!match) throw new Error('publication_source_path_invalid');
  const bytes = fs.readFileSync(path.join(rootDir, sourcePath), 'utf8');
  if (createHash('sha256').update(bytes).digest('hex') !== match[4]) throw new Error('publication_source_hash_mismatch');
  const bundle = JSON.parse(bytes);
  const raceKey = `${match[1]}-${match[2]}-${match[3]}`;
  const independent = bundle.version === MONITOR_VERSION;
  if ((!independent && bundle.version !== 'note-draft-bundle-v1') || bundle.record?.raceKey !== raceKey) {
    throw new Error('publication_source_identity_mismatch');
  }
  require('./note-exhibition').requireExhibition(bundle.record);
  // A monitoring original is already the final article. It must never pass
  // through the normal AI article generator or its presentation compactor.
  const baseArticle = independent ? independentArticle(bundle) : compactArticle(bundle.article, bundle.record.prediction);
  const { navigation, loadConfig } = require('./note-marketing-content');
  const articleSeries = seriesOfBundle(bundle);
  if (independent && (Date.parse(bundle.capturedAt) > now || Date.parse(bundle.record.selectedAt) > now)) {
    throw new Error('independent_monitor_future_confirmation');
  }
  const article = seriesTitle(independent ? baseArticle : navigation(baseArticle, loadConfig(rootDir)), articleSeries);
  const audit = auditNotePublication({ ...bundle, article, now: new Date(now).toISOString() });
  if (!audit.contentReady) {
    const error = new Error('publication_content_audit_blocked');
    error.issueCodes = [...new Set(audit.issues.map(issue => issue.code))];
    throw error;
  }
  // Preserve the established 1–7 publication gate and its diagnostic before
  // v3's separate model-subset renderer can reject an oversized source.
  requirePublicationTicketCount(article);
  // Audit the immutable original first, then verify the approved public copy.
  // Explicit versions are used only by the proof-gated historical recovery
  // path. New publication gates always reconstruct the v3 default. Historical
  // v1 needs its original free introduction as well as the frozen paid body.
  const renderer = presentationVersion === 'readable-v1' ? require('./note-recovery-readable-v1.cjs')
    : presentationVersion === 'readable-v2' ? require('./note-recovery-readable-v2.cjs') : require('./note-readable-article');
  const readable = renderer.readableArticle(article, bundle);
  if (readable.presentationVersion === 'readable-v2') {
    // A new receipt must be reproducible from the immutable original itself,
    // rather than only from today's compactArticle preprocessing. Unknown old
    // source formats cannot receive a v2 proof that result readers cannot verify.
    const categories = require('./note-category-article');
    const sourcePaidText = categories.paidTextFromSections(categories.sourceSections(bundle, articleSeries));
    if (readable.paidText !== sourcePaidText) throw new Error('publication_category_source_mismatch');
  }
  if (readable.presentationVersion === 'readable-v3') {
    // Bind the compact-derived publication to the exact immutable original,
    // including the unchanged practical subset and its separate appendix.
    const sourcePaidText = require('./note-korogashi-presentation.cjs').paidTextFromSource(bundle, articleSeries);
    if (readable.paidText !== sourcePaidText) throw new Error('publication_model_source_mismatch');
  }
  return { bundle, article: readable, articleSeries, sha256: match[4] };
}

function publicationPayload(sourcePath, rootDir = process.cwd(), now = Date.now(), options) {
  const { bundle, article, articleSeries, sha256 } = sourceArticle(sourcePath, rootDir, now, options);
  const practicalTicketCount = requirePublicationTicketCount(article);
  const paidText = article.paidText.trim();
  const presentationVersion = article.presentationVersion;
  if (typeof presentationVersion !== 'string' || !presentationVersion) {
    throw new Error('publication_presentation_version_missing');
  }
  // Bind the actual audited public copy, not an internal candidate pool. Keep
  // this handoff field primitive so source revalidation checks exact bytes.
  const publishedDisplayProofJson = JSON.stringify(sectionProof(paidText, presentationVersion, { sourceSha256: sha256 }));
  return {
    version: 'note-publication-handoff-v1', sourcePath, sourceSha256: sha256,
    raceKey: bundle.record.raceKey,
    articleSeries, publicationKey: publicationKey(bundle.record.raceKey, articleSeries),
    raceDate: `${bundle.record.date.slice(0, 4)}-${bundle.record.date.slice(4, 6)}-${bundle.record.date.slice(6, 8)}`,
    title: article.title, freeText: article.freeText.trim(), paidText,
    presentationVersion, publishedDisplayProofJson,
    body: article.fullText, price: NOTE_PRICE_YEN, deadlineAt: bundle.record.deadlineAt,
    practicalTicketCount,
    canPublish: true, blockReason: null
  };
}

function parsePublishedDisplayProof(payload) {
  // New receipts must carry their own verified display proof. An absent proof
  // is never filled in from today's renderer for an older publication.
  if (typeof payload?.publishedDisplayProofJson !== 'string' || !payload.publishedDisplayProofJson ||
      typeof payload.presentationVersion !== 'string' || !payload.presentationVersion) {
    throw new Error('publication_display_proof_missing');
  }
  let proof;
  try { proof = JSON.parse(payload.publishedDisplayProofJson); }
  catch { throw new Error('publication_display_proof_invalid'); }
  const expected = sectionProof(payload.paidText, payload.presentationVersion, { sourceSha256: payload.sourceSha256 });
  // Comparing the canonical serialization also rejects extra data, including
  // accidentally attached paid bodies or ticket arrays in public receipts.
  if (payload.publishedDisplayProofJson !== JSON.stringify(expected)) {
    throw new Error('publication_display_proof_mismatch');
  }
  return proof;
}

function verifyPublicationSource(payload, rootDir = process.cwd(), now = Date.now(), options) {
  const expected = publicationPayload(payload?.sourcePath, rootDir, now, options);
  for (const key of Object.keys(expected)) {
    if (payload[key] !== expected[key]) throw new Error(`publication_handoff_mismatch_${key}`);
  }
  return expected;
}

module.exports = { MAX_PUBLICATION_TICKETS, requirePublicationTicketCount, sourceArticle, publicationPayload, parsePublishedDisplayProof, verifyPublicationSource };
