"use strict";

const fs = require("node:fs");
const path = require("node:path");
const base = require("./build-exhibition-foot-branch-report");

const root = path.resolve(__dirname, "..");
const predDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "exhibition-rank3plus-breakdown.json");
const MIN_SETTLED = 10;

function ticket(v) {
  const s = String(v?.ticket || v || "").trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(s) && new Set(s.split("-")).size === 3 ? s : "";
}
function tickets(r = {}) {
  return [...new Set((r?.prediction?.practicalTickets || []).map(ticket).filter(Boolean))];
}
function key(r = {}) {
  return `${r.date}-${String(r.jcd).padStart(2, "0")}-${Number(r.raceNo)}`;
}
function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).sort().map(n => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")));
}
function resultMap(docs) {
  const m = new Map();
  for (const d of docs) for (const r of (d.races || [])) if (r.resultAvailable && r.status === "finished") m.set(key(r), r);
  return m;
}
function sourceRows(docs) {
  const m = new Map();
  for (const d of docs) for (const name of ["predictions", "verificationPredictions"]) for (const r of (d[name] || [])) {
    const k = key(r);
    if (!k) continue;
    if (name === "predictions" || !m.has(k)) m.set(k, r);
  }
  return [...m.values()];
}
function summarize(rows, rm) {
  let settledCount = 0, hitCount = 0, stake = 0, returned = 0;
  for (const r of rows) {
    const rr = rm.get(key(r));
    if (!rr) continue;
    settledCount += 1;
    const ts = tickets(r);
    stake += ts.length * 100;
    const actual = ticket(rr?.trifecta?.combination);
    if (actual && ts.includes(actual)) {
      hitCount += 1;
      returned += Math.max(0, Number(rr?.trifecta?.payout || 0));
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
function group(rows, rm, keyer) {
  const map = new Map();
  for (const r of rows) {
    const k = String(keyer(r));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return Object.fromEntries([...map.entries()].map(([k, v]) => [k, summarize(v, rm)]));
}
function rank(groups) {
  return Object.entries(groups)
    .map(([branch, stats]) => ({ branch, ...stats }))
    .filter(x => x.settledCount >= MIN_SETTLED && x.recoveryRate !== null)
    .sort((a, b) => a.recoveryRate - b.recoveryRate || b.settledCount - a.settledCount || a.branch.localeCompare(b.branch, "ja"))
    .map((x, i) => ({ rank: i + 1, ...x }));
}
function signal(e) {
  if (e.alert && !e.confirm) return "alert-only";
  if (e.confirm && !e.alert) return "confirm-only";
  if (e.confirm && e.alert) return "confirm+alert";
  return "neutral";
}
function build(pd, rd) {
  const rm = resultMap(rd);
  const all = sourceRows(pd);
  const target = all.filter(r => {
    const e = base.evidence(r);
    return e.formal && e.rank >= 3;
  });
  const dimensions = {
    exactRank: group(target, rm, r => `rank:${base.evidence(r).rank}`),
    attacker: group(target, rm, r => `attacker:${base.evidence(r).attackBoatNo}`),
    signal: group(target, rm, r => `signal:${signal(base.evidence(r))}`),
    attackerSignal: group(target, rm, r => `attacker:${base.evidence(r).attackBoatNo}|signal:${signal(base.evidence(r))}`),
    rankSignal: group(target, rm, r => `rank:${base.evidence(r).rank}|signal:${signal(base.evidence(r))}`),
    venue: group(target, rm, r => `jcd:${String(r.jcd).padStart(2, "0")}`)
  };
  const rankings = Object.fromEntries(Object.entries(dimensions).map(([k, v]) => [k, rank(v)]));
  const weakest = Object.entries(rankings)
    .flatMap(([dimension, rows]) => rows.map(row => ({ dimension, ...row })))
    .sort((a, b) => a.recoveryRate - b.recoveryRate || b.settledCount - a.settledCount || a.branch.localeCompare(b.branch, "ja"));
  return {
    schemaVersion: 1,
    version: "exhibition-rank3plus-breakdown-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    minimumSettledForRanking: MIN_SETTLED,
    summary: summarize(target, rm),
    dimensions,
    rankings,
    weakestEligibleBranches: weakest.slice(0, 30),
    interpretation: {
      retrospectiveInferenceAllowed: false,
      nextAction: "最低母数を満たす弱点枝だけを別A/Bへ送る。展示3位以下全体を一括変更しない。"
    }
  };
}
function main() {
  const report = build(load(predDir), load(resultDir));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ summary: report.summary, weakestEligibleBranches: report.weakestEligibleBranches.slice(0, 12) }, null, 2));
}
if (require.main === module) main();
module.exports = { build, summarize, rank, MIN_SETTLED };
