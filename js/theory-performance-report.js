"use strict";

const skipAi = require("./skip-ai-shadow");
const scenarioAi = require("./scenario-ai-v6-shadow");

function pct(n, d) { return d ? Math.round(n / d * 1000) / 10 : null; }
function normalizeTicket(value) { const boats = String(value || "").match(/[1-6]/g) || []; return boats.length >= 3 ? boats.slice(0, 3).join("-") : ""; }
function evaluationRows(record) { const rows = record?.theoryEvaluationSnapshot?.evaluations; return Array.isArray(rows) ? rows : []; }
function predictionOf(record) { return record?.prediction && typeof record.prediction === "object" ? record.prediction : (record || {}); }
function practicalHitOf(record) { const result = record?.result || {}; if (typeof result.practicalHit === "boolean") return result.practicalHit; if (typeof result?.review?.practicalHit === "boolean") return result.review.practicalHit; return null; }
function confidenceOf(prediction) { const value = Number(prediction?.selectionScore ?? prediction?.mainLineConfidence ?? prediction?.confidence ?? prediction?.practicalSelection?.selectionScore ?? prediction?.practicalSelection?.score); return Number.isFinite(value) ? value : null; }
function completenessOf(prediction) { const explicit = Number(prediction?.evidenceCompleteness); if (Number.isFinite(explicit)) return explicit; const evidence = prediction?.verificationEvidence || {}; let points = 45; if (Array.isArray(evidence?.scenarios) && evidence.scenarios.length) points += 25; if (evidence?.marks) points += 15; if (prediction?.exhibition || prediction?.exhibitionData) points += 10; if (prediction?.weather || prediction?.raceInfo?.weather) points += 5; return Math.min(100, points); }
function scenarioShadowOf(prediction) { if (prediction?.scenarioAiV6Shadow?.scenarios?.length) return prediction.scenarioAiV6Shadow; if (typeof scenarioAi?.build !== "function") return null; try { const built = scenarioAi.build(prediction || {}); return built?.scenarios?.length ? built : null; } catch { return null; } }
function skipDecisionOf(record) { const prediction = predictionOf(record); const stored = String(prediction?.skipAiDisplay?.decision || prediction?.skipAiShadow?.decision || prediction?.skipDecision?.decision || prediction?.skipDecision || ""); if (stored) return stored; const selectionScore = confidenceOf(prediction); const scenarioAiV6Shadow = scenarioShadowOf(prediction); if (selectionScore === null || !scenarioAiV6Shadow || typeof skipAi?.build !== "function") return ""; try { return String(skipAi.build({ ...prediction, scenarioAiV6Shadow, selectionScore, evidenceCompleteness: completenessOf(prediction) })?.decision || ""); } catch { return ""; } }
function skipDecisionCorrect(decision, practicalHit) { if (typeof practicalHit !== "boolean") return null; if (decision === "skip") return practicalHit === false; if (decision === "bet-candidate") return practicalHit === true; return null; }

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
      rows.push({ raceKey: String(record?.raceKey || ""), jcd: String(record?.jcd || "").padStart(2, "0"), place: String(record?.place || ""), theoryKey: String(theory?.theoryKey || ""), label: String(theory?.label || theory?.theoryKey || ""), used, evaluated, ticketCount: tickets.length, mainTicketCount: 0, hit, scenarioHit: evaluated ? scenarioHit : false, practicalEvaluated: evaluated && typeof practicalHit === "boolean", practicalHit: evaluated && practicalHit === true, skipEvaluated: evaluated && typeof skipCorrect === "boolean", skipCorrect: evaluated && skipCorrect === true, stake, return: hit ? payout : 0 });
    });
  });
  return rows.filter(row => row.theoryKey);
}

function summarize(rows, keyFn) {
  const groups = new Map();
  rows.forEach(row => {
    const key = keyFn(row); if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, label: row.label, theoryKey: row.theoryKey, jcd: row.jcd, place: row.place, races: new Set(), uses: 0, evaluated: 0, hits: 0, scenarioHits: 0, practicalEvaluated: 0, practicalHits: 0, skipEvaluated: 0, skipCorrect: 0, stake: 0, return: 0, ticketCount: 0, mainTicketCount: 0 });
    const group = groups.get(key); group.races.add(row.raceKey); group.uses += row.used ? 1 : 0; group.evaluated += row.evaluated ? 1 : 0; group.hits += row.hit ? 1 : 0; group.scenarioHits += row.scenarioHit ? 1 : 0; group.practicalEvaluated += row.practicalEvaluated ? 1 : 0; group.practicalHits += row.practicalHit ? 1 : 0; group.skipEvaluated += row.skipEvaluated ? 1 : 0; group.skipCorrect += row.skipCorrect ? 1 : 0; group.stake += row.stake; group.return += row.return; group.ticketCount += row.ticketCount; group.mainTicketCount += row.mainTicketCount;
  });
  return [...groups.values()].map(group => ({ key: group.key, label: group.label, theoryKey: group.theoryKey, jcd: group.jcd, place: group.place, raceCount: group.races.size, useCount: group.uses, evaluatedCount: group.evaluated, hitCount: group.hits, hitRate: pct(group.hits, group.evaluated), scenarioHitCount: group.scenarioHits, scenarioMatchRate: pct(group.scenarioHits, group.evaluated), practicalEvaluatedCount: group.practicalEvaluated, practicalHitCount: group.practicalHits, practicalHitRate: pct(group.practicalHits, group.practicalEvaluated), skipEvaluatedCount: group.skipEvaluated, skipCorrectCount: group.skipCorrect, skipDecisionAccuracy: pct(group.skipCorrect, group.skipEvaluated), stake: group.stake, return: group.return, profit: group.return - group.stake, recoveryRate: pct(group.return, group.stake), ticketCount: group.ticketCount, mainTicketCount: group.mainTicketCount })).sort((a, b) => b.evaluatedCount - a.evaluatedCount || b.raceCount - a.raceCount || a.key.localeCompare(b.key));
}

function actionOf(row) {
  const n = Number(row?.evaluatedCount || 0);
  const hit = Number(row?.practicalHitRate);
  const recovery = Number(row?.recoveryRate);
  if (n < 20) return { action: "collect-more", confidence: "low", reason: `評価${n}件のため判断保留` };
  if (recovery >= 100 && hit >= 20) return { action: "strengthen-candidate", confidence: n >= 50 ? "high" : "medium", reason: `回収率${recovery}%・実戦的中率${hit}%` };
  if (recovery >= 70 || hit >= 20) return { action: "maintain", confidence: n >= 50 ? "high" : "medium", reason: `回収率${recovery}%・実戦的中率${hit}%` };
  return { action: "weaken-candidate", confidence: n >= 50 ? "high" : "medium", reason: `回収率${recovery}%・実戦的中率${hit}%` };
}

function actionRanking(byTheory) {
  const rows = (Array.isArray(byTheory) ? byTheory : []).map(row => ({ theoryKey: row.theoryKey, label: row.label, evaluatedCount: row.evaluatedCount, practicalHitRate: row.practicalHitRate, recoveryRate: row.recoveryRate, profit: row.profit, ...actionOf(row) }));
  const order = { "strengthen-candidate": 0, maintain: 1, "weaken-candidate": 2, "collect-more": 3 };
  return rows.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9) || (b.recoveryRate ?? -1) - (a.recoveryRate ?? -1) || (b.practicalHitRate ?? -1) - (a.practicalHitRate ?? -1));
}

function build(records) {
  const rows = buildRows(records);
  const byTheory = summarize(rows, row => row.theoryKey);
  return { version: "3.4.0", status: rows.length ? "collecting-data" : "no-data", sampleCount: rows.length, theoryCount: new Set(rows.map(row => row.theoryKey)).size, metricDefinitions: { practicalHitRate: "当該理論が評価可能だった終了レースにおける実戦厳選的中率", skipDecisionAccuracy: "保存済み予想から展開シャドーと見送りAIシャドーを再現し、見送りなら不的中、勝負候補なら的中を正解とした精度。注意判定は対象外", actionRanking: "評価20件未満は判断保留。20件以上で回収率100%以上かつ実戦的中率20%以上を強化候補、回収率70%以上または実戦的中率20%以上を維持、それ以外を弱化候補として監視。自動適用はしない。" }, byTheory, theoryActionRanking: actionRanking(byTheory), byVenueTheory: summarize(rows, row => `${row.jcd}:${row.theoryKey}`), usableForPrediction: false, automaticApplication: false };
}

module.exports = { pct, normalizeTicket, evaluationRows, predictionOf, practicalHitOf, confidenceOf, completenessOf, scenarioShadowOf, skipDecisionOf, skipDecisionCorrect, buildRows, summarize, actionOf, actionRanking, build };
