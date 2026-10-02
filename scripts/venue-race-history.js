"use strict";

const historyInsights = require("../js/history-insights");
const historyStats = require("../data/stats/venue-race-patterns.json");
const officialHistoryStats = require("../data/stats/race-patterns.json");
const racerVenueStarts = require("../data/stats/racer-venue-starts.json");

function loadRacerSkillStats() {
  try {
    return require("../data/stats/racer-skill-patterns.json");
  } catch {
    return { racers: {} };
  }
}

const racerSkillStats = loadRacerSkillStats();

function attachVenueRaceHistory(raceData, jcd, raceNo) {
  const historyPattern = historyInsights.getPattern(historyStats, jcd, raceNo);
  const historyTrend = historyInsights.buildTrend(
    historyPattern,
    officialHistoryStats.overall || null,
  );
  const racers = (Array.isArray(raceData?.entries) ? raceData.entries : [])
    .map(entry => {
      const registerNo = String(entry?.registerNo || "").trim();
      const stats = (officialHistoryStats.racers || {})[registerNo] || null;
      const venueStats = (racerVenueStarts.racers || {})[registerNo] || null;
      const skillHistory = racerSkillStats?.racers?.[registerNo] || null;
      if (!stats && !venueStats && !skillHistory) return null;
      const localStarts = Number(
        venueStats?.venues?.[String(jcd).padStart(2, "0")] ?? 0,
      );

      return {
        registerNo,
        racerName: stats?.racerName || entry?.racerName || "",
        skillHistory,
        samples: Number(
          stats?.starts ?? skillHistory?.windows?.all3Years?.starts ?? 0,
        ),
        localStarts,
        currentVenueStarts: localStarts,
        localReliability:
          localStarts >= 30 ? "high" : localStarts >= 12 ? "medium" : "low",
      };
    })
    .filter(racer => racer?.registerNo);

  return {
    raceData: {
      ...raceData,
      historyContext: {
        ready: Boolean(historyPattern),
        source: officialHistoryStats.source || "",
        generatedAt: officialHistoryStats.generatedAt || "",
        racers,
        venueRace: historyPattern
          ? {
              ...historyPattern,
              trend: historyTrend,
            }
          : null,
      },
    },
    historyTrend,
  };
}

module.exports = { attachVenueRaceHistory };
