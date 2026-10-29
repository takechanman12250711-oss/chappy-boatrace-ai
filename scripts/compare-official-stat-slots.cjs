'use strict';
// Offline shadow comparison only. Never imported by the browser or the prediction collector.
//
// 2026-10-27 data check: two theories write their composite score back into the
// official stat fields before ai-core reads them:
//   - js/history-insights-base.js  syntheticLocalStats()  -> localWinRate / local2Rate / local3Rate
//   - js/motor-maintenance-insights.js encodeMotorScore() -> motorRate / motor2Rate / motor3Rate / boatRate
// Both scores already include the official numbers as one component. This report
// replays saved pre-deadline inputs through the current predictor twice:
//   current       : as production runs today (theory score in the stat fields)
//   officialStats : the same code, but the official numbers stay in the stat fields
// Nothing here changes production predictions, tickets, notes or posts.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const archive = require('./daily-prediction-source-archive');

const DEFINED_AT = '2026-10-27T13:40:00.000Z';
const CORE_VERSION = 'ai-core-v4.8.8-adjacent-start-rank';
const LOCAL_SPREAD = '          ...syntheticLocalStats(row.score),\n';
const MOTOR_SPREAD = '          ...row.encodedMotor,\n';

function officialStatsSource(name, source) {
  if (name === 'history-insights-base') {
    if (source.split(LOCAL_SPREAD).length !== 2) throw Error('local stat source contract changed');
    return source.replace(LOCAL_SPREAD, '');
  }
  if (name === 'motor-maintenance-insights') {
    if (source.split(MOTOR_SPREAD).length !== 2) throw Error('motor stat source contract changed');
    return source.replace(MOTOR_SPREAD, '');
  }
  return source;
}

// The shared runner reads js/<module>.js from the root it is given, so the
// candidate runs from a private copy with only the two spreads removed.
function candidateRoot(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'official-stat-slots-'));
  fs.mkdirSync(path.join(dir, 'js'));
  for (const name of frozen.MODULES) {
    const from = path.join(root, 'js', name + '.js');
    fs.writeFileSync(path.join(dir, 'js', name + '.js'), officialStatsSource(name, fs.readFileSync(from, 'utf8')));
  }
  return dir;
}

const OFFICIAL_FIELDS = ['localWinRate', 'local2Rate', 'local3Rate', 'motor2Rate', 'motor3Rate', 'boat2Rate', 'boat3Rate'];
// Saved entries already carry the theory scores in the stat fields, because the
// overwrite ran before saving. Each saved entry also keeps the official row text
// (rawBlock); re-read it with the production parser to restore the official numbers.
function withOfficialStats(row) {
  const { parseEntryBlock } = require('../api/_parser');
  const copy = JSON.parse(JSON.stringify(row));
  const entries = copy.conditions.escapeEvaluationEvidence.entries;
  for (const entry of entries) {
    const parsed = parseEntryBlock({ boat: Number(entry.boat), text: String(entry.rawBlock || '') });
    if (!parsed.rawFound || Number(parsed.boat) !== Number(entry.boat) || String(parsed.registerNo) !== String(entry.registerNo)) {
      throw Error('official-row-unavailable');
    }
    for (const field of OFFICIAL_FIELDS) entry[field] = parsed[field];
    // Drop the other aliases the theory wrote so nothing reads a stale composite value.
    delete entry.motorRate; delete entry.boatRate;
  }
  return copy;
}

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const count = (o, k) => { o[k] = (o[k] || 0) + 1; };

async function build(root, since = '20261001', options = {}) {
  const { chosen, exclusions, files, results } = await frozen.loadFrozenInputs(root, since,
    { requiredCoreVersion: CORE_VERSION, refreshResults: false, ...options });
  const dir = candidateRoot(root);
  try {
    const run = { current: frozen.runner(root, 'current', { freezeClock: true }),
      officialStats: frozen.runner(dir, 'current', { freezeClock: true }) };
    const rows = [];
    for (const row of [...chosen.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      try {
        const current = run.current(row), reason = frozen.checkReplay(row, current);
        if (reason) { count(exclusions, reason); continue; }
        const officialStats = run.officialStats(withOfficialStats(row));
        if (!(officialStats.tickets.length > 0 && officialStats.tickets.length <= 10)) throw Error('invalid candidate tickets');
        rows.push({ key: row.key, selectedAt: row.selectedAt,
          period: Date.parse(row.selectedAt) > Date.parse(DEFINED_AT) ? 'post-definition' : 'discovery',
          current: { head: current.head, tickets: current.tickets },
          officialStats: { head: officialStats.head, tickets: officialStats.tickets },
          result: require('./audit-escape-main.cjs').resultOf(results.get(row.key)),
          changedTickets: !same(current.tickets, officialStats.tickets), changedHead: current.head !== officialStats.head });
      } catch (error) { count(exclusions, 'replay-error:' + error.message); }
    }
    const summarize = rs => ({ replayed: rs.length, pending: rs.filter(r => !r.result).length,
      changedTickets: rs.filter(r => r.changedTickets).length, changedHead: rs.filter(r => r.changedHead).length,
      current: frozen.totals(rs, 'current'), officialStats: frozen.totals(rs, 'officialStats'),
      changedRacesOnly: { current: frozen.totals(rs.filter(r => r.changedTickets), 'current'),
        officialStats: frozen.totals(rs.filter(r => r.changedTickets), 'officialStats') } });
    return { version: 'official-stat-slots-comparison-v1', generatedAt: new Date().toISOString(),
      sourceCommit: process.env.GITHUB_SHA || '', since, coreVersion: CORE_VERSION, definedAt: DEFINED_AT,
      productionChanged: false, automaticProductionChange: false, usableForPrediction: false,
      candidate: { id: 'official-stat-slots-v1',
        definition: 'Keep official localWinRate/local2Rate/local3Rate and motor/boat rates in the entry fields; the two theory rows are still attached but no longer overwrite those fields.',
        fingerprint: crypto.createHash('sha256').update(LOCAL_SPREAD + MOTOR_SPREAD).digest('hex') },
      inputFiles: files, eligibleFrozen: chosen.size, exclusions, summary: summarize(rows),
      byPeriod: Object.fromEntries(['discovery', 'post-definition'].map(p => [p, summarize(rows.filter(r => r.period === p))])),
      rows,
      limitation: 'Only races whose saved head, tickets and scenarios reproduce exactly. Official settled results; refunds excluded. 100 yen per ticket, not real purchases. Discovery rows were saved before this candidate was defined.' };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (require.main === module) build(process.cwd(), process.argv[2] || '20261001').then(report => {
  const out = path.join(process.cwd(), 'data/stats/official-stat-slots-comparison-v1.json');
  archive.atomicWrite(out, JSON.stringify(report) + '\n');
  console.log(JSON.stringify({ eligibleFrozen: report.eligibleFrozen, exclusions: report.exclusions, summary: report.summary }, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { DEFINED_AT, CORE_VERSION, OFFICIAL_FIELDS, officialStatsSource, candidateRoot, withOfficialStats, build };
