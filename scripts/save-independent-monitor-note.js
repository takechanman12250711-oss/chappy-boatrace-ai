'use strict';
// Persist the completed original, with optional separate research evidence.
// The research selector never replaces the article or its purchase tickets.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { independentArticle } = require('./note-independent-monitor-source');
const { requireExhibition } = require('./note-exhibition');
const { auditNotePublication } = require('./note-publication-audit');
const { publicationKey, seriesOfBundle } = require('./note-article-series');

function saveIndependentMonitorNote(bundle, { rootDir = process.cwd(), now = Date.now() } = {}) {
  independentArticle(bundle);
  requireExhibition(bundle.record);
  require('./independent-monitor-decision.cjs').validateDecisionEvidence(bundle);
  const record = bundle.record;
  const date = new Date(now + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  const raceKey = `${record.date}-${String(record.jcd).padStart(2, '0')}-${Number(record.raceNo)}`;
  if (record.date !== date || record.raceKey !== raceKey || Date.parse(bundle.capturedAt) > now ||
      Date.parse(record.selectedAt) > now) throw new Error('independent_monitor_current_race_required');
  const articleSeries = seriesOfBundle(bundle), key = publicationKey(raceKey, articleSeries);
  const audit = auditNotePublication({ ...bundle, now: new Date(now).toISOString() });
  if (!audit.contentReady) {
    const error = new Error('independent_monitor_audit_blocked');
    error.issueCodes = [...new Set(audit.issues.map(issue => issue.code))];
    throw error;
  }
  const stored = require('./independent-rule-shadow.cjs').withShadow(bundle);
  const bytes = JSON.stringify(stored) + '\n';
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sourcePath = `data/note-drafts/${date}/${raceKey}-${sha256}.json`;
  const file = path.join(rootDir, sourcePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== bytes) throw new Error('independent_monitor_existing_source_mismatch');
    return { sourcePath, sha256, articleSeries, publicationKey: key, changed: false };
  }
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return { sourcePath, sha256, articleSeries, publicationKey: key, changed: true };
}
if (require.main === module) {
  try {
    const bundle = JSON.parse(fs.readFileSync(process.argv[2] || 0, 'utf8'));
    console.log(JSON.stringify(saveIndependentMonitorNote(bundle)));
  } catch (error) { console.error(JSON.stringify({ error: error.message, issueCodes: error.issueCodes })); process.exitCode = 1; }
}
module.exports = { saveIndependentMonitorNote };
