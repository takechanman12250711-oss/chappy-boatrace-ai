'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { requireExhibition } = require('./note-exhibition');
const { buildReport: performanceReport } = require('./build-candidate24-report');
const { methodFingerprint } = require('./race-review-evidence');
const valid = t => /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const tickets = rows => Array.isArray(rows) ? [...new Set(rows.map(r => typeof r === 'string' ? r : r?.ticket))] : [];
function classify(pool, practical, actual) {
  if (pool.includes(actual)) return practical.includes(actual) ? 'both-hit' : 'candidate-only-hit';
  if (practical.includes(actual)) return 'practical-only-hit';
  if (!pool.some(t => t[0] === actual[0])) return 'candidate-head-missing';
  if (!pool.some(t => t.slice(0, 3) === actual.slice(0, 3))) return 'candidate-first-second-pair-missing';
  return 'candidate-third-missing';
}
function selectionReasons(prediction) {
  const selection = prediction.practicalSelection || {}, reasons = {};
  for (const d of [...(selection.candidateDecisions || []),
    ...(selection.targetDecisions || []).flatMap(t => t.candidateDecisions || [])]) {
    const ticket = d.ticket || d.combination;
    if (!valid(ticket)) continue;
    reasons[ticket] ||= [];
    for (const reason of [d.reasonCode, ...(d.reasonCodes || [])]) {
      if (typeof reason === 'string' && reason && !reasons[ticket].includes(reason)) reasons[ticket].push(reason);
    }
  }
  return reasons;
}
function selectionEvidence(record, practical) {
  const e = record.practicalSelectionEvidence;
  if (!e) return null; // Preserve the exact legacy report shape.
  const rejected = reason => ({ status: 'rejected', reason });
  if (e.version !== 'practical-selection-evidence-v1' || e.status !== 'captured' ||
      e.productionChanged !== false || e.resultUsedForGeneration !== false) return rejected('unsupported-evidence');
  if (e.raceKey !== record.raceKey || e.selectedAt !== record.selectedAt || e.deadlineAt !== record.deadlineAt)
    return rejected('identity-mismatch');
  const review = e.reviewEvidence, original = record.reviewEvidence;
  if (!review || !original || review.version !== 'race-review-evidence-v1' ||
      review.predictionMode !== 'server_pre_deadline' || review.officialResultUsedForPrediction !== false ||
      !/^[a-f0-9]{64}$/.test(review.method || '') ||
      ['version', 'method', 'predictionMode', 'officialResultUsedForPrediction'].some(k => review[k] !== original[k]))
    return rejected('method-mismatch');
  if (!Array.isArray(e.practicalTickets) || e.practicalTickets.length !== practical.length ||
      new Set(e.practicalTickets).size !== practical.length ||
      !e.practicalTickets.every(t => typeof t === 'string' && valid(t) && practical.includes(t)))
    return rejected('baseline-mismatch');
  if (!Array.isArray(e.candidateDecisions) || !Array.isArray(e.excludedCandidates) ||
      !Array.isArray(e.targetDecisions) || e.targetDecisions.some(t => !t || !Array.isArray(t.candidateDecisions)))
    return rejected('invalid-history');
  // These are stage observations, including duplicates and all-permutation rows.
  // Never treat their selected flags as the final ticket set or exclusion causes.
  return { status: 'validated', finalPracticalTickets: [...practical],
    ...(typeof e.selectionReason === 'string' ? { selectionReason: e.selectionReason } : {}),
    stageHistory: JSON.parse(JSON.stringify({ candidateDecisions: e.candidateDecisions,
      excludedCandidates: e.excludedCandidates, targetDecisions: e.targetDecisions })) };
}
function actualSelectionDiagnostic(evidence, actual, pool) {
  if (evidence.status !== 'validated') return evidence;
  const { stageHistory, ...summary } = evidence;
  const matches = (rows, source) => rows.flatMap((decision, index) =>
    (decision?.ticket || decision?.combination) === actual ? [{ source: `${source}[${index}]`, decision }] : []);
  // Full raw history stays in the immutable bundle. Keep only the result ticket's
  // stage observations here so the frontend report does not grow by 120 rows/race.
  const actualDecisionHistory = [
    ...matches(stageHistory.candidateDecisions, 'candidateDecisions'),
    ...matches(stageHistory.excludedCandidates, 'excludedCandidates'),
    ...stageHistory.targetDecisions.flatMap((target, index) =>
      matches(target.candidateDecisions, `targetDecisions[${index}].candidateDecisions`).map(row => ({
        ...row, target: Object.fromEntries(['evaluationId', 'boatNo', 'reasonCode'].filter(k => target[k] !== undefined).map(k => [k, target[k]]))
      })))
  ];
  return { ...summary, actualFinalDisposition: summary.finalPracticalTickets.includes(actual) ? 'selected' : 'not-selected',
    actualInCandidatePool: pool.includes(actual), actualDecisionHistory };
}
function summarizeLosses(rows) {
  const counts = Object.fromEntries(['both-hit', 'candidate-only-hit', 'practical-only-hit',
    'candidate-head-missing', 'candidate-first-second-pair-missing', 'candidate-third-missing'].map(k => [k, 0]));
  const recordedDecisionReasons = {};
  let candidateOnlyReturn = 0, practicalOnlyReturn = 0;
  for (const row of rows) {
    counts[row.classification]++;
    if (row.classification === 'candidate-only-hit') {
      candidateOnlyReturn += row.payoutPer100;
      for (const reason of row.recordedDecisionReasons.length ? row.recordedDecisionReasons : ['reason-not-recorded']) {
        recordedDecisionReasons[reason] = (recordedDecisionReasons[reason] || 0) + 1;
      }
    }
    if (row.classification === 'practical-only-hit') practicalOnlyReturn += row.payoutPer100;
  }
  return { races: rows.length, counts, nonSubsetRaces: rows.filter(r => r.practicalOutsideCandidate.length).length,
    candidateOnlyReturn, practicalOnlyReturn,
    netHitDifference: counts['candidate-only-hit'] - counts['practical-only-hit'], recordedDecisionReasons, rows };
}
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
      selectionReasons: selectionReasons(p),
      practicalSelectionEvidence: selectionEvidence(r, practical),
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
    const diagnostics = [];
    const report = performanceReport(rows, results, ({ row, pool, practical, result }) => {
      const actual = result.trifecta.combination;
      diagnostics.push({ raceKey: row.raceKey, selectedAt: row.selectedAt, actual,
        payoutPer100: result.trifecta.payout, classification: classify(pool, practical, actual),
        candidateTicketCount: pool.length, practicalTicketCount: practical.length,
        practicalOutsideCandidate: practical.filter(t => !pool.includes(t)),
        recordedDecisionReasons: row.selectionReasons[actual] || [],
        ...(row.practicalSelectionEvidence ? { practicalSelectionEvidence:
          actualSelectionDiagnostic(row.practicalSelectionEvidence, actual, pool) } : {}) });
    });
    diagnostics.sort((a, b) => a.selectedAt.localeCompare(b.selectedAt) || a.raceKey.localeCompare(b.raceKey));
    const count = report.practical.races;
    return { method, legacy: method.startsWith('legacy:'), active: method === `method:${activeMethod}`,
      latestPredictionAt: rows.map(r => r.selectedAt).sort().at(-1), captured: rows.length,
      settled: count, pending: report.pending, excludedRefundOrVoid: report.excludedRefundOrVoid,
      unknownPayout: report.unknownPayout, completedWindows: Math.floor(count / 100),
      currentWindowCount: count % 100, nextReviewAt: (Math.floor(count / 100) + 1) * 100,
      from: report.from, to: report.to, practical: report.practical, candidate24: report.candidate24,
      selectionLoss: summarizeLosses(diagnostics) };
  }).sort((a, b) => b.latestPredictionAt.localeCompare(a.latestPredictionAt) || a.method.localeCompare(b.method));
  return { version: 'race-review-progress-v1', generatedAt, reviewSize: 100, unitYen: 100,
    predictionLogicChanged: false, autoApply: false, approvalRequired: true,
    selectionLossContract: { version: 'race-review-selection-loss-v1', diagnosticOnly: true,
      basis: 'Same settled cohort as race-review-progress; stored candidate tickets only.',
      limitation: 'Missing tickets and saved decision reasons describe observations, not proven causes. Net hit difference is not gross selection omissions.' },
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
module.exports = { assess, buildProgress, classify, summarizeLosses, main };
