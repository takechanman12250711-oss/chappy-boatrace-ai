"use strict";

const fs = require("node:fs");
const path = require("node:path");
const wall = require("./build-wall-boat-branch-profit-report");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "wall-established-breakdown.json");
const STAKE_PER_TICKET = 100;
const MIN_SETTLED = 10;

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
    for (const row of Array.isArray(doc?.races) ? doc.races : []) {
      if (row?.resultAvailable === true && row?.status === "finished") {
        map.set(wall.raceKey(row), row);
      }
    }
  }
  return map;
}

function practicalTickets(record = {}) {
  return wall.tickets(
    record?.prediction?.practicalTickets ||
    record?.prediction?.practicalSelection?.tickets ||
    []
  );
}

function normalizeResult(record, results) {
  const embedded = record?.result || {};
  const embeddedTicket = wall.ticket(embedded?.resultTicket);
  if (embedded?.settled === true && embeddedTicket) {
    return {
      trifecta: {
        combination: embeddedTicket,
        payout: Math.max(0, Number(embedded?.payoutPer100 ?? embedded?.payout ?? 0))
      }
    };
  }
  return results.get(wall.raceKey(record)) || null;
}

function metric(rows) {
  let settledCount = 0;
  let hitCount = 0;
  let stake = 0;
  let returned = 0;
  for (const row of rows) {
    if (!row.result) continue;
    settledCount += 1;
    const tickets = practicalTickets(row.record);
    if (!tickets.length) continue;
    const actual = wall.ticket(row.result?.trifecta?.combination);
    const payout = Math.max(0, Number(row.result?.trifecta?.payout || 0));
    stake += tickets.length * STAKE_PER_TICKET;
    if (actual && tickets.includes(actual)) {
      hitCount += 1;
      returned += payout;
    }
  }
  return {
    raceCount: rows.length,
    settledCount,
    hitCount,
    hitRate: settledCount ? Math.round(hitCount / settledCount * 1000) / 10 : null,
    stake,
    return: returned,
    profit: returned - stake,
    recoveryRate: stake ? Math.round(returned / stake * 1000) / 10 : null
  };
}

function group(rows, keyer) {
  const map = new Map();
  for (const row of rows) {
    const key = String(keyer(row));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return Object.fromEntries([...map.entries()].map(([key, value]) => [key, metric(value)]));
}

function ranked(groups) {
  return Object.entries(groups)
    .map(([branch, stats]) => ({ branch, ...stats }))
    .filter(row => row.settledCount >= MIN_SETTLED && row.recoveryRate !== null)
    .sort((a, b) => a.recoveryRate - b.recoveryRate || b.settledCount - a.settledCount || a.branch.localeCompare(b.branch, "ja"))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const selected = predDocs.flatMap(doc => Array.isArray(doc?.predictions) ? doc.predictions : []);
  const verification = predDocs.flatMap(doc => Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : []);
  const selectedKeys = new Set(selected.map(wall.raceKey));
  const dedup = new Map();

  for (const record of [...selected, ...verification]) {
    const evidence = wall.wallEvidence(record);
    if (!evidence?.formal || evidence.state !== "壁成立" || !wall.isProspective(record)) continue;
    const row = { record, evidence, result: normalizeResult(record, results) };
    const key = wall.raceKey(record);
    const current = dedup.get(key);
    if (!current || selectedKeys.has(key)) dedup.set(key, row);
  }

  const rows = [...dedup.values()];
  const dimensions = {
    attacker: group(rows, row => `attacker:${row.evidence.attackerNo}`),
    wallCandidate: group(rows, row => `wallCandidate:${row.evidence.wallCandidateNo}`),
    grade: group(rows, row => `grade:${row.evidence.grade || "unknown"}`),
    scoreBand: group(rows, row => `scoreBand:${wall.scoreBand(row.evidence.score)}`),
    attackerGrade: group(rows, row => `attacker:${row.evidence.attackerNo}|grade:${row.evidence.grade || "unknown"}`),
    attackerScoreBand: group(rows, row => `attacker:${row.evidence.attackerNo}|scoreBand:${wall.scoreBand(row.evidence.score)}`),
    attackerWallCandidate: group(rows, row => `attacker:${row.evidence.attackerNo}|wallCandidate:${row.evidence.wallCandidateNo}`)
  };

  const rankings = Object.fromEntries(Object.entries(dimensions).map(([key, groups]) => [key, ranked(groups)]));
  const allEligible = Object.entries(rankings)
    .flatMap(([dimension, rows]) => rows.map(row => ({ dimension, ...row })))
    .sort((a, b) => a.recoveryRate - b.recoveryRate || b.settledCount - a.settledCount || a.branch.localeCompare(b.branch, "ja"));

  return {
    schemaVersion: 1,
    version: "wall-established-breakdown-v1",
    generatedAt: new Date().toISOString(),
    source: "prospective formal wall evidence after storage cutoff; 壁成立 only",
    prospectiveCutoff: wall.PROSPECTIVE_CUTOFF,
    storageSourceCommit: wall.STORAGE_SOURCE_COMMIT,
    minimumSettledForRanking: MIN_SETTLED,
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    summary: metric(rows),
    dimensions,
    rankings,
    weakestEligibleBranches: allEligible.slice(0, 30),
    interpretation: {
      retrospectiveClassificationAllowed: false,
      oldRecordsBackfilled: false,
      nextAction: "最低母数を満たす弱点枝だけを別A/Bへ回す。壁成立全体を一括で本番変更しない。"
    }
  };
}

function main() {
  const report = build(load(predictionDir), load(resultDir));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ summary: report.summary, weakestEligibleBranches: report.weakestEligibleBranches.slice(0, 12) }, null, 2));
}

if (require.main === module) main();
module.exports = { build, metric, group, ranked, MIN_SETTLED };
