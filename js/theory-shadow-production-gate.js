"use strict";

const verification = require("./theory-shadow-ab-verification");

function rate(n, d) {
  return d ? Math.round(n / d * 1000) / 10 : 0;
}

function toRows(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record?.result?.settled === true && record?.theoryShadowAb)
    .map(record => ({
      raceKey: String(record?.raceKey || ""),
      jcd: String(record?.jcd || "").padStart(2, "0"),
      result: verification.verify(record.theoryShadowAb, record?.result?.resultTicket)
    }))
    .filter(row => row.result.comparable === true)
    .sort((a, b) => a.raceKey.localeCompare(b.raceKey));
}

function summary(rows) {
  const bWins = rows.filter(row => row.result.bWin).length;
  const aWins = rows.filter(row => row.result.aWin).length;
  const draws = rows.filter(row => row.result.draw).length;
  return {
    comparableCount: rows.length,
    bWins,
    aWins,
    draws,
    bWinRate: rate(bWins, rows.length),
    aWinRate: rate(aWins, rows.length),
    advantagePoints: Math.round((rate(bWins, rows.length) - rate(aWins, rows.length)) * 10) / 10
  };
}

function build(records, custom = {}) {
  const options = {
    minimumComparable: 100,
    minimumBWins: 30,
    minimumAdvantagePoints: 5,
    maximumLosingGroupRate: 35,
    ...custom
  };
  const rows = toRows(records);
  const midpoint = Math.floor(rows.length / 2);
  const first = summary(rows.slice(0, midpoint));
  const second = summary(rows.slice(midpoint));
  const overall = summary(rows);

  const groups = new Map();
  rows.forEach(row => {
    const key = row.jcd;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  });
  const venueChecks = [...groups.entries()].map(([jcd, list]) => ({ jcd, ...summary(list) }));
  const harmfulVenueCount = venueChecks.filter(row => row.comparableCount >= 10 && row.aWinRate > options.maximumLosingGroupRate).length;

  const checks = {
    enoughComparable: overall.comparableCount >= options.minimumComparable,
    enoughBWins: overall.bWins >= options.minimumBWins,
    enoughAdvantage: overall.advantagePoints >= options.minimumAdvantagePoints,
    firstHalfBLeading: first.bWins > first.aWins,
    secondHalfBLeading: second.bWins > second.aWins,
    noMajorVenueRegression: harmfulVenueCount === 0
  };
  const candidate = Object.values(checks).every(Boolean);

  return {
    version: "1.0.0",
    status: candidate ? "production-candidate" : "collecting-evidence",
    productionCandidate: candidate,
    checks,
    safeguards: options,
    overall,
    firstHalf: first,
    secondHalf: second,
    harmfulVenueCount,
    venueChecks,
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { toRows, summary, build };
