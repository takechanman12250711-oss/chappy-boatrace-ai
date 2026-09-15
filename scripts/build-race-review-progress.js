'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { requireExhibition } = require('./note-exhibition');
const { buildReport: performanceReport } = require('./build-candidate24-report');
const { methodFingerprint } = require('./race-review-evidence');
const valid = t => /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const tickets = rows => Array.isArray(rows) ? [...new Set(rows.map(r => typeof r === 'string' ? r : r?.ticket))] : [];
function assess(bundle) {
  const r = bundle?.record, p = r?.prediction;
  if (!r || !p || r.raceKey !== `${r.date}-${r.jcd}-${r.raceNo}` || !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(r.raceKey)) return { reason: 'invalidIdentity' };
  if (bundle.version !== 'note-draft-bundle-v1' || r.publicationPolicy !== 'all-races-v1') return { reason: 'unsupportedSource' };
  const saved = Date.parse(r.selectedAt), deadline = Date.parse(r.deadlineAt);
  if (!Number.isFinite(saved) || !Number.isFinite(deadline) || saved >= deadline) return { reason: 'preDeadlineUnconfirmed' };
  try { requireExhibition(r); } catch { return { reason: 'exhibitionUnconfirmed' }; }
  if (bundle.generationAudit?.contentReady !== true || bundle.generationAudit?.raceKey !== r.raceKey ||
      !Number.isFinite(Date.parse(bundle.generationAudit?.auditedAt)) || Date.parse(bundle.generationAudit.auditedAt) >= deadline) return { reason: 'auditUnconfirmed' };
  const evidence = r.reviewEvidence;
  if (p.officialResultUsedForPrediction === true || evidence?.officialResultUsedForPrediction === true ||
      (evidence && (evidence.version !== 'race-review-evidence-v1' || evidence.predictionMode !== 'server_pre_deadline'))) return { reason: 'notPreRacePrediction' };
  // Legacy bundles have no method hash. Keep their recorded commit cohorts separate;
  // never assign today's prediction method to a past forecast.
  const method = evidence?.method;
  if (evidence && !/^[a-f0-9]{64}$/.test(method || '')) return { reason: 'missingMethod' };
  if (!method && !/^[a-f0-9]{40}$/.test(bundle.sourceCommit || '')) return { reason: 'missingMethod' };
  const practical = tickets(p.practicalTickets), pool = tickets(p.candidate24Tickets);
  const baseline = tickets(bundle.baselinePracticalTickets);
  if (!practical.length || practical.length > 10 || !pool.length || pool.length > 24 ||
      ![...practical, ...pool].every(valid) || baseline.length !== practical.length ||
      practical.some(t => !baseline.includes(t))) return { reason: 'invalidTickets' };
  return { method: method ? `method:${method}` : `legacy:${bundle.sourceCommit}`, saved,
    row: { raceKey: r.raceKey, date: r.date, selectedAt: r.selectedAt, deadlineAt: r.deadlineAt,
      prediction: { practicalTickets: practical, candidate24Tickets: pool, officialResultUsedForPrediction: false } } };
}
function buildProgress(bundles, results, { generatedAt = new Date().toISOString(), activeMethod = '' } = {}) {
  const excluded = {}, selected = new Map();
  for (const bundle of bundles) {
    const item = assess(bundle);
    if (item.reason) { excluded[item.reason] = (excluded[item.reason] || 0) + 1; continue; }
    // A race is counted once, using its latest valid pre-deadline snapshot.
    const previous = selected.get(item.row.raceKey);
    if (!previous || item.saved > previous.saved || (item.saved === previous.saved && item.method < previous.method)) selected.set(item.row.raceKey, item);
  }
  const groups = new Map();
  for (const item of selected.values()) {
    if (!groups.has(item.method)) groups.set(item.method, []);
    groups.get(item.method).push(item.row);
  }
  const cohorts = [...groups].map(([method, rows]) => {
    const report = performanceReport(rows, results);
    const count = report.practical.races;
    return { method, legacy: method.startsWith('legacy:'), active: method === `method:${activeMethod}`,
      latestPredictionAt: rows.map(r => r.selectedAt).sort().at(-1), captured: rows.length,
      settled: count, pending: report.pending, excludedRefundOrVoid: report.excludedRefundOrVoid,
      unknownPayout: report.unknownPayout, completedWindows: Math.floor(count / 100),
      currentWindowCount: count % 100, nextReviewAt: (Math.floor(count / 100) + 1) * 100,
      from: report.from, to: report.to, practical: report.practical, candidate24: report.candidate24 };
  }).sort((a, b) => b.latestPredictionAt.localeCompare(a.latestPredictionAt) || a.method.localeCompare(b.method));
  return { version: 'race-review-progress-v1', generatedAt, reviewSize: 100, unitYen: 100,
    predictionLogicChanged: false, autoApply: false, approvalRequired: true,
    captured: selected.size, settled: cohorts.reduce((sum, g) => sum + g.settled, 0),
    pending: cohorts.reduce((sum, g) => sum + g.pending, 0), excluded, cohorts };
}
function main(root = process.cwd()) {
  const bundles = [], results = [];
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const draftDir = path.join(root, 'data/note-drafts');
  for (const date of fs.existsSync(draftDir) ? fs.readdirSync(draftDir).filter(d => /^\d{8}$/.test(d)).sort() : []) {
    for (const file of fs.readdirSync(path.join(draftDir, date)).filter(f => f.endsWith('.json')).sort()) {
      const b = read(path.join(draftDir, date, file));
      // Discard article bodies after loading; the immutable source remains on disk.
      bundles.push({ version: b.version, sourceCommit: b.sourceCommit, record: b.record,
        generationAudit: b.generationAudit, baselinePracticalTickets: b.baselinePracticalTickets });
    }
  }
  const dates = new Set(bundles.filter(b => !assess(b).reason).map(b => b.record.date));
  const resultDir = path.join(root, 'data/results');
  for (const file of fs.existsSync(resultDir) ? fs.readdirSync(resultDir).filter(f => /^\d{8}\.json$/.test(f) && dates.has(f.slice(0, 8))).sort() : []) {
    for (const r of read(path.join(resultDir, file)).races || []) results.push({ date: r.date, jcd: r.jcd, raceNo: r.raceNo,
      source: r.source, resultAvailable: r.resultAvailable, trifecta: r.trifecta, status: r.status, void: r.void,
      refund: Boolean(r.refund || r.refunded || r.refunds?.length || r.starts?.some(s => s.falseStart || s.lateStart) ||
        (r.finishers?.length && r.finishers.length !== 6)) });
  }
  const ledgerFile = path.join(root, 'data/stats/race-review-results.json');
  if (fs.existsSync(ledgerFile)) {
    const ledger = read(ledgerFile);
    for (const result of Object.values(ledger.races || {})) {
      const existing = results.find(r => r.date === result.date && r.jcd === result.jcd && r.raceNo === result.raceNo);
      if (!existing?.resultAvailable) results.push(result);
    }
  }
  const report = buildProgress(bundles, results, { activeMethod: methodFingerprint() });
  report.resultFetchRetries = fs.existsSync(ledgerFile) ? Object.values(read(ledgerFile).attempts || {}).filter(a => a.status === 'retry').length : 0;
  const output = path.join(root, 'data/stats/race-review-progress.json');
  if (fs.existsSync(output)) {
    const old = read(output);
    if (JSON.stringify({ ...old, generatedAt: null }) === JSON.stringify({ ...report, generatedAt: null })) report.generatedAt = old.generatedAt;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(report) + '\n'); fs.renameSync(temp, output);
  console.log(JSON.stringify({ captured: report.captured, settled: report.settled, pending: report.pending, cohorts: report.cohorts.length, excluded: report.excluded }));
  return report;
}
if (require.main === module) main();
module.exports = { assess, buildProgress, main };
