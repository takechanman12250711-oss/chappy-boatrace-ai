"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selectorWithCandidate90 = require("../js/practical-selection");

const START_DATE = "20260812";
const ADOPTION_MERGED_AT = "2026-08-11T10:04:20Z";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const outputPath = path.join(process.cwd(), "data", "stats", "candidate90-post-adoption-monitor.json");

function loadSelectorWithoutCandidate90() {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  const marker = "const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    90;";
  if (!original.includes(marker)) {
    throw new Error("candidate90 threshold marker not found");
  }
  const patched = original.replace(
    marker,
    "const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    Number.POSITIVE_INFINITY;"
  );
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  if (isolated.exports.MINIMUM_CANDIDATE_PROMOTION_SCORE !== Number.POSITIVE_INFINITY) {
    throw new Error("candidate90 counterfactual selector was not disabled");
  }
  return isolated.exports;
}

const selectorWithoutCandidate90 = loadSelectorWithoutCandidate90();

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
    comparableRaces: 0,
    changedRaces: 0,
    withCandidate90Hits: 0,
    withoutCandidate90Hits: 0,
    gains: 0,
    losses: 0,
    withCandidate90Stake: 0,
    withoutCandidate90Stake: 0,
    withCandidate90Return: 0,
    withoutCandidate90Return: 0,
    addedTicketCount: 0
  };
}

function add(stats, sample) {
  stats.races += 1;
  if (!sample.comparable) return;
  stats.comparableRaces += 1;
  if (sample.changed) stats.changedRaces += 1;
  stats.withCandidate90Stake += sample.withStake;
  stats.withoutCandidate90Stake += sample.withoutStake;
  stats.addedTicketCount += sample.addedTicketCount;
  if (sample.withHit) {
    stats.withCandidate90Hits += 1;
    stats.withCandidate90Return += sample.payout;
  }
  if (sample.withoutHit) {
    stats.withoutCandidate90Hits += 1;
    stats.withoutCandidate90Return += sample.payout;
  }
  if (sample.withHit && !sample.withoutHit) stats.gains += 1;
  if (!sample.withHit && sample.withoutHit) stats.losses += 1;
}

function rate(value, denominator) {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function finalize(stats) {
  const withProfit = stats.withCandidate90Return - stats.withCandidate90Stake;
  const withoutProfit = stats.withoutCandidate90Return - stats.withoutCandidate90Stake;
  return {
    ...stats,
    withCandidate90HitRate: rate(stats.withCandidate90Hits, stats.comparableRaces),
    withoutCandidate90HitRate: rate(stats.withoutCandidate90Hits, stats.comparableRaces),
    withCandidate90RecoveryRate: rate(stats.withCandidate90Return, stats.withCandidate90Stake),
    withoutCandidate90RecoveryRate: rate(stats.withoutCandidate90Return, stats.withoutCandidate90Stake),
    withCandidate90Profit: withProfit,
    withoutCandidate90Profit: withoutProfit,
    hitDelta: stats.withCandidate90Hits - stats.withoutCandidate90Hits,
    stakeDelta: stats.withCandidate90Stake - stats.withoutCandidate90Stake,
    returnDelta: stats.withCandidate90Return - stats.withoutCandidate90Return,
    profitDelta: withProfit - withoutProfit
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
      const empty = {
        comparable: false,
        changed: false,
        withHit: false,
        withoutHit: false,
        withStake: 0,
        withoutStake: 0,
        payout: 0,
        addedTicketCount: 0
      };
      if (!actual || !input) {
        add(total, empty);
        add(byDate[date], empty);
        continue;
      }

      const predictionA = global.createPrediction(input);
      const predictionB = global.createPrediction(input);
      const withSelection = selectorWithCandidate90.select(predictionA);
      const withoutSelection = selectorWithoutCandidate90.select(predictionB);
      const withTickets = (withSelection.tickets || []).map(ticketOf).filter(Boolean);
      const withoutTickets = (withoutSelection.tickets || []).map(ticketOf).filter(Boolean);
      const withSet = new Set(withTickets);
      const withoutSet = new Set(withoutTickets);
      const added = [...withSet].filter(ticket => !withoutSet.has(ticket));
      const removed = [...withoutSet].filter(ticket => !withSet.has(ticket));

      const changed = added.length > 0 || removed.length > 0;
      if (changed) {
        const hasCandidate90Audit =
          (withSelection.tickets || []).some(ticket => ticket?.candidatePromotion === true) ||
          (withSelection.candidateDecisions || []).some(decision =>
            [
              "CANDIDATE_ONLY_PROMOTED",
              "SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED",
              "OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED"
            ].includes(decision?.reasonCode) ||
            (decision?.reasonCode === "PRIORITY_GATE_REPLACED" && decision?.selectionTier === "候補補完")
          );
        if (!hasCandidate90Audit) {
          throw new Error(`${raceKey}: ticket difference without candidate90 audit evidence`);
        }
      }

      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        comparable: true,
        changed,
        withHit: withSet.has(actual),
        withoutHit: withoutSet.has(actual),
        withStake: withTickets.length * 100,
        withoutStake: withoutTickets.length * 100,
        payout,
        addedTicketCount: Math.max(0, withTickets.length - withoutTickets.length)
      };
      add(total, sample);
      add(byDate[date], sample);
    }
  }

  const report = {
    schemaVersion: 1,
    version: "candidate90-post-adoption-monitor-v1",
    generatedAt: new Date().toISOString(),
    adoptionPr: 312,
    adoptionMergedAt: ADOPTION_MERGED_AT,
    startDate: START_DATE,
    latestDate,
    method: "replay current main from frozen pre-race conditions twice; counterfactual disables only MINIMUM_CANDIDATE_PROMOTION_SCORE by setting it to Infinity in an in-memory selector copy, so all downstream trims and priority-gate logic rerun normally",
    productionChanged: false,
    automaticApplication: false,
    interpretation: "Positive hit/profit delta means the adopted candidate90 promotion outperformed the same current-main replay with only candidate90 promotion disabled.",
    total: finalize(total),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, stats]) => [date, finalize(stats)]))
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) {
  console.log(JSON.stringify(build(), null, 2));
}

module.exports = { START_DATE, build, finalize, loadSelectorWithoutCandidate90 };
