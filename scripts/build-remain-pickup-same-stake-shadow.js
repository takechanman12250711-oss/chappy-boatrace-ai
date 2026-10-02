"use strict";

const fs = require("node:fs");
const path = require("node:path");
const input = require("./analysis-input-contract");
const expansion = require("./analyze-ticket-expansion-7-12-18-24.cjs");
const payoutAudit = require("./analyze-ticket-expansion-payout-v2.cjs");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "data", "stats", "remain-pickup-same-stake-shadow-report.json");
const ACTIVATED_AT = Date.parse("2026-09-01T10:19:20Z");
const STAKE_PER_TICKET = 100;
const TICKET_COUNT = 7;
const DISCOVERY_COUNT = 100;
const HOLDOUT_GATE = 100;

function ticketOf(value) {
  return input.normalizeTicket(value?.ticket || value?.combination || value);
}

function capturedAt(record) {
  for (const value of [
    record?.selectedAt,
    record?.capturedAt,
    record?.createdAt,
    record?.prediction?.selectedAt,
    record?.prediction?.capturedAt,
    record?.prediction?.createdAt
  ]) {
    const timestamp = Date.parse(String(value || ""));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return NaN;
}

function detailMap(record) {
  const prediction = record?.prediction || record || {};
  const selection = prediction?.practicalSelection || record?.practicalSelection || {};
  const details = new Map();
  for (const list of [prediction?.practicalTickets, record?.practicalTickets, prediction?.tickets]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const ticket = ticketOf(item);
      if (ticket && !details.has(ticket)) details.set(ticket, item);
    }
  }
  for (const decision of Array.isArray(selection?.targetDecisions) ? selection.targetDecisions : []) {
    for (const item of Array.isArray(decision?.candidateDecisions) ? decision.candidateDecisions : []) {
      const ticket = ticketOf(item);
      if (ticket && !details.has(ticket)) details.set(ticket, item);
    }
  }
  return details;
}

function roleQuality(item) {
  const roles = Array.isArray(item?.roleLabels) ? item.roleLabels : [];
  const structuredCount = roles.filter(role => role?.structured === true).length;
  const head = roles.some(role => role?.position === 1 && role?.structured === true && ["head", "alternate-head"].includes(role?.role));
  const hold = roles.some(role => role?.position === 2 && role?.structured === true && role?.role === "hold");
  const pickup = roles.some(role => role?.position === 3 && role?.structured === true && role?.role === "pickup");
  const priority = Number(item?.priorityScore ?? item?.score ?? 0);
  return {
    structuredCount,
    fullRemainPickup: head && hold && pickup,
    priority: Number.isFinite(priority) ? priority : 0
  };
}

function replacementFor(record) {
  const pool = expansion.collectTicketPool(record).slice(0, 12);
  if (pool.length < 8) return null;
  const details = detailMap(record);
  const additions = pool.slice(7, 12)
    .map((ticket, index) => ({ ticket, index, quality: roleQuality(details.get(ticket.ticket)) }))
    .filter(row => row.quality.fullRemainPickup)
    .sort((left, right) => right.quality.priority - left.quality.priority || left.index - right.index);
  if (!additions.length) return null;

  const removals = pool.slice(0, 7)
    .map((ticket, index) => ({ ticket, index, quality: roleQuality(details.get(ticket.ticket)) }))
    .filter(row => !row.quality.fullRemainPickup)
    .sort((left, right) => left.quality.structuredCount - right.quality.structuredCount || left.quality.priority - right.quality.priority || right.index - left.index);
  if (!removals.length) return null;

  const addition = additions[0];
  const removal = removals[0];
  if (addition.quality.priority < removal.quality.priority) return null;
  if (addition.quality.structuredCount <= removal.quality.structuredCount) return null;
  return { add: addition.ticket.ticket, remove: removal.ticket.ticket };
}

function percent(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function evaluate(records) {
  const metric = {
    settledRaceCount: records.length,
    affectedRaceCount: 0,
    hitCount: 0,
    returnYen: 0,
    rescueCount: 0,
    lostHitCount: 0
  };
  const candidate = { ...metric };

  for (const row of records) {
    const baseline = row.pool.slice(0, TICKET_COUNT).map(item => item.ticket);
    const replacement = replacementFor(row.record);
    const changed = baseline.slice();
    if (replacement && !changed.includes(replacement.add)) {
      const index = changed.indexOf(replacement.remove);
      if (index >= 0) {
        changed[index] = replacement.add;
        metric.affectedRaceCount += 1;
        candidate.affectedRaceCount += 1;
      }
    }
    const baselineHit = baseline.includes(row.actualTicket);
    const candidateHit = changed.includes(row.actualTicket);
    if (baselineHit) {
      metric.hitCount += 1;
      metric.returnYen += row.payoutYen;
    }
    if (candidateHit) {
      candidate.hitCount += 1;
      candidate.returnYen += row.payoutYen;
    }
    if (!baselineHit && candidateHit) candidate.rescueCount += 1;
    if (baselineHit && !candidateHit) candidate.lostHitCount += 1;
  }

  for (const result of [metric, candidate]) {
    result.investmentYen = result.settledRaceCount * TICKET_COUNT * STAKE_PER_TICKET;
    result.hitRate = percent(result.hitCount, result.settledRaceCount);
    result.recoveryRate = percent(result.returnYen, result.investmentYen);
    result.profitYen = result.returnYen - result.investmentYen;
  }
  return {
    A: metric,
    B: candidate,
    delta: {
      hitCount: candidate.hitCount - metric.hitCount,
      returnYen: candidate.returnYen - metric.returnYen,
      recoveryRatePoints: Number((candidate.recoveryRate - metric.recoveryRate).toFixed(1)),
      rescueCount: candidate.rescueCount,
      lostHitCount: candidate.lostHitCount
    }
  };
}

function build(options = {}) {
  const cohort = options.records || input.buildDefaultCohort({ root }).records;
  const payouts = options.payouts || payoutAudit.payoutMap();
  const rows = cohort
    .filter(record => capturedAt(record) >= ACTIVATED_AT)
    .map(record => {
      const pool = expansion.collectTicketPool(record).slice(0, 12);
      const raceKey = record.__analysisRaceKey || input.raceKey(record);
      return {
        record,
        raceKey,
        timestamp: capturedAt(record),
        pool,
        actualTicket: input.actualTicket(record.__officialResult),
        payoutYen: Number(payouts.get(raceKey) || 0)
      };
    })
    .filter(row => row.pool.length >= 8 && row.actualTicket && row.payoutYen > 0)
    .sort((left, right) => left.timestamp - right.timestamp || left.raceKey.localeCompare(right.raceKey));

  const discovery = evaluate(rows.slice(0, DISCOVERY_COUNT));
  const holdout = evaluate(rows.slice(DISCOVERY_COUNT));
  const all = evaluate(rows);
  const holdoutReady = holdout.A.settledRaceCount >= HOLDOUT_GATE;
  const passes = holdoutReady && holdout.B.hitCount >= holdout.A.hitCount && holdout.B.recoveryRate > holdout.A.recoveryRate;
  const status = holdoutReady ? (passes ? "candidate-passes-retrospective-holdout-100" : "candidate-fails-retrospective-holdout-100") : "collecting-holdout";

  return {
    schemaVersion: 1,
    version: "remain-pickup-same-stake-shadow-v1",
    generatedAt: new Date().toISOString(),
    activatedAt: new Date(ACTIVATED_AT).toISOString(),
    status,
    productionChanged: false,
    productionAUnchanged: true,
    automaticApplication: false,
    adoptionCandidate: false,
    usableForPrediction: false,
    actualPurchase: false,
    ticketCount: TICKET_COUNT,
    stakePerTicketYen: STAKE_PER_TICKET,
    discoveryCount: DISCOVERY_COUNT,
    holdoutGate: HOLDOUT_GATE,
    discovery,
    holdout,
    all,
    candidateB: {
      description: "7点を維持し、8〜12位の完全な構造化head/hold/pickup候補を、より根拠の弱い既存1点と同額入れ替え",
      removalGuard: "追加候補のpriorityが既存候補以上、かつ構造化役割数が多い場合だけ入れ替える",
      oddsUsed: false
    },
    decision: passes ? "prospective-preregistration-required" : "reject-and-advance",
    methodology: {
      sourceTiming: "pre_deadline only",
      officialResultUse: "evaluation only",
      sameStake: true,
      sameTicketCount: true,
      noOutcomeBasedPerRaceSelection: true,
      warning: "探索・保留分割を含む回顧監査であり、成功しても直接の本番採用には使わない"
    }
  };
}

function main() {
  const report = build();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`残し・拾い同額shadow: ${report.status} / holdout A ${report.holdout.A.recoveryRate}% B ${report.holdout.B.recoveryRate}%`);
}

if (require.main === module) main();
module.exports = { build, capturedAt, detailMap, evaluate, replacementFor, roleQuality };
