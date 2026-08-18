"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");

const START_DATE = "20260812";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");

function loadWithoutCandidate90() {
  const filename = path.join(process.cwd(), "js", "practical-selection.js");
  const original = fs.readFileSync(filename, "utf8");
  const marker = "const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    90;";
  if (!original.includes(marker)) throw new Error("candidate90 marker not found");
  const patched = original.replace(marker, "const MINIMUM_CANDIDATE_PROMOTION_SCORE =\n    Number.POSITIVE_INFINITY;");
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated._compile(patched, filename);
  return isolated.exports;
}

const selectorWithoutCandidate90 = loadWithoutCandidate90();

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

function emptySegment() {
  return { tickets: 0, wins: 0, return: 0, dates: {} };
}

function addSegment(map, key, date, won, payout) {
  const segment = map[key] ||= emptySegment();
  segment.tickets += 1;
  if (won) {
    segment.wins += 1;
    segment.return += payout;
  }
  segment.dates[date] ||= { tickets: 0, wins: 0, return: 0 };
  segment.dates[date].tickets += 1;
  if (won) {
    segment.dates[date].wins += 1;
    segment.dates[date].return += payout;
  }
}

function finalizeSegment(segment) {
  const stake = segment.tickets * 100;
  return {
    ...segment,
    stake,
    profit: segment.return - stake,
    recoveryRate: stake ? Math.round((segment.return / stake) * 1000) / 10 : null,
    winTicketRate: segment.tickets ? Math.round((segment.wins / segment.tickets) * 1000) / 10 : null,
    activeDateCount: Object.keys(segment.dates).filter(date => segment.dates[date].tickets > 0).length
  };
}

function priorityBand(score) {
  const value = Number(score || 0);
  if (value === 90) return "90";
  if (value === 91) return "91";
  if (value === 92) return "92";
  if (value <= 94) return "93-94";
  return "95+";
}

function build() {
  const seen = new Set();
  const byHead = {};
  const byPriority = {};
  const byHeadPriority = {};
  const byTicket = {};
  const total = emptySegment();
  let races = 0;
  let changedRaces = 0;
  let withHits = 0;
  let withoutHits = 0;
  let latestDate = null;

  for (const filename of fs.readdirSync(predictionDirectory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    const date = filename.slice(0, 8);
    if (date < START_DATE) continue;
    latestDate = date;
    const data = JSON.parse(fs.readFileSync(path.join(predictionDirectory, filename), "utf8"));

    for (const row of rowsOf(data)) {
      if (row?.result?.settled !== true) continue;
      const raceKey = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(raceKey)) continue;
      seen.add(raceKey);
      const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
      const input = predictionInput(row);
      if (!actual || !input) continue;

      races += 1;
      const withSelection = selector.select(global.createPrediction(input));
      const withoutSelection = selectorWithoutCandidate90.select(global.createPrediction(input));
      const withRows = withSelection.tickets || [];
      const withTickets = new Set(withRows.map(ticketOf).filter(Boolean));
      const withoutTickets = new Set((withoutSelection.tickets || []).map(ticketOf).filter(Boolean));
      if (withTickets.has(actual)) withHits += 1;
      if (withoutTickets.has(actual)) withoutHits += 1;

      const addedTickets = [...withTickets].filter(ticket => !withoutTickets.has(ticket));
      if (addedTickets.length) changedRaces += 1;
      const payout = Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0);

      for (const ticket of addedTickets) {
        const selectedRow = withRows.find(item => ticketOf(item) === ticket);
        const decision = (withSelection.candidateDecisions || []).find(item => item?.ticket === ticket && item?.selected === true);
        const priorityScore = Number(selectedRow?.priorityScore ?? decision?.priorityScore ?? 0);
        const head = Number(ticket.split("-")[0]);
        const won = ticket === actual;
        addSegment({ total }, "total", date, won, payout);
        addSegment(byHead, String(head), date, won, payout);
        addSegment(byPriority, priorityBand(priorityScore), date, won, payout);
        addSegment(byHeadPriority, `${head}|${priorityBand(priorityScore)}`, date, won, payout);
        addSegment(byTicket, ticket, date, won, payout);
      }
    }
  }

  const finalized = map => Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => [key, finalizeSegment(value)])
      .sort((a, b) => b[1].tickets - a[1].tickets || a[0].localeCompare(b[0]))
  );

  const headPriority = finalized(byHeadPriority);
  const zeroWinCandidates = Object.entries(headPriority)
    .filter(([, value]) => value.tickets >= 20 && value.wins === 0 && value.activeDateCount >= 3)
    .map(([segment, value]) => ({ segment, ...value }))
    .sort((a, b) => b.tickets - a.tickets);

  return {
    schemaVersion: 1,
    version: "candidate90-post-adoption-refinement-analysis-v1",
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    latestDate,
    races,
    changedRaces,
    withCandidate90Hits: withHits,
    withoutCandidate90Hits: withoutHits,
    hitDelta: withHits - withoutHits,
    marginalAddedTickets: finalizeSegment(total),
    byHead: finalized(byHead),
    byPriority: finalized(byPriority),
    byHeadPriority: headPriority,
    byTicket: finalized(byTicket),
    zeroWinCandidates,
    decisionRule: "analysis only; zero-win segment requires >=20 marginal tickets, >=3 active dates, and 0 winning tickets; no production change is authorized from this report alone",
    productionChanged: false,
    automaticApplication: false
  };
}

if (require.main === module) {
  console.log(JSON.stringify(build(), null, 2));
}

module.exports = { build, priorityBand };
