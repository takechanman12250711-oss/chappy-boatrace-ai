"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PREDICTIONS_DIR = path.join(ROOT, "data", "predictions");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-ab-report.json");

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function scoreScenario(scenario = {}, actualOrder = []) {
  const ticket = normalizeTicket(scenario?.representativeTicket);
  const predicted = ticket ? ticket.split("-").map(Number) : [];
  const exact = predicted.length === 3 && actualOrder.length === 3 && predicted.every((boat, index) => boat === actualOrder[index]);
  const firstHit = Boolean(predicted[0] && actualOrder[0] && predicted[0] === actualOrder[0]);
  const top2Hit = predicted.length >= 2 && actualOrder.length >= 2 && predicted.slice(0, 2).every(boat => actualOrder.slice(0, 2).includes(boat));
  return { ticket, exact, firstHit, top2Hit };
}

function compareRecord(record = {}) {
  const shadow = record?.scenarioAiV6ShadowAb || {};
  const verification = record?.scenarioAiV6Verification || {};
  const actualOrder = Array.isArray(verification?.actualOrder) ? verification.actualOrder.map(Number).slice(0, 3) : [];
  const aTop = shadow?.a?.scenarios?.[0] || null;
  const bTop = shadow?.b?.scenarios?.[0] || null;
  if (!aTop || !bTop || actualOrder.length < 3) return null;
  const a = scoreScenario(aTop, actualOrder);
  const b = scoreScenario(bTop, actualOrder);
  const metric = row => (row.exact ? 3 : row.firstHit ? 2 : row.top2Hit ? 1 : 0);
  const aScore = metric(a);
  const bScore = metric(b);
  return {
    raceKey: String(record?.raceKey || ""),
    date: String(record?.date || ""),
    jcd: String(record?.jcd || "").padStart(2, "0"),
    place: String(record?.place || ""),
    changed: shadow?.changed === true,
    actualOrder,
    a: { ...a, scenarioType: String(aTop?.scenarioType || "") },
    b: { ...b, scenarioType: String(bTop?.scenarioType || "") },
    winner: bScore > aScore ? "B" : aScore > bScore ? "A" : "tie"
  };
}

function summarize(rows = []) {
  const source = rows.filter(Boolean);
  const count = key => source.filter(row => row.winner === key).length;
  const aExact = source.filter(row => row.a.exact).length;
  const bExact = source.filter(row => row.b.exact).length;
  const aFirst = source.filter(row => row.a.firstHit).length;
  const bFirst = source.filter(row => row.b.firstHit).length;
  return {
    comparableCount: source.length,
    changedComparableCount: source.filter(row => row.changed).length,
    aWins: count("A"),
    bWins: count("B"),
    ties: count("tie"),
    aExactCount: aExact,
    bExactCount: bExact,
    aFirstHitCount: aFirst,
    bFirstHitCount: bFirst,
    bWinRate: source.length ? Math.round(count("B") / source.length * 1000) / 10 : 0,
    bExactLift: bExact - aExact,
    bFirstHitLift: bFirst - aFirst
  };
}

function splitRows(rows = []) {
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.raceKey).localeCompare(String(b.raceKey)));
  const midpoint = Math.ceil(sorted.length / 2);
  return { firstHalf: sorted.slice(0, midpoint), secondHalf: sorted.slice(midpoint) };
}

function buildReport(documents = []) {
  const rows = documents.flatMap(doc => (Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : []).map(compareRecord).filter(Boolean));
  const halves = splitRows(rows);
  const byVenue = [...new Set(rows.map(row => row.jcd))].map(jcd => ({ jcd, place: rows.find(row => row.jcd === jcd)?.place || "", ...summarize(rows.filter(row => row.jcd === jcd)) }));
  const overall = summarize(rows);
  const firstHalf = summarize(halves.firstHalf);
  const secondHalf = summarize(halves.secondHalf);
  const majorVenueRegression = byVenue.filter(row => row.comparableCount >= 10 && row.aWins - row.bWins >= 4);
  const productionCandidate = overall.comparableCount >= 100 && overall.bWins >= 30 && overall.bWins - overall.aWins >= 5 && firstHalf.bWins > firstHalf.aWins && secondHalf.bWins > secondHalf.aWins && majorVenueRegression.length === 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "scenarioAiV6ShadowAb + scenarioAiV6Verification",
    overall,
    firstHalf,
    secondHalf,
    byVenue,
    majorVenueRegression,
    productionGate: {
      status: productionCandidate ? "production-candidate" : "collecting-evidence",
      productionCandidate,
      minimumComparableCount: 100,
      minimumBWins: 30,
      minimumBWinLead: 5,
      requiresBothHalvesBAdvantage: true,
      requiresNoMajorVenueRegression: true
    },
    rows,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function readDocuments(directory = PREDICTIONS_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort().map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function main() {
  const report = buildReport(readDocuments());
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6 A/B：比較${report.overall.comparableCount}R／A勝ち${report.overall.aWins}／B勝ち${report.overall.bWins}`);
}

if (require.main === module) main();
module.exports = { buildReport, compareRecord, summarize, splitRows, scoreScenario };
