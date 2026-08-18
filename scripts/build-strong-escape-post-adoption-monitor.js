"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const productionSelector = require("../js/practical-selection");

const START_DATE = "20260812";
const ADOPTION_PRS = [320, 322];
const ADOPTION_MERGED_AT = "2026-08-12T04:43:06Z";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const outputPath = path.join(process.cwd(), "data", "stats", "strong-escape-post-adoption-monitor.json");

function loadSelectorBeforeStrongEscapeTrim() {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  const marker = "const STRONG_ESCAPE_MINIMUM_SCORE =\n    80;";
  if (!original.includes(marker)) {
    throw new Error("strong escape minimum score marker not found");
  }
  const patched = original.replace(
    marker,
    "const STRONG_ESCAPE_MINIMUM_SCORE =\n    Number.POSITIVE_INFINITY;"
  );
  if (patched === original) {
    throw new Error("strong escape counterfactual patch was not applied");
  }
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  if (isolated.exports.STRONG_ESCAPE_MINIMUM_SCORE !== Number.POSITIVE_INFINITY) {
    throw new Error("strong escape counterfactual selector was not disabled");
  }
  return isolated.exports;
}

const selectorBeforeStrongEscapeTrim = loadSelectorBeforeStrongEscapeTrim();

function rowsOf(data) {
  return [...(data.predictions || []), ...(data.verificationPredictions || [])];
}

function ticketOf(value) {
  const numbers = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return numbers.length >= 3 ? numbers.slice(0, 3).join("-") : "";
}

function capturedAtOf(row) {
  return String(
    row?.capturedAt ||
    row?.prediction?.preRaceConditions?.capturedAt ||
    row?.preRaceConditions?.capturedAt ||
    ""
  );
}

function isPostAdoption(row) {
  const captured = Date.parse(capturedAtOf(row));
  const adopted = Date.parse(ADOPTION_MERGED_AT);
  return Number.isFinite(captured) && Number.isFinite(adopted) && captured >= adopted;
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
    changedRaces: 0,
    trimAppliedRaces: 0,
    veryStrongTrimRaces: 0,
    productionHits: 0,
    counterfactualHits: 0,
    gains: 0,
    losses: 0,
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
  if (sample.changed) stats.changedRaces += 1;
  if (sample.trimApplied) stats.trimAppliedRaces += 1;
  if (sample.veryStrongTrim) stats.veryStrongTrimRaces += 1;
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
  if (!sample.productionHit && sample.counterfactualHit) stats.losses += 1;
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
      add(total, { observedRows: 1, comparable: false });
      add(byDate[date], { observedRows: 1, comparable: false });
      if (!isPostAdoption(row) || row?.result?.settled !== true) continue;

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

      const production = productionSelector.select(global.createPrediction(input));
      const counterfactual = selectorBeforeStrongEscapeTrim.select(global.createPrediction(input));
      const productionTickets = (production.tickets || []).map(ticketOf).filter(Boolean);
      const counterfactualTickets = (counterfactual.tickets || []).map(ticketOf).filter(Boolean);
      const productionSet = new Set(productionTickets);
      const counterfactualSet = new Set(counterfactualTickets);
      const changed =
        [...productionSet].some(ticket => !counterfactualSet.has(ticket)) ||
        [...counterfactualSet].some(ticket => !productionSet.has(ticket));
      const trim = production?.expansionSummary?.strongEscapeTrim || null;
      const trimApplied = trim?.applied === true;
      const veryStrongTrim = trimApplied && Number(trim.maximumAlternateHeadCount) === 0;

      if (changed && !trimApplied) {
        throw new Error(`${raceKey}: selection changed without strongEscapeTrim audit evidence`);
      }

      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        settledPostAdoptionRaces: 1,
        comparable: true,
        changed,
        trimApplied,
        veryStrongTrim,
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
    }
  }

  const report = {
    schemaVersion: 1,
    version: "strong-escape-post-adoption-monitor-v1",
    generatedAt: new Date().toISOString(),
    adoptionPrs: ADOPTION_PRS,
    adoptionMergedAt: ADOPTION_MERGED_AT,
    startDate: START_DATE,
    latestDate,
    method: "replay only rows captured at/after PR #322 merge; A=current production selector with #320/#322 strong-escape trims, B=in-memory counterfactual disabling only STRONG_ESCAPE_MINIMUM_SCORE so both trims are removed while all other current-main selection logic reruns normally",
    productionChanged: false,
    automaticApplication: false,
    interpretation: "Positive hit/profit delta means the adopted strong-escape trim policy outperformed the same current-main replay without the #320/#322 trim family.",
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

module.exports = {
  START_DATE,
  ADOPTION_MERGED_AT,
  build,
  finalize,
  isPostAdoption,
  loadSelectorBeforeStrongEscapeTrim
};
