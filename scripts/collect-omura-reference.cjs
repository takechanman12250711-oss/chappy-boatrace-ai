'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { VERSION, hash, urlFor, validateBundle, buildCapture, saveCapture } = require('./omura-reference.cjs');
const { actualTicket, isOfficialResultSource, raceKey } = require('./analysis-input-contract');
function checkedOutCommit(root = process.cwd()) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('execution_source_commit_invalid');
  return commit;
}
function sourceFiles(root, directory, date = null) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter(d => /^\d{8}$/.test(d) && (!date || d === date)).sort().flatMap(d =>
    fs.readdirSync(path.join(base,d)).filter(f => /^\d{8}-24-([1-9]|1[0-2])-[a-f0-9]{64}\.json$/.test(f))
      .sort().map(f => `${directory}/${d}/${f}`));
}
function loadCaptures(root) {
  const values = [], rejected = [];
  for (const file of sourceFiles(root, 'data/omura-reference')) {
    try {
      const bytes = fs.readFileSync(path.join(root,file)), v = JSON.parse(bytes);
      if (v.version !== VERSION || !file.endsWith(`${v.raceKey}-${hash(bytes)}.json`) ||
          v.productionChanged !== false || v.automaticProductionChange !== false || v.usableForPrediction !== false)
        throw new Error('reference_integrity_invalid');
      values.push({ ...v, referencePath: file });
    } catch (error) { rejected.push({ file, reason: error.message }); }
  }
  return { values, rejected };
}
function earliestCaptured(values) {
  const selected = new Map();
  for (const v of [...values].sort((a,b) => a.capturedAt.localeCompare(b.capturedAt) || a.referencePath.localeCompare(b.referencePath)))
    if (v.status === 'captured' && !selected.has(v.raceKey)) selected.set(v.raceKey, v);
  return selected;
}
function missCategory(tickets, actual) {
  if (tickets.includes(actual)) return 'hit';
  const [a,b] = actual.split('-');
  if (!tickets.some(t => t.startsWith(`${a}-`))) return 'head_missing';
  if (!tickets.some(t => t.startsWith(`${a}-${b}-`))) return 'second_missing';
  return 'third_missing';
}
function buildReport(root, collection, now = Date.now()) {
  const { values, rejected } = loadCaptures(root), pairs = [...earliestCaptured(values).values()];
  const results = new Map(), inputErrors = [];
  for (const date of new Set(pairs.map(p => p.date))) {
    const file = path.join(root,'data/results',`${date}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      for (const r of JSON.parse(fs.readFileSync(file)).races || []) {
        if (!isOfficialResultSource(r)) continue;
        const key = raceKey(r,date);
        if (key && key.startsWith(`${date}-24-`)) results.set(key, r);
      }
    } catch (error) { inputErrors.push({ date, reason: error.message }); }
  }
  const rows = pairs.map(p => {
    const r = results.get(p.raceKey), actual = actualTicket(r);
    const excluded = r?.void === true || r?.status === 'void' || r?.hasRefund === true || r?.refund === true ||
      (Array.isArray(r?.refundBoats) && r.refundBoats.length > 0) ||
      (Array.isArray(r?.starts) && r.starts.some(s => s.falseStart === true || s.lateStart === true));
    const settled = !excluded && r?.resultAvailable === true && Boolean(actual);
    return { raceKey: p.raceKey, referencePath: p.referencePath, sourceUrl: p.source.url,
      chappySourcePath: p.chappy.sourcePath, capturedAt: p.capturedAt, comparison: p.comparison,
      chappyMethod: p.chappy.method || 'unknown',
      reporterMainTickets: p.source.mainTickets, reporterAimTickets: p.source.aimTickets,
      chappyTickets: p.chappy.practicalTickets,
      status: excluded ? 'void_or_refund_excluded' : settled ? 'settled' : 'result_pending',
      ...(settled ? { actualTicket: actual,
        chappy: missCategory(p.chappy.practicalTickets, actual), reporterMain: missCategory(p.source.mainTickets, actual),
        reporterAimHit: p.source.aimTickets.length ? p.source.aimTickets.includes(actual) : null } : {}) };
  });
  const score = list => ({ races: list.length,
    chappyHits: list.filter(r => r.chappy === 'hit').length,
    reporterMainHits: list.filter(r => r.reporterMain === 'hit').length,
    chappyHitRate: list.length ? list.filter(r => r.chappy === 'hit').length / list.length : null,
    reporterMainHitRate: list.length ? list.filter(r => r.reporterMain === 'hit').length / list.length : null,
    misses: Object.fromEntries(['chappy','reporterMain'].map(side => [side, Object.fromEntries(
      ['head_missing','second_missing','third_missing'].map(reason => [reason,list.filter(r => r[side] === reason).length]))])) });
  const settled = rows.filter(r => r.status === 'settled');
  return { version: VERSION, generatedAt: new Date(now).toISOString(), productionChanged: false,
    automaticProductionChange: false, usableForPrediction: false, collection,
    inputIntegrity: { complete: rejected.length === 0 && inputErrors.length === 0, rejected, inputErrors },
    pairedRaces: rows.length, pending: rows.filter(r => r.status === 'result_pending').length,
    voidOrRefundExcluded: rows.filter(r => r.status === 'void_or_refund_excluded').length,
    descriptiveAll: score(settled),
    sameCountWithinFiveMinutes: score(settled.filter(r => r.comparison.equalMainTicketCount && r.comparison.withinFiveMinutes)),
    byChappyMethod: [...new Set(rows.map(r => r.chappyMethod))].sort().map(method => {
      const subset = settled.filter(r => r.chappyMethod === method);
      return { method, descriptive: score(subset),
        sameCountWithinFiveMinutes: score(subset.filter(r => r.comparison.equalMainTicketCount && r.comparison.withinFiveMinutes)) };
    }),
    limitations: ['One venue only; selected exhibition-ready saved normal predictions, not all site selections.',
      'First valid prospective capture only. Different ticket counts and capture gaps remain visible.',
      'Ticket match diagnostics, not purchase performance or evidence for automatic adoption.',
      'Aggregate across methods is descriptive only; use byChappyMethod for a generation comparison.',
      'Reporter aim tickets stay separate from the main comparison. No backfill.'], rows };
}
async function collect({ root = process.cwd(), now = Date.now, request = fetch, sourceCommit = null } = {}) {
  if (sourceCommit !== null && (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit)))
    throw new Error('execution_source_commit_invalid');
  const started = now(), date = new Date(started + 9*3600000).toISOString().slice(0,10).replace(/-/g,'');
  const existing = earliestCaptured(loadCaptures(root).values);
  const candidates = new Map(), skipped = {}, errors = [];
  const skip = reason => { skipped[reason] = (skipped[reason] || 0) + 1; };
  for (const file of sourceFiles(root,'data/note-drafts',date)) {
    try {
      const bytes = fs.readFileSync(path.join(root,file)), bundle = JSON.parse(bytes);
      const { r } = validateBundle(bundle,file,bytes,now());
      if (existing.has(r.raceKey)) { skip('already_captured'); continue; }
      const previous = candidates.get(r.raceKey);
      // Earliest eligible immutable Chappy source, not whichever later wins.
      if (!previous || r.selectedAt < previous.bundle.record.selectedAt) candidates.set(r.raceKey,{bundle,file,bytes});
    } catch (error) { skip(error.message); }
  }
  const saved = [];
  for (const entry of [...candidates.values()].sort((a,b) => Date.parse(a.bundle.record.deadlineAt)-Date.parse(b.bundle.record.deadlineAt))) {
    if (now() - started > 90000) { skip('collection_budget_exhausted'); continue; }
    const r = entry.bundle.record, startedAt = new Date(now()).toISOString();
    try {
      validateBundle(entry.bundle,entry.file,entry.bytes,now());
      const response = await request(urlFor(r.date,r.raceNo), { signal: AbortSignal.timeout(7000), redirect: 'error',
        headers: { 'User-Agent': 'ChappyResearch/1.0 (bounded public forecast comparison)', 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const responseBytes = Buffer.from(await response.arrayBuffer());
      if (responseBytes.length > 512000) throw new Error('response_too_large');
      const value = buildCapture({ ...entry, responseBytes, startedAt, capturedAt: new Date(now()).toISOString(), sourceCommit });
      const file = saveCapture(value,root);
      saved.push({ raceKey: r.raceKey, status: value.status, file: path.relative(root,file) });
    } catch (error) { errors.push({ raceKey: r.raceKey, reason: error.message }); }
  }
  return { date, sourceCommit, startedAt: new Date(started).toISOString(), completedAt: new Date(now()).toISOString(),
    eligible: candidates.size, saved, skipped, errors };
}
async function main() {
  // Resolve once before collection; workflow_run/rerun event SHAs are not the
  // version checked out by this workflow's explicit ref: main.
  const collection = await collect({ sourceCommit: checkedOutCommit(process.cwd()) });
  const report = buildReport(process.cwd(),collection);
  const output = path.join(process.env.RUNNER_TEMP || require('node:os').tmpdir(), 'omura-reference');
  fs.mkdirSync(output,{ recursive: true });
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const summary = { collection, pairedRaces: report.pairedRaces, pending: report.pending,
    integrityComplete: report.inputIntegrity.complete, sameCountWithinFiveMinutes: report.sameCountWithinFiveMinutes };
  console.log('OMURA_REFERENCE='+JSON.stringify(summary));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n### 大村・記者予想の参考比較\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n\n0件は比較待ち。精度改善・採用済みを意味しません。\n`);
  if (collection.errors.length || !report.inputIntegrity.complete) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { checkedOutCommit, sourceFiles, loadCaptures, earliestCaptured, missCategory, buildReport, collect };
