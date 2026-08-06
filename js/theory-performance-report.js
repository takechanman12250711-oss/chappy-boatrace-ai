"use strict";

const skipAi = require("./skip-ai-shadow");

function pct(n, d) {
  return d ? Math.round(n / d * 1000) / 10 : null;
}

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function evaluationRows(record) {
  const rows = record?.theoryEvaluationSnapshot?.evaluations;
  return Array.isArray(rows) ? rows : [];
}

function practicalHitOf(record) {
  const result = record?.result || {};
  if (typeof result.practicalHit === "boolean") return result.practicalHit;
  if (typeof result?.review?.practicalHit === "boolean") return result.review.practicalHit;
  return null;
}

function confidenceOf(prediction) {
  const value = Number(
    prediction?.selectionScore ??
    prediction?.mainLineConfidence ??
    prediction?.confidence ??
    prediction?.practicalSelection?.selectionScore ??
    prediction?.practicalSelection?.score
  );
  return Number.isFinite(value) ? value : null;
}

function completenessOf(prediction) {
  const explicit = Number(prediction?.evidenceCompleteness);
  if (Number.isFinite(explicit)) return explicit;
  const evidence = prediction?.verificationEvidence || {};
  let points = 45;
  if (Array.isArray(evidence?.scenarios) && evidence.scenarios.length) points += 25;
  if (evidence?.marks) points += 15;
  if (prediction?.exhibition || prediction?.exhibitionData) points += 10;
  if (prediction?.weather || prediction?.raceInfo?.weather) points += 5;
  return Math.min(100, points);
}

function skipDecisionOf(record) {
  const prediction = record?.prediction || {};
  const stored = String(
    prediction?.skipAiDisplay?.decision ||
    prediction?.skipAiShadow?.decision ||
    prediction?.skipDecision?.decision ||
    prediction?.skipDecision ||
    ""
  );
  if (stored) return stored;

  const selectionScore = confidenceOf(prediction);
  const scenarioAiV6Shadow = prediction?.scenarioAiV6Shadow;
  if (selectionScore === null || !scenarioAiV6Shadow || typeof skipAi?.build !== "function") return "";
  try {
    return String(skipAi.build({
      ...prediction,
      scenarioAiV6Shadow,
      selectionScore,
      evidenceCompleteness: completenessOf(prediction)
    })?.decision || "");
  } catch {
    return "";
  }
}

function skipDecisionCorrect(decision, practicalHit) {
  if (typeof practicalHit !== "boolean") return null;
  if (decision === "skip") return practicalHit === false;
  if (decision === "bet-candidate") return practicalHit === true;
  return null;
}

function buildRows(records) {
  const rows = [];
  (Array.isArray(records) ? records : []).forEach(record => {
    if (record?.result?.settled !== true) return;
    const payout = Number(record?.result?.payout || 0);
    const scenarioHit = record?.result?.verification?.scenarioHit === true || record?.result?.verification?.structuredScenarioHit === true;
    const practicalHit = practicalHitOf(record);
    const skipDecision = skipDecisionOf(record);
    const skipCorrect = skipDecisionCorrect(skipDecision, practicalHit);

    evaluationRows(record).forEach(theory => {
      const tickets = [...new Set((Array.isArray(theory?.tickets) ? theory.tickets : []).map(normalizeTicket).filter(Boolean))];
      const used = theory?.used === true;
      const evaluated = theory?.status === "evaluated" && used && tickets.length > 0;
      const hit = evaluated && theory?.matched === true;
      const stake = evaluated ? tickets.length * 100 : 0;

      rows.push({
        raceKey: String(record?.raceKey || ""),
        jcd: String(record?.jcd || "").padStart(2, "0"),
        place: String(record?.place || ""),
        theoryKey: String(theory?.theoryKey || ""),
        label: String(theory?.label || theory?.theoryKey || ""),
        used,
        evaluated,
        ticketCount: tickets.length,
        mainTicketCount: 0,
        hit,
        scenarioHit: evaluated ? scenarioHit : false,
        practicalEvaluated: evaluated && typeof practicalHit === "boolean",
        practicalHit: evaluated && practicalHit === true,
        skipEvaluated: evaluated && typeof skipCorrect === "boolean",
        skipCorrect: evaluated && skipCorrect === true,
        stake,
        return: hit ? payout : 0
      });
    });
  });
  return rows.filter(row => row.theoryKey);
}

function summarize(rows, keyFn) {
  const groups = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: row.label,
        theoryKey: row.theoryKey,
        jcd: row.jcd,
        place: row.place,
        races: new Set(),
        uses: 0,
        evaluated: 0,
        hits: 0,
        scenarioHits: 0,
        practicalEvaluated: 0,
        practicalHits: 0,
        skipEvaluated: 0,
        skipCorrect: 0,
        stake: 0,
        return: 0,
        ticketCount: 0,
        mainTicketCount: 0
      });
    }
    const group = groups.get(key);
    group.races.add(row.raceKey);
    group.uses += row.used ? 1 : 0;
    group.evaluated += row.evaluated ? 1 : 0;
    group.hits += row.hit ? 1 : 0;
    group.scenarioHits += row.scenarioHit ? 1 : 0;
    group.practicalEvaluated += row.practicalEvaluated ? 1 : 0;
    group.practicalHits += row.practicalHit ? 1 : 0;
    group.skipEvaluated += row.skipEvaluated ? 1 : 0;
    group.skipCorrect += row.skipCorrect ? 1 : 0;
    group.stake += row.stake;
    group.return += row.return;
    group.ticketCount += row.ticketCount;
    group.mainTicketCount += row.mainTicketCount;
  });

  return [...groups.values()].map(group => ({
    key: group.key,
    label: group.label,
    theoryKey: group.theoryKey,
    jcd: group.jcd,
    place: group.place,
    raceCount: group.races.size,
    useCount: group.uses,
    evaluatedCount: group.evaluated,
    hitCount: group.hits,
    hitRate: pct(group.hits, group.evaluated),
    scenarioHitCount: group.scenarioHits,
    scenarioMatchRate: pct(group.scenarioHits, group.evaluated),
    practicalEvaluatedCount: group.practicalEvaluated,
    practicalHitCount: group.practicalHits,
    practicalHitRate: pct(group.practicalHits, group.practicalEvaluated),
    skipEvaluatedCount: group.skipEvaluated,
    skipCorrectCount: group.skipCorrect,
    skipDecisionAccuracy: pct(group.skipCorrect, group.skipEvaluated),
    stake: group.stake,
    return: group.return,
    profit: group.return - group.stake,
    recoveryRate: pct(group.return, group.stake),
    ticketCount: group.ticketCount,
    mainTicketCount: group.mainTicketCount
  })).sort((a, b) => b.evaluatedCount - a.evaluatedCount || b.raceCount - a.raceCount || a.key.localeCompare(b.key));
}

function build(records) {
  const rows = buildRows(records);
  return {
    version: "3.1.0",
    status: rows.length ? "collecting-data" : "no-data",
    sampleCount: rows.length,
    theoryCount: new Set(rows.map(row => row.theoryKey)).size,
    metricDefinitions: {
      practicalHitRate: "当該理論が評価可能だった終了レースにおける実戦厳選的中率",
      skipDecisionAccuracy: "保存済み予想から見送りAIシャドー判定を再現し、見送りなら不的中、勝負候補なら的中を正解とした精度。注意判定は対象外"
    },
    byTheory: summarize(rows, row => row.theoryKey),
    byVenueTheory: summarize(rows, row => `${row.jcd}:${row.theoryKey}`),
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { pct, normalizeTicket, evaluationRows, practicalHitOf, confidenceOf, completenessOf, skipDecisionOf, skipDecisionCorrect, buildRows, summarize, build };
