"use strict";

const fs = require("node:fs");
const path = require("node:path");
const snapshot = require("../js/theory-tag-snapshot");
const preregistration = require("../data/experiments/wall-established-attacker2-skip-preregistration.json");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "wall-established-attacker2-skip-ab-report.json");
const PREREGISTRATION_COMMIT = "4d9e9a685ce6e2c202f33a36f4e88612e199ed75";
const STAKE_PER_TICKET = Number(preregistration?.accounting?.stakePerTicketYen || 100);
const PROSPECTIVE_CUTOFF = String(preregistration?.prospectiveProtocol?.cutoffSelectedAtInclusive || "");
const TARGET_STATE = String(preregistration?.hypothesis?.target?.wallState || "壁成立");
const TARGET_ATTACKER_NO = Number(preregistration?.hypothesis?.target?.attackerNo || 2);

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function ticket(value) {
  const normalized = String(value?.ticket || value || "").trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(normalized) && new Set(normalized.split("-")).size === 3
    ? normalized
    : "";
}

function tickets(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(ticket).filter(Boolean))];
}

function raceKey(record = {}) {
  return `${String(record.date || "")}-${String(record.jcd || "").padStart(2, "0")}-${Number(record.raceNo || 0)}`;
}

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const race of Array.isArray(doc?.races) ? doc.races : []) {
      if (race?.resultAvailable === true && race?.status === "finished") {
        map.set(raceKey(race), race);
      }
    }
  }
  return map;
}

function selectedEpoch(record = {}) {
  const value = Date.parse(String(record.selectedAt || record.capturedAt || ""));
  return Number.isFinite(value) ? value : null;
}

function isProspective(record = {}) {
  const value = selectedEpoch(record);
  const cutoff = Date.parse(PROSPECTIVE_CUTOFF);
  return value !== null && Number.isFinite(cutoff) && value >= cutoff;
}

function practicalTickets(record = {}) {
  return tickets(
    record?.prediction?.practicalTickets ||
    record?.prediction?.practicalSelection?.tickets ||
    []
  );
}

function wallEvidence(record = {}) {
  return snapshot.wallEvidence(record?.prediction || record || {});
}

function isTarget(record = {}) {
  const evidence = wallEvidence(record);
  return evidence?.formal === true &&
    evidence.state === TARGET_STATE &&
    Number(evidence.attackerNo) === TARGET_ATTACKER_NO;
}

function embeddedResult(record = {}) {
  const result = record?.result || {};
  const combination = ticket(result?.resultTicket);
  if (result?.settled !== true || !combination) return null;
  return {
    trifecta: {
      combination,
      payout: Math.max(0, Number(result?.payoutPer100 ?? result?.payout ?? 0))
    }
  };
}

function normalizeResult(record, results) {
  return embeddedResult(record) || results.get(raceKey(record)) || null;
}

function chronologicalRows(rows) {
  return [...rows].sort((left, right) =>
    (selectedEpoch(left.record) ?? Number.MAX_SAFE_INTEGER) - (selectedEpoch(right.record) ?? Number.MAX_SAFE_INTEGER) ||
    raceKey(left.record).localeCompare(raceKey(right.record), "en")
  );
}

function settleA(rows) {
  let settledCount = 0;
  let betRaceCount = 0;
  let noTicketRaceCount = 0;
  let hitCount = 0;
  let stake = 0;
  let returned = 0;

  for (const row of rows) {
    if (!row.result) continue;
    settledCount += 1;
    const selectedTickets = practicalTickets(row.record);
    if (!selectedTickets.length) {
      noTicketRaceCount += 1;
      continue;
    }
    betRaceCount += 1;
    stake += selectedTickets.length * STAKE_PER_TICKET;
    const actual = ticket(row.result?.trifecta?.combination);
    const payout = Math.max(0, Number(row.result?.trifecta?.payout || 0));
    if (actual && selectedTickets.includes(actual)) {
      hitCount += 1;
      returned += payout;
    }
  }

  return {
    settledCount,
    betRaceCount,
    noTicketRaceCount,
    hitCount,
    hitRate: betRaceCount ? round1(hitCount / betRaceCount * 100) : null,
    stake,
    return: returned,
    profit: returned - stake,
    recoveryRate: stake ? round1(returned / stake * 100) : null
  };
}

function settleB(a) {
  return {
    settledCount: a.settledCount,
    betRaceCount: 0,
    skippedRaceCount: a.betRaceCount,
    noTicketRaceCount: a.noTicketRaceCount,
    hitCount: 0,
    hitRate: null,
    stake: 0,
    return: 0,
    profit: 0,
    recoveryRate: null
  };
}

function comparison(rows) {
  const a = settleA(rows);
  const b = settleB(a);
  return {
    a,
    b,
    delta: {
      stake: b.stake - a.stake,
      return: b.return - a.return,
      profit: b.profit - a.profit,
      avoidedLoss: b.profit - a.profit,
      missedHitCount: a.hitCount,
      missedPayout: a.return
    }
  };
}

function splitChronologically(rows) {
  const settled = chronologicalRows(rows.filter(row => row.result));
  const pivot = Math.ceil(settled.length / 2);
  return {
    first: settled.slice(0, pivot),
    second: settled.slice(pivot)
  };
}

function leaveOneOut(rows) {
  const settled = chronologicalRows(rows.filter(row => row.result));
  if (settled.length < 2) {
    return {
      evaluated: false,
      raceCount: settled.length,
      minimumRemainingAvoidedLoss: null,
      maximumRemainingAvoidedLoss: null,
      worstRemovedRaceKey: null,
      bestRemovedRaceKey: null
    };
  }

  const values = settled.map((removed, index) => {
    const remaining = settled.filter((_, rowIndex) => rowIndex !== index);
    return {
      removedRaceKey: raceKey(removed.record),
      remainingAvoidedLoss: comparison(remaining).delta.avoidedLoss
    };
  });
  const ascending = [...values].sort((left, right) =>
    left.remainingAvoidedLoss - right.remainingAvoidedLoss ||
    left.removedRaceKey.localeCompare(right.removedRaceKey, "en")
  );

  return {
    evaluated: true,
    raceCount: settled.length,
    minimumRemainingAvoidedLoss: ascending[0].remainingAvoidedLoss,
    maximumRemainingAvoidedLoss: ascending[ascending.length - 1].remainingAvoidedLoss,
    worstRemovedRaceKey: ascending[0].removedRaceKey,
    bestRemovedRaceKey: ascending[ascending.length - 1].removedRaceKey
  };
}

function conditionResult(name, actual, operator, threshold) {
  const comparable = actual !== null && actual !== undefined && Number.isFinite(Number(actual));
  const passed = comparable && (operator === "atMost" ? Number(actual) <= threshold : Number(actual) >= threshold);
  return { name, actual: comparable ? Number(actual) : null, operator, threshold, passed };
}

function evaluateCheckpoint(checkpoint, context) {
  const threshold = Number(checkpoint?.targetSettledRaceCount || 0);
  const reached = context.targetSettledRaceCount >= threshold;
  if (!checkpoint?.conditions) {
    return {
      targetSettledRaceCount: threshold,
      reached,
      decision: String(checkpoint?.decision || "monitor-only"),
      status: reached ? "reached-monitor-only" : "not-reached",
      conditionsMet: null,
      checks: []
    };
  }

  const conditions = checkpoint.conditions;
  const checks = [
    conditionResult("aRecoveryRate", context.aRecoveryRate, "atMost", Number(conditions.aRecoveryRateAtMost)),
    conditionResult("avoidedLoss", context.avoidedLoss, "atLeast", Number(conditions.avoidedLossYenAtLeast)),
    conditionResult("distinctDates", context.distinctDates, "atLeast", Number(conditions.distinctDatesAtLeast)),
    conditionResult("firstHalfAvoidedLoss", context.firstHalfAvoidedLoss, "atLeast", Number(conditions.firstHalfAvoidedLossYenAtLeast)),
    conditionResult("secondHalfAvoidedLoss", context.secondHalfAvoidedLoss, "atLeast", Number(conditions.secondHalfAvoidedLossYenAtLeast)),
    conditionResult("leaveOneOutMinimumAvoidedLoss", context.leaveOneOutMinimumAvoidedLoss, "atLeast", Number(conditions.leaveOneOutMinimumAvoidedLossYenAtLeast))
  ];
  const visibilityPassed = conditions.missedHitsAndPayoutMustBeShown !== true ||
    (Number.isFinite(Number(context.missedHitCount)) && Number.isFinite(Number(context.missedPayout)));
  checks.push({
    name: "missedHitsAndPayoutShown",
    actual: visibilityPassed,
    operator: "equals",
    threshold: true,
    passed: visibilityPassed
  });
  const conditionsMet = reached && checks.every(check => check.passed);

  return {
    targetSettledRaceCount: threshold,
    reached,
    decision: String(checkpoint.decision || "manual-review-candidate-only"),
    status: !reached
      ? "not-reached"
      : conditionsMet
        ? "conditions-met-awaiting-manual-approval"
        : "conditions-not-met",
    conditionsMet,
    checks
  };
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const selected = predDocs.flatMap(doc => Array.isArray(doc?.predictions) ? doc.predictions : []);
  const verification = predDocs.flatMap(doc => Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : []);
  const candidates = [
    ...verification.map(record => ({ record, source: "verification", sourcePriority: 0 })),
    ...selected.map(record => ({ record, source: "selected", sourcePriority: 1 }))
  ].filter(row => isProspective(row.record));

  const dedup = new Map();
  for (const row of candidates) {
    const key = raceKey(row.record);
    const current = dedup.get(key);
    if (!current || row.sourcePriority > current.sourcePriority) dedup.set(key, row);
  }

  const prospectiveRows = [...dedup.values()].map(row => ({
    ...row,
    evidence: wallEvidence(row.record),
    result: normalizeResult(row.record, results)
  }));
  const targetRows = prospectiveRows.filter(row => isTarget(row.record));
  const overall = comparison(targetRows);
  const halves = splitChronologically(targetRows);
  const firstHalf = comparison(halves.first);
  const secondHalf = comparison(halves.second);
  const sensitivity = leaveOneOut(targetRows);
  const settledTargetRows = targetRows.filter(row => row.result);
  const distinctDates = new Set(settledTargetRows.map(row => String(row.record?.date || "")).filter(Boolean)).size;
  const checkpointContext = {
    targetSettledRaceCount: settledTargetRows.length,
    aRecoveryRate: overall.a.recoveryRate,
    avoidedLoss: overall.delta.avoidedLoss,
    distinctDates,
    firstHalfAvoidedLoss: firstHalf.delta.avoidedLoss,
    secondHalfAvoidedLoss: secondHalf.delta.avoidedLoss,
    leaveOneOutMinimumAvoidedLoss: sensitivity.minimumRemainingAvoidedLoss,
    missedHitCount: overall.delta.missedHitCount,
    missedPayout: overall.delta.missedPayout
  };

  return {
    schemaVersion: 1,
    version: "wall-established-attacker2-skip-ab-v1-prospective",
    generatedAt: new Date().toISOString(),
    source: "post-preregistration saved predictions + official results",
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    affectsCurrentTickets: false,
    preregistration: {
      experimentId: preregistration.experimentId,
      path: "data/experiments/wall-established-attacker2-skip-preregistration.json",
      commit: PREREGISTRATION_COMMIT,
      registeredAtUtc: preregistration.registeredAtUtc,
      sourceCommit: preregistration.sourceCommit,
      cutoffSelectedAtInclusive: PROSPECTIVE_CUTOFF,
      oldRecordsBackfilled: false,
      retrospectiveClassificationAllowed: false,
      actualPurchase: false
    },
    target: {
      wallEvidenceFormal: true,
      state: TARGET_STATE,
      attackerNo: TARGET_ATTACKER_NO,
      ruleA: "現行の実戦厳選買い目を1点100円で購入したと仮定",
      ruleB: "対象条件のレースだけ購入見送り"
    },
    diagnostics: {
      selectedRecordCount: selected.length,
      verificationRecordCount: verification.length,
      prospectiveRecordCountBeforeDedup: candidates.length,
      prospectiveRaceCountAfterDedup: prospectiveRows.length,
      targetRaceCount: targetRows.length,
      targetSettledRaceCount: settledTargetRows.length,
      targetUnsettledRaceCount: targetRows.length - settledTargetRows.length,
      targetSettledBetRaceCount: overall.a.betRaceCount,
      targetSettledNoTicketRaceCount: overall.a.noTicketRaceCount,
      distinctSettledDates: distinctDates
    },
    a: {
      label: "current-production-A",
      ...overall.a
    },
    b: {
      label: "skip-wall-established-attacker2-B",
      ...overall.b
    },
    delta: overall.delta,
    robustness: {
      chronologicalSplit: {
        firstHalf: { raceCount: halves.first.length, ...firstHalf },
        secondHalf: { raceCount: halves.second.length, ...secondHalf }
      },
      leaveOneOut: sensitivity
    },
    checkpoints: preregistration.checkpoints.map(checkpoint => evaluateCheckpoint(checkpoint, checkpointContext)),
    interpretation: {
      minimumFormalDecisionRaceCount: 100,
      finalReviewRaceCount: 250,
      manualApprovalRequired: true,
      automaticApplication: false,
      currentPredictionPathUnchanged: true,
      nextAction: "50Rは監視のみ。100Rと250Rは事前登録条件を満たした場合だけ手動承認候補にする。"
    }
  };
}

function main() {
  const report = build(load(predictionDir), load(resultDir));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    targetRaceCount: report.diagnostics.targetRaceCount,
    targetSettledRaceCount: report.diagnostics.targetSettledRaceCount,
    aRecoveryRate: report.a.recoveryRate,
    avoidedLoss: report.delta.avoidedLoss,
    checkpoints: report.checkpoints.map(row => ({ count: row.targetSettledRaceCount, status: row.status }))
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  build,
  comparison,
  conditionResult,
  embeddedResult,
  evaluateCheckpoint,
  isProspective,
  isTarget,
  leaveOneOut,
  practicalTickets,
  raceKey,
  selectedEpoch,
  settleA,
  settleB,
  splitChronologically,
  ticket,
  tickets,
  wallEvidence,
  PREREGISTRATION_COMMIT,
  PROSPECTIVE_CUTOFF,
  STAKE_PER_TICKET,
  TARGET_ATTACKER_NO,
  TARGET_STATE
};
