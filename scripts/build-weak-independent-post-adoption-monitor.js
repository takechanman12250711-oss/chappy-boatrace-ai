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
const ADOPTION_PRS = [325, 327];
const LAST_ADOPTION_MERGED_AT = "2026-08-12T06:44:19Z";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
const outputPath = path.join(process.cwd(), "data", "stats", "weak-independent-post-adoption-monitor.json");

function loadSelectorBeforeWeakIndependentPrunes() {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  const outerMarker = [
    "const weakOuterHead =",
    "          (headCourse === 5 || headCourse === 6) &&",
    "          numeric(row.priorityScore, 0) < 80;"
  ].join("\n");
  const twoMarker = [
    "row.selectionTier === \"展開追加\" &&",
    "              headCourse === 2 &&",
    "              numeric(row.priorityScore, 0) < 80"
  ].join("\n");
  if (!original.includes(outerMarker)) throw new Error("weak outer independent prune marker not found");
  if (!original.includes(twoMarker)) throw new Error("weak two-head independent prune marker not found");
  let patched = original.replace(outerMarker, "const weakOuterHead = false;");
  patched = patched.replace(twoMarker, [
    "false &&",
    "              row.selectionTier === \"展開追加\" &&",
    "              headCourse === 2 &&",
    "              numeric(row.priorityScore, 0) < 80"
  ].join("\n"));
  if (patched === original) throw new Error("weak independent counterfactual patch was not applied");
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  return isolated.exports;
}

const selectorBeforeWeakIndependentPrunes = loadSelectorBeforeWeakIndependentPrunes();

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

function actualCourseOf(input, boatNo) {
  const boat = (input?.boats || []).find(item => Number(item?.boatNo ?? item?.number ?? item?.waku ?? 0) === Number(boatNo));
  return Number(boat?.actualCourse ?? boat?.course ?? boat?.entryCourse ?? boat?.waku ?? boatNo) || Number(boatNo);
}

function emptyStats() {
  return {
    observedRows: 0,
    settledPostAdoptionRaces: 0,
    comparableRaces: 0,
    changedRaces: 0,
    productionHits: 0,
    counterfactualHits: 0,
    gains: 0,
    losses: 0,
    productionStake: 0,
    counterfactualStake: 0,
    productionReturn: 0,
    counterfactualReturn: 0,
    productionTicketCount: 0,
    counterfactualTicketCount: 0,
    restoredWeakTicketCount: 0,
    restoredCourse2Count: 0,
    restoredCourse5Count: 0,
    restoredCourse6Count: 0,
    restoredWinningTicketCount: 0
  };
}

function add(stats, sample) {
  stats.observedRows += sample.observedRows || 0;
  stats.settledPostAdoptionRaces += sample.settledPostAdoptionRaces || 0;
  if (!sample.comparable) return;
  stats.comparableRaces += 1;
  if (sample.changed) stats.changedRaces += 1;
  stats.productionStake += sample.productionStake;
  stats.counterfactualStake += sample.counterfactualStake;
  stats.productionTicketCount += sample.productionTicketCount;
  stats.counterfactualTicketCount += sample.counterfactualTicketCount;
  stats.restoredWeakTicketCount += sample.restoredWeakTicketCount;
  stats.restoredCourse2Count += sample.restoredCourse2Count;
  stats.restoredCourse5Count += sample.restoredCourse5Count;
  stats.restoredCourse6Count += sample.restoredCourse6Count;
  stats.restoredWinningTicketCount += sample.restoredWinningTicketCount;
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

      const production = productionSelector.select(global.createPrediction(input));
      const counterfactual = selectorBeforeWeakIndependentPrunes.select(global.createPrediction(input));
      const productionTickets = (production.tickets || []).map(ticketOf).filter(Boolean);
      const counterfactualTickets = (counterfactual.tickets || []).map(ticketOf).filter(Boolean);
      const productionSet = new Set(productionTickets);
      const counterfactualSet = new Set(counterfactualTickets);
      const restored = [...counterfactualSet].filter(ticket => !productionSet.has(ticket));
      const removedByCounterfactual = [...productionSet].filter(ticket => !counterfactualSet.has(ticket));
      const changed = restored.length > 0 || removedByCounterfactual.length > 0;

      const restoredCourses = restored.map(ticket => actualCourseOf(input, Number(ticket[0] || 0)));
      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);
      const sample = {
        settledPostAdoptionRaces: 1,
        comparable: true,
        changed,
        productionHit: productionSet.has(actual),
        counterfactualHit: counterfactualSet.has(actual),
        productionStake: productionTickets.length * 100,
        counterfactualStake: counterfactualTickets.length * 100,
        productionTicketCount: productionTickets.length,
        counterfactualTicketCount: counterfactualTickets.length,
        payout,
        restoredWeakTicketCount: restored.length,
        restoredCourse2Count: restoredCourses.filter(course => course === 2).length,
        restoredCourse5Count: restoredCourses.filter(course => course === 5).length,
        restoredCourse6Count: restoredCourses.filter(course => course === 6).length,
        restoredWinningTicketCount: restored.includes(actual) ? 1 : 0
      };
      add(total, sample);
      add(byDate[date], sample);
    }
  }

  const report = {
    schemaVersion: 2,
    version: "weak-independent-post-adoption-monitor-v2",
    generatedAt: new Date().toISOString(),
    adoptionPrs: ADOPTION_PRS,
    lastAdoptionMergedAt: LAST_ADOPTION_MERGED_AT,
    startDate: START_DATE,
    latestDate,
    method: "use the first complete JST day after PR #327 merge (2026-08-13) onward; A=current production selector with #325/#327 actual-course weak independent-expansion prunes, B=in-memory counterfactual disabling only the actual-course 5/6 priority<80 expansion filter and actual-course 2 priority<80 expansion trim while all other current-main selection logic reruns normally",
    productionChanged: false,
    automaticApplication: false,
    interpretation: "Positive hit/profit delta means the adopted weak-independent prune family outperformed the same current-main replay with only #325/#327 reverted.",
    total: finalize(total),
    byDate: Object.fromEntries(Object.entries(byDate).map(([date, stats]) => [date, finalize(stats)]))
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));

module.exports = { START_DATE, build, finalize, loadSelectorBeforeWeakIndependentPrunes };
