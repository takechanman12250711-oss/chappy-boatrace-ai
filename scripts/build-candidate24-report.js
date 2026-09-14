'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createDisplayCandidates } = require('../js/note-generator');
const valid = t => /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const tickets = rows => [...new Set((rows || []).map(r => typeof r === 'string' ? r : r.ticket))];
const metric = () => ({ races: 0, hits: 0, tickets: 0, stake: 0, returned: 0, hitRate: null, recoveryRate: null });
function buildReport(records, results) {
  const selected = new Map();
  for (const row of records) {
    const time = Date.parse(row.selectedAt), deadline = Date.parse(row.deadlineAt);
    if (!Number.isFinite(time) || !Number.isFinite(deadline) || time >= deadline ||
        row.prediction?.officialResultUsedForPrediction === true) continue;
    const p = row.prediction || {};
    // Never infer a missing candidate pool from the result or the practical set.
    const candidates = p.candidate24Tickets || (p.confidence != null && p.manshuPower != null && p.mainSheet && p.manshuSheet
      ? createDisplayCandidates(p, p.practicalTickets) : null);
    if (!candidates) continue;
    const pool = tickets(candidates), practical = tickets(p.practicalTickets);
    if (!pool.length || pool.length > 24 || !pool.every(valid) || !practical.length || !practical.every(valid)) continue;
    const previous = selected.get(row.raceKey);
    if (!previous || time > previous.time) selected.set(row.raceKey, { row, time, pool, practical });
  }
  const resultMap = new Map(results.filter(r => r.source === 'boatrace-official')
    .map(r => [`${r.date}-${String(r.jcd).padStart(2, '0')}-${r.raceNo}`, r]));
  const report = { version: 'candidate24-report-v1', generatedAt: new Date().toISOString(), unitYen: 100,
    basis: '保存済み締切前予想・各買い目100円均等購入。実購入成績ではありません。',
    candidate24: metric(), practical: metric(), pending: 0, excludedRefundOrVoid: 0,
    unknownPayout: 0, from: null, to: null };
  for (const { row, pool, practical } of selected.values()) {
    const r = resultMap.get(row.raceKey);
    if (!r) { report.pending++; continue; }
    if (r.void || r.status === 'void' || r.refund || r.refunded || r.refunds?.length ||
        r.starts?.some(s => s.falseStart || s.lateStart) || (r.finishers?.length && r.finishers.length !== 6)) {
      report.excludedRefundOrVoid++; continue;
    }
    if (!r.resultAvailable || !valid(r.trifecta?.combination)) { report.pending++; continue; }
    const payout = r.trifecta.payout;
    if (!Number.isFinite(payout) || payout <= 0) { report.unknownPayout++; continue; }
    for (const [name, list] of [['candidate24', pool], ['practical', practical]]) {
      const m = report[name], hit = list.includes(r.trifecta.combination);
      m.races++; m.hits += Number(hit); m.tickets += list.length;
      m.stake += list.length * 100; m.returned += hit ? payout : 0;
    }
    report.from = !report.from || row.date < report.from ? row.date : report.from;
    report.to = !report.to || row.date > report.to ? row.date : report.to;
  }
  for (const m of [report.candidate24, report.practical]) {
    m.hitRate = m.races ? 100 * m.hits / m.races : null;
    m.recoveryRate = m.stake ? 100 * m.returned / m.stake : null;
  }
  return report;
}
function main(root = process.cwd()) {
  const records = [], results = [];
  function retain(row) {
    const p = row?.prediction;
    if (!p) return;
    const source = p.candidate24Tickets || (p.confidence != null && p.manshuPower != null && p.mainSheet && p.manshuSheet
      ? createDisplayCandidates(p, p.practicalTickets) : null);
    if (!source) return;
    records.push({ raceKey: row.raceKey, date: row.date, selectedAt: row.selectedAt, deadlineAt: row.deadlineAt,
      prediction: { candidate24Tickets: tickets(source), practicalTickets: tickets(p.practicalTickets),
        officialResultUsedForPrediction: p.officialResultUsedForPrediction } });
  }
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const files = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{8}\.json$/.test(f)) : [];
  for (const file of files(path.join(root, 'data/predictions'))) {
    const data = read(path.join(root, 'data/predictions', file));
    for (const row of data.predictions || []) retain(row);
    for (const row of data.verificationPredictions || []) retain(row);
  }
  const drafts = path.join(root, 'data/note-drafts');
  for (const date of fs.existsSync(drafts) ? fs.readdirSync(drafts).filter(d => /^\d{8}$/.test(d)) : []) {
    for (const file of fs.readdirSync(path.join(drafts, date)).filter(f => f.endsWith('.json'))) {
      const bundle = read(path.join(drafts, date, file));
      if (bundle.record?.prediction?.candidate24Tickets) retain(bundle.record);
    }
  }
  for (const file of files(path.join(root, 'data/results'))) {
    for (const r of read(path.join(root, 'data/results', file)).races || []) {
      results.push({ date: r.date, jcd: r.jcd, raceNo: r.raceNo, source: r.source, resultAvailable: r.resultAvailable,
        trifecta: r.trifecta, void: r.void, status: r.status,
        refund: Boolean(r.refund || r.refunded || r.refunds?.length || r.starts?.some(s => s.falseStart || s.lateStart) ||
          (r.finishers?.length && r.finishers.length !== 6)) });
    }
  }
  const report = buildReport(records, results);
  const output = path.join(root, 'data/stats/candidate24-report.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  return report;
}
if (require.main === module) main();
module.exports = { buildReport, main };
