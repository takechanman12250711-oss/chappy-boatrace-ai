"use strict";

const fs = require("node:fs");
const path = require("node:path");
const proposal = require("./build-improvement-proposal-report");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "data", "stats", "three-course-escape-rescue-ab-report.json");
const TARGET_LABEL = "3コース攻め";
const DISCOVERY_RATIO = 0.6;
const STAKE_PER_TICKET = 100;
const MIN_HOLDOUT_TARGET = 30;

function normalizeTicket(value) {
  const boats = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  if (boats.length < 3) return "";
  const ticket = boats.slice(0, 3);
  return new Set(ticket).size === 3 ? ticket.join("-") : "";
}

function practicalTickets(record = {}) {
  const rows = record?.prediction?.practicalTickets || record?.prediction?.practicalSelection?.tickets || [];
  return [...new Set((Array.isArray(rows) ? rows : []).map(normalizeTicket).filter(Boolean))];
}

function scenarioLabel(record = {}) {
  const prediction = record.prediction || {};
  const evidence = prediction.verificationEvidence || prediction?.practicalSelection?.verificationEvidence || {};
  return String(
    evidence?.mainScenario?.label ||
    prediction?.predictedScenarioTitle ||
    prediction?.raceFlow?.title ||
    prediction?.raceFlow?.scenario?.title ||
    ""
  ).trim();
}

function resultTicket(record = {}) {
  return normalizeTicket(record?.result?.resultTicket || record?.result?.verification?.resultTicket || record?.result?.trifecta?.combination);
}

function payout(record = {}) {
  return Math.max(0, Number(record?.result?.payout || record?.result?.verification?.payoutPer100 || record?.result?.trifecta?.payout || 0));
}

function raceKey(record = {}) {
  return `${String(record.date || "")}-${String(record.jcd || "").padStart(2, "0")}-${String(Number(record.raceNo || 0)).padStart(2, "0")}`;
}

function settledTargetRows(records) {
  return records
    .filter(record => record?.result?.settled === true)
    .filter(record => scenarioLabel(record) === TARGET_LABEL)
    .filter(record => resultTicket(record))
    .sort((a, b) => raceKey(a).localeCompare(raceKey(b)));
}

function splitRows(rows) {
  const cut = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * DISCOVERY_RATIO)));
  return { discovery: rows.slice(0, cut), holdout: rows.slice(cut), cut };
}

function chooseRescueTicket(discovery) {
  const counts = new Map();
  for (const record of discovery) {
    const ticket = resultTicket(record);
    if (!ticket.startsWith("1-")) continue;
    counts.set(ticket, (counts.get(ticket) || 0) + 1);
  }
  const ranking = [...counts.entries()]
    .map(([ticket, count]) => ({ ticket, count }))
    .sort((a, b) => b.count - a.count || a.ticket.localeCompare(b.ticket));
  return { rescueTicket: ranking[0]?.ticket || "", ranking };
}

function bTickets(record, rescueTicket) {
  const current = practicalTickets(record);
  if (!rescueTicket || !current.length || current.includes(rescueTicket)) return current;
  return [...current.slice(0, -1), rescueTicket];
}

function settle(rows, mode, rescueTicket) {
  let betRaceCount = 0, hitCount = 0, stake = 0, returned = 0, replacedRaceCount = 0;
  for (const record of rows) {
    const a = practicalTickets(record);
    const ts = mode === "B" ? bTickets(record, rescueTicket) : a;
    if (!ts.length) continue;
    if (mode === "B" && JSON.stringify(ts) !== JSON.stringify(a)) replacedRaceCount += 1;
    betRaceCount += 1;
    stake += ts.length * STAKE_PER_TICKET;
    const actual = resultTicket(record);
    if (ts.includes(actual)) {
      hitCount += 1;
      returned += payout(record);
    }
  }
  return {
    targetSettledCount: rows.length,
    betRaceCount,
    replacedRaceCount,
    hitCount,
    hitRate: betRaceCount ? Math.round(hitCount / betRaceCount * 1000) / 10 : null,
    stake,
    return: returned,
    profit: returned - stake,
    recoveryRate: stake ? Math.round(returned / stake * 1000) / 10 : null
  };
}

function delta(a, b) {
  return {
    hitCount: b.hitCount - a.hitCount,
    hitRate: a.hitRate !== null && b.hitRate !== null ? Math.round((b.hitRate - a.hitRate) * 10) / 10 : null,
    profit: b.profit - a.profit,
    recoveryRate: a.recoveryRate !== null && b.recoveryRate !== null ? Math.round((b.recoveryRate - a.recoveryRate) * 10) / 10 : null
  };
}

function build(records) {
  const target = settledTargetRows(records);
  const { discovery, holdout, cut } = splitRows(target);
  const selected = chooseRescueTicket(discovery);
  const discoveryA = settle(discovery, "A", selected.rescueTicket);
  const discoveryB = settle(discovery, "B", selected.rescueTicket);
  const holdoutA = settle(holdout, "A", selected.rescueTicket);
  const holdoutB = settle(holdout, "B", selected.rescueTicket);
  const holdoutDelta = delta(holdoutA, holdoutB);
  const holdoutReady = holdout.length >= MIN_HOLDOUT_TARGET;
  const candidate = holdoutReady &&
    holdoutDelta.hitCount > 0 &&
    holdoutDelta.profit > 0 &&
    Number(holdoutDelta.recoveryRate || 0) > 0;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    targetLabel: TARGET_LABEL,
    sourceContract: proposal.ANALYSIS_INPUT_CONTRACT,
    protocol: {
      discoveryRatio: DISCOVERY_RATIO,
      chronologicalSplit: true,
      discoveryCount: discovery.length,
      holdoutCount: holdout.length,
      splitIndex: cut,
      rescueTicketChosenFromDiscoveryOnly: true,
      holdoutUsedForTicketSelection: false,
      replacementPolicy: "同点数維持のため既存実戦券の末尾1点を救済券へ置換。救済券が既存なら変更なし。",
      minimumHoldoutTargetCount: MIN_HOLDOUT_TARGET
    },
    discoverySelection: selected,
    discovery: {
      a: discoveryA,
      b: discoveryB,
      delta: delta(discoveryA, discoveryB)
    },
    holdout: {
      a: holdoutA,
      b: holdoutB,
      delta: holdoutDelta
    },
    decision: candidate ? "candidate" : holdoutReady ? "reject" : "continue",
    reason: !holdoutReady
      ? `${holdout.length}/${MIN_HOLDOUT_TARGET}R`
      : candidate
        ? "holdoutで的中数・収支・回収率がすべて改善"
        : "holdoutで的中数・収支・回収率の同時改善を満たさない",
    policy: "分析専用。候補になってもユーザー承認前に本番予想へ反映しない。"
  };
}

function main() {
  const report = build(proposal.collect());
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`3コース攻め→イン逃げ救済A/B: discovery ${report.protocol.discoveryCount}R / holdout ${report.protocol.holdoutCount}R / decision ${report.decision}`);
}

if (require.main === module) main();
module.exports = { normalizeTicket, practicalTickets, scenarioLabel, resultTicket, payout, raceKey, settledTargetRows, splitRows, chooseRescueTicket, bTickets, settle, delta, build };
