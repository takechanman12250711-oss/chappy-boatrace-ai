'use strict';
// 引き波越え実績ゲート（外コースの頭は差し・まくり差しの1着実績が必要）の影響検証。
// 締切前に保存済みの予想と公式結果だけを読み、保存データ・本番予想・買い目は変更しない。
const fs = require('node:fs');
const path = require('node:path');
const input = require('./analysis-input-contract');
const gate = require('../js/wake-crossing-head-gate.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = 'data/stats/wake-crossing-head-gate-v1.json';
const STAKE_YEN = 100;

const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key]]));
const CONDITION_KEYS = ['schemaVersion', 'source', 'dataSource', 'sourceTiming', 'sourceFetchedAt', 'officialResultUsed'];
const PREDICTION_FLAGS = ['isRetrospective', 'predictionMode', 'officialResultUsedForPrediction', 'officialResultUsedForEvaluation'];
const ENVELOPE_KEYS = ['raceKey', 'date', 'raceDate', 'targetDate', 'jcd', 'placeCode', 'raceNo', 'rno',
  'selectedAt', 'capturedAt', 'createdAt', 'deadlineAt', 'deadline', 'verificationMode',
  'isRetrospective', 'predictionMode', 'officialResultUsedForPrediction', 'officialResultUsedForEvaluation'];

function compactHistory(history) {
  if (!history || typeof history !== 'object') return history;
  return {
    starts: history.starts,
    wins: history.wins,
    winningMethods: Array.isArray(history.winningMethods)
      ? history.winningMethods.map(item => pick(item, ['key', 'count']))
      : history.winningMethods
  };
}
function compactRole(role) {
  if (!role || typeof role !== 'object') return role;
  const window = gate.FIXED.historyWindow;
  return {
    boatNo: role.boatNo,
    course: role.course,
    courseHistory: role.courseHistory && typeof role.courseHistory === 'object'
      ? { [window]: compactHistory(role.courseHistory[window]) }
      : role.courseHistory
  };
}
function compactConditions(conditions) {
  if (!conditions || typeof conditions !== 'object') return conditions;
  const out = pick(conditions, CONDITION_KEYS);
  const roles = conditions.escapeEvaluationEvidence?.racerSkillTheory?.roles;
  if (Array.isArray(roles)) out.escapeEvaluationEvidence = { racerSkillTheory: { roles: roles.map(compactRole) } };
  return out;
}
function compactTickets(list) {
  return Array.isArray(list) ? list.map(item => (item && typeof item === 'object' && !Array.isArray(item))
    ? pick(item, ['ticket', 'combination', 'text', 'boats']) : item) : list;
}
// Read-only projection applied right after each daily file is parsed.
function compactPredictionRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const out = pick(record, ENVELOPE_KEYS);
  out.race = record.race && typeof record.race === 'object' ? pick(record.race, ['date', 'jcd', 'placeCode', 'raceNo', 'rno']) : record.race;
  out.preRaceConditions = compactConditions(record.preRaceConditions);
  if (record.practicalTickets) out.practicalTickets = compactTickets(record.practicalTickets);
  if (record.prediction && typeof record.prediction === 'object') {
    out.prediction = {
      ...pick(record.prediction, PREDICTION_FLAGS),
      preRaceConditions: compactConditions(record.prediction.preRaceConditions),
      practicalTickets: compactTickets(record.prediction.practicalTickets)
    };
  } else {
    out.prediction = record.prediction;
  }
  return out;
}

function emptyLedger() { return { races: 0, tickets: 0, stakeYen: 0, hitRaces: 0, returnYen: 0, skippedRaces: 0 }; }
function addLedger(ledger, tickets, actual, payout) {
  if (!tickets.length) { ledger.skippedRaces++; return; }
  ledger.races++;
  ledger.tickets += tickets.length;
  ledger.stakeYen += tickets.length * STAKE_YEN;
  if (tickets.includes(actual)) { ledger.hitRaces++; ledger.returnYen += payout * (STAKE_YEN / 100); }
}
function finishLedger(ledger) {
  return {
    ...ledger,
    hitRate: ledger.races ? round(ledger.hitRaces / ledger.races * 100) : null,
    recoveryRate: ledger.stakeYen ? round(ledger.returnYen / ledger.stakeYen * 100) : null
  };
}
function emptyOutcome() { return { count: 0, wins: 0, seconds: 0, thirds: 0 }; }
function addOutcome(bucket, boatNo, order) {
  bucket.count++;
  if (order[0] === boatNo) bucket.wins++;
  else if (order[1] === boatNo) bucket.seconds++;
  else if (order[2] === boatNo) bucket.thirds++;
}
function finishOutcome(bucket) {
  return {
    ...bucket,
    winRate: bucket.count ? round(bucket.wins / bucket.count * 100) : null,
    secondThirdRate: bucket.count ? round((bucket.seconds + bucket.thirds) / bucket.count * 100) : null
  };
}
function round(value) { return Math.round(value * 10) / 10; }
function outcomeTable() { return Object.fromEntries(gate.STATUSES.map(status => [status, emptyOutcome()])); }
function finishTable(table) { return Object.fromEntries(Object.entries(table).map(([k, v]) => [k, finishOutcome(v)])); }

function build(options = {}) {
  const root = options.root || ROOT;
  const projector = options.compactPredictionRecord === undefined ? compactPredictionRecord : options.compactPredictionRecord;
  const { records, diagnostics } = input.buildDefaultCohort({
    root,
    predictionsDir: options.predictionsDir || path.join(root, 'data', 'predictions'),
    resultsDir: options.resultsDir || path.join(root, 'data', 'results'),
    compactPredictionRecord: projector
  });

  const counts = { settled: 0, basisValid: 0, basisInvalid: {}, outerHeadRaces: 0, changed: 0, skippedByB: 0, refundedOrNoPayout: 0 };
  const ledgers = { allA: emptyLedger(), allB: emptyLedger(), changedA: emptyLedger(), changedB: emptyLedger() };
  const headOutcomes = outcomeTable();
  const allBoatOutcomes = outcomeTable();
  const rows = [];

  for (const record of records) {
    counts.settled++;
    const official = record.__officialResult;
    const order = input.finishOrder(official);
    const actual = order.join('-');
    const payout = Number(official?.trifecta?.payout);
    const result = gate.evaluateRecord(record);
    if (!result.basisValid) {
      counts.basisInvalid[result.reason] = (counts.basisInvalid[result.reason] || 0) + 1;
      continue;
    }
    if (!Number.isFinite(payout) || payout <= 0) { counts.refundedOrNoPayout++; continue; }
    counts.basisValid++;
    if (result.heads.some(h => h.course >= 2)) counts.outerHeadRaces++;

    addLedger(ledgers.allA, result.aTickets, actual, payout);
    addLedger(ledgers.allB, result.bTickets, actual, payout);
    if (result.changed) {
      counts.changed++;
      if (result.skippedByB) counts.skippedByB++;
      addLedger(ledgers.changedA, result.aTickets, actual, payout);
      addLedger(ledgers.changedB, result.bTickets, actual, payout);
    }
    for (const head of result.heads) addOutcome(headOutcomes[head.status] || (headOutcomes[head.status] = emptyOutcome()), head.boatNo, order);
    for (const boat of result.boats) addOutcome(allBoatOutcomes[boat.status] || (allBoatOutcomes[boat.status] = emptyOutcome()), boat.boatNo, order);

    if (result.changed) {
      rows.push({
        raceKey: input.raceKey(record),
        selectedAt: record.selectedAt || record.capturedAt || '',
        actualTicket: actual,
        payout,
        winningMethod: input.winningMethod(official) || null,
        demotedHeads: result.heads.filter(h => h.status === 'demote').map(h => pick(h, ['boatNo', 'course', 'starts', 'wins', 'wakeCrossingWins', 'makuriWins', 'ticketCount'])),
        aTickets: result.aTickets,
        bTickets: result.bTickets,
        aHit: result.aTickets.includes(actual),
        bHit: result.bTickets.includes(actual)
      });
    }
  }

  const demotedHeadCount = headOutcomes.demote.count;
  return {
    schemaVersion: 1,
    analysisId: gate.FIXED.version,
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    fixedRule: gate.FIXED,
    stakeYenPerTicket: STAKE_YEN,
    readiness: demotedHeadCount >= gate.FIXED.evidenceReadyDemotedHeads ? 'evidence-ready' : 'collecting',
    note: 'B案は頭降格となった艇を1着にする実戦厳選券だけを除いた比較。新しい券は追加しない。採用判断は本人承認が必要。',
    cohort: diagnostics,
    counts,
    ledgers: Object.fromEntries(Object.entries(ledgers).map(([k, v]) => [k, finishLedger(v)])),
    headOutcomes: finishTable(headOutcomes),
    allBoatOutcomes: finishTable(allBoatOutcomes),
    rows
  };
}

function main() {
  const report = build();
  const out = path.join(ROOT, OUTPUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ readiness: report.readiness, counts: report.counts, ledgers: report.ledgers, headOutcomes: report.headOutcomes }, null, 2));
  return report;
}

if (require.main === module) main();
module.exports = { build, main, compactPredictionRecord, OUTPUT };
