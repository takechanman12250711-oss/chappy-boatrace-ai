'use strict';
// 引き波越え実績ゲート（外コースの頭は差し・まくり差しの1着実績が必要）の影響検証。
// 締切前に保存済みの予想と公式結果だけを読み、保存データ・本番予想・買い目は変更しない。
const fs = require('node:fs');
const path = require('node:path');
const input = require('./analysis-input-contract');
const gate = require('../js/wake-crossing-head-gate.js');
const pit = require('./wake-crossing-point-in-time-history.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = 'data/stats/wake-crossing-head-gate-v2.json';
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
  if (Array.isArray(conditions.boats)) out.boats = conditions.boats.map(b => (b && typeof b === 'object') ? pick(b, ['boatNo', 'course', 'courseOfficial', 'registerNo']) : b);
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

const PERIODS = ['explored', 'holdout'];
const VARIANTS = ['A', 'B', 'C'];
function emptyPeriod() {
  return {
    counts: { races: 0, outerHeadRaces: 0, changed: 0 },
    ledgers: Object.fromEntries(['all', 'changed'].flatMap(scope => VARIANTS.map(v => [`${scope}${v}`, emptyLedger()]))),
    headOutcomes: outcomeTable()
  };
}
function finishPeriod(period) {
  return {
    counts: period.counts,
    ledgers: Object.fromEntries(Object.entries(period.ledgers).map(([k, v]) => [k, finishLedger(v)])),
    headOutcomes: finishTable(period.headOutcomes)
  };
}

function build(options = {}) {
  const root = options.root || ROOT;
  const projector = options.compactPredictionRecord === undefined ? compactPredictionRecord : options.compactPredictionRecord;
  const resultsDir = options.resultsDir || path.join(root, 'data', 'results');
  const { records, diagnostics } = input.buildDefaultCohort({
    root,
    predictionsDir: options.predictionsDir || path.join(root, 'data', 'predictions'),
    resultsDir,
    compactPredictionRecord: projector
  });
  const index = pit.buildIndex(resultsDir);

  const counts = { settled: 0, basisValid: 0, basisInvalid: {}, refundedOrNoPayout: 0, rolesSource: { saved: 0, pointInTime: 0 }, pointInTimeCourseMapping: {} };
  const periods = Object.fromEntries(PERIODS.map(name => [name, emptyPeriod()]));
  const agreement = {};
  const rows = [];

  for (const record of records) {
    counts.settled++;
    const official = record.__officialResult;
    const order = input.finishOrder(official);
    const actual = order.join('-');
    const payout = Number(official?.trifecta?.payout);
    const key = input.raceKey(record);
    const savedRoles = gate.skillRoles(record);
    const rebuilt = pit.pointInTimeRoles(index, record, key.slice(0, 8));
    const periodName = savedRoles && savedRoles.length ? 'explored' : 'holdout';
    const roles = periodName === 'explored' ? savedRoles : rebuilt.roles;
    const result = gate.evaluateRecord(record, { roles });
    if (!result.basisValid) {
      counts.basisInvalid[result.reason] = (counts.basisInvalid[result.reason] || 0) + 1;
      continue;
    }
    if (!Number.isFinite(payout) || payout <= 0) { counts.refundedOrNoPayout++; continue; }
    counts.basisValid++;
    if (periodName === 'explored') counts.rolesSource.saved++;
    else {
      counts.rolesSource.pointInTime++;
      counts.pointInTimeCourseMapping[rebuilt.mapping] = (counts.pointInTimeCourseMapping[rebuilt.mapping] || 0) + 1;
    }
    // 保存済み判定と再構築判定の一致率（再構築の妥当性確認）
    if (periodName === 'explored' && Array.isArray(rebuilt.roles)) {
      const rebuiltByBoat = new Map(rebuilt.roles.map(r => [Number(r.boatNo), gate.evaluateBoat(r).status]));
      for (const boat of result.boats) {
        const other = rebuiltByBoat.get(boat.boatNo);
        if (!other) continue;
        const cell = `${boat.status}->${other}`;
        agreement[cell] = (agreement[cell] || 0) + 1;
      }
    }

    const period = periods[periodName];
    period.counts.races++;
    if (result.heads.some(h => h.course >= 2)) period.counts.outerHeadRaces++;
    const variants = { A: result.aTickets, B: result.bTickets, C: result.cTickets };
    for (const v of VARIANTS) addLedger(period.ledgers[`all${v}`], variants[v], actual, payout);
    if (result.changed) {
      period.counts.changed++;
      for (const v of VARIANTS) addLedger(period.ledgers[`changed${v}`], variants[v], actual, payout);
    }
    for (const head of result.heads) addOutcome(period.headOutcomes[head.status] || (period.headOutcomes[head.status] = emptyOutcome()), head.boatNo, order);

    if (result.changed) {
      rows.push({
        raceKey: key,
        period: periodName,
        selectedAt: record.selectedAt || record.capturedAt || '',
        actualTicket: actual,
        payout,
        winningMethod: input.winningMethod(official) || null,
        demotedHeads: result.heads.filter(h => h.status === 'demote').map(h => pick(h, ['boatNo', 'course', 'starts', 'wins', 'wakeCrossingWins', 'makuriWins', 'ticketCount'])),
        aTickets: result.aTickets,
        bTickets: result.bTickets,
        cTickets: result.cTickets,
        aHit: result.aTickets.includes(actual),
        bHit: result.bTickets.includes(actual),
        cHit: result.cTickets.includes(actual)
      });
    }
  }

  const agreeTotal = Object.values(agreement).reduce((a, b) => a + b, 0);
  const agreeSame = Object.entries(agreement).filter(([k]) => { const [x, y] = k.split('->'); return x === y; }).reduce((a, [, n]) => a + n, 0);
  const holdoutDemoted = periods.holdout.headOutcomes.demote.count;
  return {
    schemaVersion: 2,
    analysisId: 'wake-crossing-head-gate-v2',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    fixedRule: gate.FIXED,
    stakeYenPerTicket: STAKE_YEN,
    readiness: holdoutDemoted >= gate.FIXED.evidenceReadyDemotedHeads ? 'evidence-ready' : 'collecting',
    periodDefinition: {
      explored: '予想時に選手のコース別決まり手が保存されているレース。v1の結果とC案の試算を見た期間。',
      holdout: '保存がない過去レース。公式結果の原本からレース前日まで3年間だけで再構築して判定。C案はこの期間を見る前に固定した。'
    },
    note: 'B案は降格艇が頭の実戦厳選券を除外。C案は降格艇を2着へ回した券に置き換え（x-h-y）。いずれも採用には本人承認が必要。',
    cohort: diagnostics,
    resultIndex: { races: index.races },
    counts,
    pointInTimeAgreement: { total: agreeTotal, sameStatusRate: agreeTotal ? round(agreeSame / agreeTotal * 100) : null, matrix: agreement },
    periods: Object.fromEntries(Object.entries(periods).map(([k, v]) => [k, finishPeriod(v)])),
    rows
  };
}

function main() {
  const report = build();
  const out = path.join(ROOT, OUTPUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ readiness: report.readiness, counts: report.counts, pointInTimeAgreement: report.pointInTimeAgreement, periods: report.periods }, null, 2));
  return report;
}

if (require.main === module) main();
module.exports = { build, main, compactPredictionRecord, OUTPUT };
