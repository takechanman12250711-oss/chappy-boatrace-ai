"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");

const START_DATE = "20260813";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const outputPath = path.join(process.cwd(), "data", "stats", "priority-gate-post-adoption-monitor.json");

function rowsOf(data) {
  return [
    ...(data.predictions || []),
    ...(data.verificationPredictions || [])
  ];
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
    comparableRaces: 0,
    changedRaces: 0,
    withGateHits: 0,
    withoutGateHits: 0,
    gains: 0,
    losses: 0,
    stake: 0,
    withGateReturn: 0,
    withoutGateReturn: 0
  };
}

function add(stats, sample) {
  stats.races += 1;
  if (!sample.comparable) return;
  stats.comparableRaces += 1;
  stats.stake += sample.stake;
  if (sample.changed) stats.changedRaces += 1;
  if (sample.withGateHit) {
    stats.withGateHits += 1;
    stats.withGateReturn += sample.payout;
  }
  if (sample.withoutGateHit) {
    stats.withoutGateHits += 1;
    stats.withoutGateReturn += sample.payout;
  }
  if (sample.withGateHit && !sample.withoutGateHit) stats.gains += 1;
  if (!sample.withGateHit && sample.withoutGateHit) stats.losses += 1;
}

function rate(value, denominator) {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function finalize(stats) {
  return {
    ...stats,
    withGateHitRate: rate(stats.withGateHits, stats.comparableRaces),
    withoutGateHitRate: rate(stats.withoutGateHits, stats.comparableRaces),
    withGateRecoveryRate: rate(stats.withGateReturn, stats.stake),
    withoutGateRecoveryRate: rate(stats.withoutGateReturn, stats.stake),
    hitDelta: stats.withGateHits - stats.withoutGateHits,
    returnDelta: stats.withGateReturn - stats.withoutGateReturn,
    profitDelta: stats.withGateReturn - stats.withoutGateReturn
  };
}

function build() {
  const total = emptyStats();
  const byDate = {};
  const seen = new Set();
  let latestDate = null;

  const files = fs.readdirSync(predictionDirectory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort();

  for (const filename of files) {
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
      const baseSample = { comparable: false, changed: false, withGateHit: false, withoutGateHit: false, stake: 0, payout: 0 };
      if (!actual || !input) {
        add(total, baseSample);
        add(byDate[date], baseSample);
        continue;
      }

      const selection = selector.select(global.createPrediction(input));
      const withGateTickets = (selection.tickets || []).map(ticketOf).filter(Boolean);
      const replacement = selection?.expansionSummary?.priorityGateReplacement || null;
      const withoutGateTickets = withGateTickets.slice();

      if (replacement?.applied === true) {
        if (withoutGateTickets[replacement.selectedIndex] !== replacement.addedTicket) {
          throw new Error(`${raceKey}: priority gate replacement audit mismatch`);
        }
        withoutGateTickets[replacement.selectedIndex] = replacement.removedTicket;
      }

      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        comparable: true,
        changed: replacement?.applied === true,
        withGateHit: withGateTickets.includes(actual),
        withoutGateHit: withoutGateTickets.includes(actual),
        stake: withGateTickets.length * 100,
        payout
      };
      add(total, sample);
      add(byDate[date], sample);
    }
  }

  const report = {
    schemaVersion: 1,
    version: "priority-gate-post-adoption-monitor-v1",
    generatedAt: new Date().toISOString(),
    adoptionPr: 340,
    adoptionMergedAt: "2026-08-13T02:40:11Z",
    startDate: START_DATE,
    latestDate,
    method: "replay current main from frozen pre-race conditions; remove only recorded priorityGateReplacement for paired counterfactual",
    productionChanged: false,
    automaticApplication: false,
    interpretation: "Positive delta means the adopted priority-gate replacement outperformed the same replay with only that replacement reverted.",
    total: finalize(total),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, stats]) => [date, finalize(stats)]))
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) {
  const report = build();
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { START_DATE, build, finalize };
