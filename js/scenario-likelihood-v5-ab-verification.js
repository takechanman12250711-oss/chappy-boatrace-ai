"use strict";

const baseVerification = require("./scenario-likelihood-v5-verification");

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function verifyVariant(variant, actualScenario) {
  const scenarios = Array.isArray(variant?.scenarios) ? variant.scenarios : [];
  const leader = String(variant?.leader?.label || variant?.leader?.key || "");
  const runnerUp = String(variant?.runnerUp?.label || variant?.runnerUp?.key || "");
  const actualRow = scenarios.find(row =>
    String(row?.label || row?.key || "") === actualScenario
  );
  return {
    leaderScenario: leader,
    runnerUpScenario: runnerUp,
    leaderHit: Boolean(actualScenario && leader === actualScenario),
    topTwoHit: Boolean(actualScenario && (leader === actualScenario || runnerUp === actualScenario)),
    actualLikelihood: Number(actualRow?.relativeLikelihood || 0),
    ambiguity: String(variant?.ambiguity || "unknown")
  };
}

function verify(snapshot, result) {
  const actual = baseVerification.actualScenarioFromResult(result);
  if (!actual?.comparable) {
    return {
      comparable: false,
      reason: String(actual?.reason || "actual-scenario-unavailable"),
      status: "not-comparable"
    };
  }
  const a = verifyVariant(snapshot?.a, actual.actualScenario);
  const b = verifyVariant(snapshot?.b, actual.actualScenario);
  let winner = "tie";
  if (a.leaderHit !== b.leaderHit) winner = b.leaderHit ? "b" : "a";
  else if (a.topTwoHit !== b.topTwoHit) winner = b.topTwoHit ? "b" : "a";
  else if (a.actualLikelihood !== b.actualLikelihood) {
    winner = b.actualLikelihood > a.actualLikelihood ? "b" : "a";
  }
  return {
    comparable: true,
    status: "shadow-only",
    actualScenario: actual.actualScenario,
    winningBoat: actual.winningBoat,
    winningMethod: actual.winningMethod,
    changed: snapshot?.changed === true,
    winner,
    a,
    b,
    usableForPrediction: false,
    automaticApplication: false
  };
}

function summarizeRows(rows) {
  const comparable = (Array.isArray(rows) ? rows : []).filter(row => row?.comparable === true);
  const changed = comparable.filter(row => row.changed === true);
  const aWins = changed.filter(row => row.winner === "a").length;
  const bWins = changed.filter(row => row.winner === "b").length;
  const ties = changed.filter(row => row.winner === "tie").length;
  const aLeaderHits = comparable.filter(row => row?.a?.leaderHit === true).length;
  const bLeaderHits = comparable.filter(row => row?.b?.leaderHit === true).length;
  const aTopTwoHits = comparable.filter(row => row?.a?.topTwoHit === true).length;
  const bTopTwoHits = comparable.filter(row => row?.b?.topTwoHit === true).length;
  const samples = comparable.length;
  const changedSamples = changed.length;
  const aLeaderHitRate = samples ? aLeaderHits / samples * 100 : 0;
  const bLeaderHitRate = samples ? bLeaderHits / samples * 100 : 0;
  const aTopTwoHitRate = samples ? aTopTwoHits / samples * 100 : 0;
  const bTopTwoHitRate = samples ? bTopTwoHits / samples * 100 : 0;
  const improvement = bLeaderHitRate - aLeaderHitRate;
  const degradationRate = changedSamples ? aWins / changedSamples * 100 : 0;
  const productionCandidate = samples >= 100 && changedSamples >= 30 && improvement >= 3 && bTopTwoHitRate >= aTopTwoHitRate && degradationRate <= 1;
  return {
    samples,
    changedSamples,
    aWins,
    bWins,
    ties,
    aLeaderHitRate: round1(aLeaderHitRate),
    bLeaderHitRate: round1(bLeaderHitRate),
    leaderHitImprovement: round1(improvement),
    aTopTwoHitRate: round1(aTopTwoHitRate),
    bTopTwoHitRate: round1(bTopTwoHitRate),
    degradationRate: round1(degradationRate),
    status: productionCandidate ? "production-candidate" : "collecting-data",
    productionCandidate,
    usableForPrediction: false,
    automaticApplication: false
  };
}

function groupSummary(rows, keyBuilder) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (row?.comparable !== true) return;
    const key = keyBuilder(row);
    if (!key) return;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  });
  return [...groups.entries()]
    .map(([key, bucket]) => ({ key, ...summarizeRows(bucket) }))
    .sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key));
}

function buildSummary(rows) {
  const source = (Array.isArray(rows) ? rows : []).filter(row => row?.comparable === true);
  return {
    version: "1.0.0",
    status: "shadow-only",
    overall: summarizeRows(source),
    byVenue: groupSummary(source, row => String(row.jcd || "").padStart(2, "0")),
    byActualScenario: groupSummary(source, row => String(row.actualScenario || "")),
    safeguards: {
      minimumSamples: 100,
      minimumChangedSamples: 30,
      minimumLeaderHitImprovement: 3,
      maximumDegradationRate: 1,
      requireTopTwoNonDegradation: true
    },
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { verifyVariant, verify, summarizeRows, buildSummary };
