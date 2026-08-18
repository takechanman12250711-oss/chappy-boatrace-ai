"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const currentSelector = require("../js/practical-selection");

const START_DATE = "20260812";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");

function loadHead2PrunedSelector() {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  const marker = `if (\n          promotedHeadCourse >= 4\n        ) {`;
  if (!original.includes(marker)) {
    throw new Error("candidate90 promotedHeadCourse marker not found");
  }
  const patched = original.replace(
    marker,
    `if (\n          promotedHeadCourse === 2 ||\n          promotedHeadCourse >= 4\n        ) {`
  );
  if (patched === original) throw new Error("head2 patch not applied");
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  return isolated.exports;
}

const candidateSelector = loadHead2PrunedSelector();

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
    entries: frozen.boats,
    boats: frozen.boats,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    weather: frozen.weather || {}
  };
}

function emptyStats() {
  return {
    races: 0,
    changedRaces: 0,
    currentHits: 0,
    candidateHits: 0,
    gains: 0,
    losses: 0,
    currentStake: 0,
    candidateStake: 0,
    currentReturn: 0,
    candidateReturn: 0,
    removedTickets: 0,
    addedTickets: 0
  };
}

function add(stats, sample) {
  stats.races += 1;
  if (sample.changed) stats.changedRaces += 1;
  if (sample.currentHit) stats.currentHits += 1;
  if (sample.candidateHit) stats.candidateHits += 1;
  if (!sample.currentHit && sample.candidateHit) stats.gains += 1;
  if (sample.currentHit && !sample.candidateHit) stats.losses += 1;
  stats.currentStake += sample.currentStake;
  stats.candidateStake += sample.candidateStake;
  if (sample.currentHit) stats.currentReturn += sample.payout;
  if (sample.candidateHit) stats.candidateReturn += sample.payout;
  stats.removedTickets += sample.removedTickets;
  stats.addedTickets += sample.addedTickets;
}

function rate(value, denominator) {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function finalize(stats) {
  const currentProfit = stats.currentReturn - stats.currentStake;
  const candidateProfit = stats.candidateReturn - stats.candidateStake;
  return {
    ...stats,
    currentHitRate: rate(stats.currentHits, stats.races),
    candidateHitRate: rate(stats.candidateHits, stats.races),
    currentRecoveryRate: rate(stats.currentReturn, stats.currentStake),
    candidateRecoveryRate: rate(stats.candidateReturn, stats.candidateStake),
    currentProfit,
    candidateProfit,
    hitDelta: stats.candidateHits - stats.currentHits,
    stakeDelta: stats.candidateStake - stats.currentStake,
    returnDelta: stats.candidateReturn - stats.currentReturn,
    profitDelta: candidateProfit - currentProfit
  };
}

function build() {
  const total = emptyStats();
  const byDate = {};
  const seen = new Set();
  const changedRows = [];
  let latestDate = null;

  for (const filename of fs.readdirSync(predictionDirectory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    const date = filename.slice(0, 8);
    if (date < START_DATE) continue;
    latestDate = date;
    byDate[date] ||= emptyStats();
    const data = JSON.parse(fs.readFileSync(path.join(predictionDirectory, filename), "utf8"));

    for (const row of rowsOf(data)) {
      if (row?.result?.settled !== true) continue;
      const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(raceKey)) continue;
      seen.add(raceKey);

      const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
      const input = predictionInput(row);
      if (!actual || !input) continue;

      const current = currentSelector.select(global.createPrediction(input));
      const candidate = candidateSelector.select(global.createPrediction(input));
      const currentTickets = (current.tickets || []).map(ticketOf).filter(Boolean);
      const candidateTickets = (candidate.tickets || []).map(ticketOf).filter(Boolean);
      const currentSet = new Set(currentTickets);
      const candidateSet = new Set(candidateTickets);
      const removed = [...currentSet].filter(ticket => !candidateSet.has(ticket));
      const added = [...candidateSet].filter(ticket => !currentSet.has(ticket));
      const changed = removed.length > 0 || added.length > 0;

      if (changed) {
        const removedRows = (current.tickets || []).filter(item => removed.includes(ticketOf(item)));
        const allRemovedAreHead2Candidate90 = removedRows.every(item => {
          const head = Number(ticketOf(item).split("-")[0]);
          return head === 2 && item?.candidatePromotion === true;
        });
        if (!allRemovedAreHead2Candidate90) {
          throw new Error(`${raceKey}: unexpected removal outside head2 candidate90`);
        }
        changedRows.push({ raceKey, date, actual, removed, added });
      }

      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        changed,
        currentHit: currentSet.has(actual),
        candidateHit: candidateSet.has(actual),
        currentStake: currentTickets.length * 100,
        candidateStake: candidateTickets.length * 100,
        payout,
        removedTickets: removed.length,
        addedTickets: added.length
      };
      add(total, sample);
      add(byDate[date], sample);
    }
  }

  const report = {
    schemaVersion: 1,
    version: "candidate90-head2-prune-validation-v1",
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    latestDate,
    candidateRule: "candidate90 promotion only: reject actual course 2 head; keep head1/head3 and existing actual-course>=4 prune unchanged",
    method: "paired current-main replay from frozen pre-race inputs; candidate is an in-memory practical-selection copy with only the candidate90 promotedHeadCourse gate changed; every downstream trim and priority-gate step reruns normally",
    productionChanged: false,
    automaticApplication: false,
    total: finalize(total),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, stats]) => [date, finalize(stats)])),
    changedRaceCount: changedRows.length,
    changedRows
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) build();

module.exports = { build, loadHead2PrunedSelector };
