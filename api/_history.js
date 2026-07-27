"use strict";

const officialStats = require("../data/stats/race-patterns.json");
const venueRaceStats = require("../data/stats/venue-race-patterns.json");
const racerSkillStats = require("../data/stats/racer-skill-patterns.json");
const racerVenueStarts = require("../data/stats/racer-venue-starts.json");
const courseStructureStats = require("../data/stats/course-structure-patterns.json");
const historyInsights = require("../js/history-insights-base");

const MIN_VENUE_SAMPLES = 30;
const MIN_RACER_SAMPLES = 12;

function normalizeJcd(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 24
    ? String(number).padStart(2, "0")
    : "";
}

function normalizeRegisterNo(value) {
  const registerNo = String(value || "").trim();
  return /^\d{4}$/.test(registerNo) ? registerNo : "";
}

function buildRacer(registerNo, jcd) {
  const code = normalizeRegisterNo(registerNo);
  if (!code) return null;

  const official = officialStats.racers?.[code] || null;
  const skillHistory = racerSkillStats.racers?.[code] || null;
  const starts = racerVenueStarts.racers?.[code] || null;

  if (!official && !skillHistory && !starts) {
    return null;
  }

  const samples = Number(
    official?.starts ??
    skillHistory?.windows?.all3Years?.starts ??
    starts?.totalStarts ??
    0
  );
  const localStarts = Number(starts?.venues?.[jcd] ?? 0);

  return {
    ...(official || {
      registerNo: code,
      racerName: skillHistory?.racerName || ""
    }),
    skillHistory,
    samples,
    localStarts,
    currentVenueStarts: localStarts,
    localReliability:
      localStarts >= 30
        ? "high"
        : localStarts >= 12
          ? "medium"
          : "low",
    usable: samples >= MIN_RACER_SAMPLES
  };
}

function buildHistoryContext({
  jcd,
  raceNo,
  entries = []
} = {}) {
  const venueCode = normalizeJcd(jcd);
  if (!venueCode) {
    return {
      ready: false,
      source: "",
      warnings: ["会場コードを確認できません"]
    };
  }

  const venue = officialStats.byVenue?.[venueCode] || null;
  const venueSamples = Number(venue?.totalRaces || 0);
  const normalizedVenue = venue
    ? {
        ...venue,
        samples: venueSamples,
        usable: venueSamples >= MIN_VENUE_SAMPLES
      }
    : null;
  const venueRacePattern = historyInsights.getPattern(
    venueRaceStats,
    venueCode,
    raceNo
  );
  const venueRace = venueRacePattern
    ? {
        ...venueRacePattern,
        trend: historyInsights.buildTrend(
          venueRacePattern,
          officialStats.overall || null
        )
      }
    : null;
  const racers = (Array.isArray(entries) ? entries : [])
    .map(entry => buildRacer(entry?.registerNo, venueCode))
    .filter(Boolean);
  const usableRacers = racers.filter(racer => racer.usable);
  const warnings = [];

  if (normalizedVenue && !normalizedVenue.usable) {
    warnings.push(
      `会場別履歴は${normalizedVenue.samples}レースのため参考表示のみです`
    );
  }
  if (racers.length && !usableRacers.length) {
    warnings.push(
      "選手別履歴はサンプル不足のため評価へ加算しません"
    );
  }

  return {
    ready: true,
    source: officialStats.source || "boatrace-official",
    generatedAt: officialStats.generatedAt || "",
    firstDate: officialStats.firstDate || "",
    lastDate: officialStats.lastDate || "",
    venue: normalizedVenue,
    venueRace,
    courseStructure: {
      overall: courseStructureStats.overall || null,
      venue: courseStructureStats.byVenue?.[venueCode] || null,
      thresholds: courseStructureStats.thresholds || null
    },
    racers,
    usableVenueHistory: Boolean(normalizedVenue?.usable),
    usableRacerHistory: usableRacers.length > 0,
    warnings,
    delivery: "api-race-compact-context"
  };
}

module.exports = {
  MIN_VENUE_SAMPLES,
  MIN_RACER_SAMPLES,
  normalizeJcd,
  normalizeRegisterNo,
  buildHistoryContext
};
