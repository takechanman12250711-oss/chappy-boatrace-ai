"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const productionSelector = require("../js/practical-selection");

const START_DATE = "20260813";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");

const OUTER_MARKER = [
  "const weakOuterHead =",
  "          (headCourse === 5 || headCourse === 6) &&",
  "          numeric(row.priorityScore, 0) < 80;"
].join("\n");
const TWO_MARKER = [
  "row.selectionTier === \"展開追加\" &&",
  "              headCourse === 2 &&",
  "              numeric(row.priorityScore, 0) < 80"
].join("\n");

function loadCounterfactual({ disableOuter = false, disableTwo = false } = {}) {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  let patched = original;
  if (disableOuter) {
    if (!patched.includes(OUTER_MARKER)) throw new Error("outer marker not found");
    patched = patched.replace(OUTER_MARKER, "const weakOuterHead = false;");
  }
  if (disableTwo) {
    if (!patched.includes(TWO_MARKER)) throw new Error("two marker not found");
    patched = patched.replace(TWO_MARKER, [
      "false &&",
      "              row.selectionTier === \"展開追加\" &&",
      "              headCourse === 2 &&",
      "              numeric(row.priorityScore, 0) < 80"
    ].join("\n"));
  }
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  return isolated.exports;
}

const withoutOuter = loadCounterfactual({ disableOuter: true });
const withoutTwo = loadCounterfactual({ disableTwo: true });
const withoutBoth = loadCounterfactual({ disableOuter: true, disableTwo: true });

function rowsOf(data) {
  return [...(data.predictions || []), ...(data.verificationPredictions || [])];
}
function ticketOf(value) {
  const numbers = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return numbers.length >= 3 ? numbers.slice(0, 3).join("-") : "";
}
function predictionInput(row) {
  const frozen = row?.prediction?.preRaceConditions || row?.preRaceConditions;
  if (!frozen || !Array.isArray(frozen.boats) || frozen.boats.length < 5) return null;
  return {
    ...frozen,
    entries: frozen.boats.map(boat => ({ ...boat, waku: boat.boatNo })),
    boats: frozen.boats,
    date: row.date,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    place: row.place,
    stadiumName: row.place,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    deadlineAt: row.deadlineAt,
    weather: frozen.weather || {}
  };
}
function empty() {
  return { races: 0, changedRaces: 0, productionHits: 0, counterfactualHits: 0, gains: 0, losses: 0, productionStake: 0, counterfactualStake: 0, productionReturn: 0, counterfactualReturn: 0, addedTickets: 0, winningRestoredTickets: 0 };
}
function rate(v, d) { return d ? Math.round((v / d) * 1000) / 10 : null; }
function finalize(s) {
  const productionProfit = s.productionReturn - s.productionStake;
  const counterfactualProfit = s.counterfactualReturn - s.counterfactualStake;
  return { ...s, productionHitRate: rate(s.productionHits, s.races), counterfactualHitRate: rate(s.counterfactualHits, s.races), productionRecoveryRate: rate(s.productionReturn, s.productionStake), counterfactualRecoveryRate: rate(s.counterfactualReturn, s.counterfactualStake), hitDelta: s.productionHits - s.counterfactualHits, stakeDelta: s.productionStake - s.counterfactualStake, returnDelta: s.productionReturn - s.counterfactualReturn, profitDelta: productionProfit - counterfactualProfit, productionProfit, counterfactualProfit };
}
function score(stats, production, counterfactual, actual, payout) {
  const p = new Set((production.tickets || []).map(ticketOf).filter(Boolean));
  const c = new Set((counterfactual.tickets || []).map(ticketOf).filter(Boolean));
  const restored = [...c].filter(ticket => !p.has(ticket));
  const removed = [...p].filter(ticket => !c.has(ticket));
  const ph = p.has(actual), ch = c.has(actual);
  stats.races += 1;
  if (restored.length || removed.length) stats.changedRaces += 1;
  if (ph) { stats.productionHits += 1; stats.productionReturn += payout; }
  if (ch) { stats.counterfactualHits += 1; stats.counterfactualReturn += payout; }
  if (ph && !ch) stats.gains += 1;
  if (!ph && ch) stats.losses += 1;
  stats.productionStake += p.size * 100;
  stats.counterfactualStake += c.size * 100;
  stats.addedTickets += restored.length;
  if (restored.includes(actual)) stats.winningRestoredTickets += 1;
}

function build() {
  const comparisons = { withoutOuter: empty(), withoutTwo: empty(), withoutBoth: empty() };
  const byDate = {};
  const seen = new Set();
  for (const filename of fs.readdirSync(predictionDirectory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    const date = filename.slice(0, 8);
    if (date < START_DATE) continue;
    byDate[date] ||= { withoutOuter: empty(), withoutTwo: empty(), withoutBoth: empty() };
    const data = JSON.parse(fs.readFileSync(path.join(predictionDirectory, filename), "utf8"));
    for (const row of rowsOf(data)) {
      if (row?.result?.settled !== true) continue;
      const key = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
      const input = predictionInput(row);
      if (!actual || !input) continue;
      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const production = productionSelector.select(global.createPrediction(input));
      const scenarios = {
        withoutOuter: withoutOuter.select(global.createPrediction(input)),
        withoutTwo: withoutTwo.select(global.createPrediction(input)),
        withoutBoth: withoutBoth.select(global.createPrediction(input))
      };
      for (const name of Object.keys(scenarios)) {
        score(comparisons[name], production, scenarios[name], actual, payout);
        score(byDate[date][name], production, scenarios[name], actual, payout);
      }
    }
  }
  return {
    schemaVersion: 1,
    version: "weak-independent-component-monitor-v1",
    startDate: START_DATE,
    method: "A=current production; three counterfactuals revert only #325 outer-course prune, only #327 course2 prune, or both, with all downstream current-main logic rerun",
    productionChanged: false,
    comparisons: Object.fromEntries(Object.entries(comparisons).map(([k, v]) => [k, finalize(v)])),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, group]) => [date, Object.fromEntries(Object.entries(group).map(([k, v]) => [k, finalize(v)]))]))
  };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));
module.exports = { build, loadCounterfactual };
