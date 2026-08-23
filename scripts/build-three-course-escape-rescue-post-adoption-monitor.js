"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const baseSelector = require("../js/practical-selection");
const rescue = require("../js/three-course-escape-rescue-fixed5");
const productionSelector = rescue.install(baseSelector);

const START_DATE = "20260824";
const ADOPTION_PR = 607;
const ADOPTION_MERGED_AT = "2026-08-23T13:05:19Z";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const outputPath = path.join(process.cwd(), "data", "stats", "three-course-escape-rescue-post-adoption-monitor.json");

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

function emptyStats() {
  return {
    observedRows: 0,
    settledPostAdoptionRaces: 0,
    comparableRaces: 0,
    rescueEligibleRaces: 0,
    rescueAppliedRaces: 0,
    productionHits: 0,
    counterfactualHits: 0,
    gains: 0,
    losses: 0,
    sameOutcomeRaces: 0,
    productionStake: 0,
    counterfactualStake: 0,
    productionReturn: 0,
    counterfactualReturn: 0,
    productionTicketCount: 0,
    counterfactualTicketCount: 0
  };
}

function add(stats, sample) {
  stats.observedRows += sample.observedRows || 0;
  stats.settledPostAdoptionRaces += sample.settledPostAdoptionRaces || 0;
  if (!sample.comparable) return;
  stats.comparableRaces += 1;
  if (sample.rescueEligible) stats.rescueEligibleRaces += 1;
  if (sample.rescueApplied) stats.rescueAppliedRaces += 1;
  stats.productionStake += sample.productionStake;
  stats.counterfactualStake += sample.counterfactualStake;
  stats.productionTicketCount += sample.productionTicketCount;
  stats.counterfactualTicketCount += sample.counterfactualTicketCount;
  if (sample.productionHit) {
    stats.productionHits += 1;
    stats.productionReturn += sample.payout;
  }
  if (sample.counterfactualHit) {
    stats.counterfactualHits += 1;
    stats.counterfactualReturn += sample.payout;
  }
  if (sample.productionHit && !sample.counterfactualHit) stats.gains += 1;
  else if (!sample.productionHit && sample.counterfactualHit) stats.losses += 1;
  else stats.sameOutcomeRaces += 1;
}

function rate(value, denominator) {
  return denominator ? Math.round((value / denominator) * 1000) / 10 : null;
}

function finalize(stats) {
  const productionProfit = stats.productionReturn - stats.productionStake;
  const counterfactualProfit = stats.counterfactualReturn - stats.counterfactualStake;
  return {
    ...stats,
    productionHitRate: rate(stats.productionHits, stats.comparableRaces),
    counterfactualHitRate: rate(stats.counterfactualHits, stats.comparableRaces),
    rescueApplicationRate: rate(stats.rescueAppliedRaces, stats.rescueEligibleRaces),
    productionRecoveryRate: rate(stats.productionReturn, stats.productionStake),
    counterfactualRecoveryRate: rate(stats.counterfactualReturn, stats.counterfactualStake),
    productionProfit,
    counterfactualProfit,
    hitDelta: stats.productionHits - stats.counterfactualHits,
    stakeDelta: stats.productionStake - stats.counterfactualStake,
    returnDelta: stats.productionReturn - stats.counterfactualReturn,
    profitDelta: productionProfit - counterfactualProfit,
    ticketCountDelta: stats.productionTicketCount - stats.counterfactualTicketCount
  };
}

function build() {
  const total = emptyStats();
  const byDate = {};
  const samples = [];
  const seen = new Set();
  let latestDate = null;

  if (!fs.existsSync(predictionDirectory)) {
    throw new Error("prediction directory not found");
  }

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
      add(total, { observedRows: 1, comparable: false });
      add(byDate[date], { observedRows: 1, comparable: false });
      if (row?.result?.settled !== true) continue;

      const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(raceKey)) continue;
      seen.add(raceKey);

      const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
      const input = predictionInput(row);
      if (!actual || !input) {
        add(total, { settledPostAdoptionRaces: 1, comparable: false });
        add(byDate[date], { settledPostAdoptionRaces: 1, comparable: false });
        continue;
      }

      const prediction = global.createPrediction(input);
      const counterfactual = baseSelector.select(prediction);
      const production = rescue.apply(prediction, counterfactual);
      const productionTickets = (production.tickets || []).map(ticketOf).filter(Boolean);
      const counterfactualTickets = (counterfactual.tickets || []).map(ticketOf).filter(Boolean);
      const productionSet = new Set(productionTickets);
      const counterfactualSet = new Set(counterfactualTickets);
      const audit = production?.expansionSummary?.threeCourseEscapeRescueFixed5 || null;
      const label = rescue.scenarioLabel(prediction, counterfactual);
      const rescueEligible = label === rescue.TARGET_LABEL;
      const rescueApplied = audit?.applied === true;
      const changed =
        productionTickets.length !== counterfactualTickets.length ||
        [...productionSet].some(ticket => !counterfactualSet.has(ticket)) ||
        [...counterfactualSet].some(ticket => !productionSet.has(ticket));

      if (changed !== rescueApplied) {
        throw new Error(`${raceKey}: rescue audit and selection delta disagree`);
      }
      if (rescueApplied && !rescueEligible) {
        throw new Error(`${raceKey}: rescue applied outside target scenario`);
      }
      if (productionTickets.length !== counterfactualTickets.length) {
        throw new Error(`${raceKey}: rescue changed ticket count`);
      }

      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        settledPostAdoptionRaces: 1,
        comparable: true,
        rescueEligible,
        rescueApplied,
        productionHit: productionSet.has(actual),
        counterfactualHit: counterfactualSet.has(actual),
        productionStake: productionTickets.length * 100,
        counterfactualStake: counterfactualTickets.length * 100,
        productionTicketCount: productionTickets.length,
        counterfactualTicketCount: counterfactualTickets.length,
        payout
      };
      add(total, sample);
      add(byDate[date], sample);

      if (rescueApplied) {
        samples.push({
          raceKey,
          date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          place: row.place || "",
          scenarioLabel: label,
          actual,
          rescueTicket: rescue.RESCUE_TICKET,
          replacedTicket: audit.replacedTicket || "",
          productionHit: sample.productionHit,
          counterfactualHit: sample.counterfactualHit,
          payoutPer100: payout,
          productionProfitDeltaVsCounterfactual:
            (sample.productionHit ? payout : 0) - (sample.counterfactualHit ? payout : 0)
        });
      }
    }
  }

  const report = {
    schemaVersion: 1,
    version: "three-course-escape-rescue-post-adoption-monitor-v1",
    generatedAt: new Date().toISOString(),
    adoptionPr: ADOPTION_PR,
    adoptionMergedAt: ADOPTION_MERGED_AT,
    startDate: START_DATE,
    latestDate,
    method: "From the first complete JST day after PR #607 merge (2026-08-24), replay each settled frozen pre-race input twice: A=current production selection with the approved 3-course attack 1-3-4 rescue, B=the same current-main practical selector before only that rescue wrapper. Compare equal-ticket-count outcomes at 100 yen per ticket. The partial adoption day 2026-08-23 is excluded to avoid mixing pre/post-merge captures.",
    productionChanged: false,
    automaticApplication: false,
    interpretation: "Positive hit/profit delta means the adopted 1-3-4 fixed-count rescue outperformed the same current-main selection without only that rescue.",
    total: finalize(total),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, stats]) => [date, finalize(stats)])),
    appliedSamples: samples
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) {
  console.log(JSON.stringify(build(), null, 2));
}

module.exports = {
  START_DATE,
  ADOPTION_MERGED_AT,
  build,
  finalize
};
