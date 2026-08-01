"use strict";

const DEFAULT_TEMPERATURE = 12;
const SCENARIO_KEYS = ["inEscape", "course2Sashi", "course3Attack", "course4Kado"];

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scenarioKey(row = {}, index = 0) {
  return String(
    row.key || row.id || row.type || row.scenarioKey || SCENARIO_KEYS[index] || `scenario-${index + 1}`
  );
}

function scenarioLabel(row = {}, index = 0) {
  return String(row.label || row.title || row.name || scenarioKey(row, index));
}

function scenarioScore(row = {}) {
  return finiteNumber(
    row.score ?? row.confidence ?? row成立度 ?? row.total ?? row.priorityScore,
    0
  );
}

function normalizeScenarios(input = []) {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.scenarios)
      ? input.scenarios
      : [];

  return source
    .map((row, index) => ({
      key: scenarioKey(row, index),
      label: scenarioLabel(row, index),
      score: scenarioScore(row),
      originalIndex: index
    }))
    .filter((row) => row.score > 0);
}

function softmax(rows, temperature = DEFAULT_TEMPERATURE) {
  if (!rows.length) return [];
  const safeTemperature = Math.max(1, finiteNumber(temperature, DEFAULT_TEMPERATURE));
  const maxScore = Math.max(...rows.map((row) => row.score));
  const weighted = rows.map((row) => ({
    ...row,
    weight: Math.exp((row.score - maxScore) / safeTemperature)
  }));
  const total = weighted.reduce((sum, row) => sum + row.weight, 0) || 1;

  return weighted.map((row) => ({
    ...row,
    relativeLikelihood: Math.round((row.weight / total) * 1000) / 10
  }));
}

function ambiguityLevel(gap) {
  if (gap >= 25) return "clear";
  if (gap >= 12) return "lean";
  return "mixed";
}

function analyze(input, options = {}) {
  const rows = softmax(normalizeScenarios(input), options.temperature)
    .sort((a, b) =>
      b.relativeLikelihood - a.relativeLikelihood ||
      b.score - a.score ||
      a.originalIndex - b.originalIndex
    );

  if (!rows.length) {
    return {
      version: "5-shadow-1",
      status: "insufficient-data",
      scenarios: [],
      leader: null,
      runnerUp: null,
      likelihoodGap: 0,
      ambiguity: "unknown",
      usableForPurchase: false
    };
  }

  const leader = rows[0];
  const runnerUp = rows[1] || null;
  const likelihoodGap = Math.round(
    (leader.relativeLikelihood - (runnerUp?.relativeLikelihood || 0)) * 10
  ) / 10;

  return {
    version: "5-shadow-1",
    status: "shadow-only",
    scenarios: rows.map(({ weight, originalIndex, ...row }) => row),
    leader: {
      key: leader.key,
      label: leader.label,
      score: leader.score,
      relativeLikelihood: leader.relativeLikelihood
    },
    runnerUp: runnerUp
      ? {
          key: runnerUp.key,
          label: runnerUp.label,
          score: runnerUp.score,
          relativeLikelihood: runnerUp.relativeLikelihood
        }
      : null,
    likelihoodGap,
    ambiguity: ambiguityLevel(likelihoodGap),
    usableForPurchase: false,
    note: "未校正の相対成立度。予想、印、買い目、見送り判定には使用しない。"
  };
}

module.exports = {
  DEFAULT_TEMPERATURE,
  normalizeScenarios,
  softmax,
  ambiguityLevel,
  analyze
};
