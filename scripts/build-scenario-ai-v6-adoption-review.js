"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const AB_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-ab-report.json");
const REPRO_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-reproducibility-gate.json");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-adoption-review.json");

function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function approvedAdjustments(repro = {}) {
  const rows = Array.isArray(repro?.approvalGate?.approvedCandidates)
    ? repro.approvalGate.approvedCandidates
    : [];
  return rows
    .filter(row => row?.approved === true && Number(row?.adjustment || 0) !== 0)
    .map(row => ({
      scope: String(row?.scope || ""),
      key: String(row?.key || ""),
      label: String(row?.label || row?.key || ""),
      action: String(row?.action || ""),
      adjustment: Math.max(-2, Math.min(2, Number(row?.adjustment || 0)))
    }));
}

function buildChecklist(ab = {}, adjustments = []) {
  const overall = ab?.overall || {};
  const firstHalf = ab?.firstHalf || {};
  const secondHalf = ab?.secondHalf || {};
  const regressions = Array.isArray(ab?.majorVenueRegression) ? ab.majorVenueRegression : [];
  return [
    { key: "minimum-comparisons", label: "比較可能100R以上", passed: Number(overall.comparableCount || 0) >= 100, actual: Number(overall.comparableCount || 0) },
    { key: "minimum-b-wins", label: "B勝ち30R以上", passed: Number(overall.bWins || 0) >= 30, actual: Number(overall.bWins || 0) },
    { key: "b-win-lead", label: "B勝ちがA勝ちを5勝以上上回る", passed: Number(overall.bWins || 0) - Number(overall.aWins || 0) >= 5, actual: Number(overall.bWins || 0) - Number(overall.aWins || 0) },
    { key: "first-half", label: "前半でB優勢", passed: Number(firstHalf.bWins || 0) > Number(firstHalf.aWins || 0), actual: `${Number(firstHalf.aWins || 0)}-${Number(firstHalf.bWins || 0)}` },
    { key: "second-half", label: "後半でB優勢", passed: Number(secondHalf.bWins || 0) > Number(secondHalf.aWins || 0), actual: `${Number(secondHalf.aWins || 0)}-${Number(secondHalf.bWins || 0)}` },
    { key: "venue-regression", label: "重大な場別悪化なし", passed: regressions.length === 0, actual: regressions.length },
    { key: "approved-adjustments", label: "承認候補の補正内容あり", passed: adjustments.length > 0, actual: adjustments.length }
  ];
}

function buildReview(ab = {}, repro = {}) {
  const adjustments = approvedAdjustments(repro);
  const checklist = buildChecklist(ab, adjustments);
  const productionCandidate = ab?.productionGate?.productionCandidate === true;
  const eligibleForHumanReview = productionCandidate && checklist.every(row => row.passed);
  const overall = ab?.overall || {};
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "scenario-ai-v6-ab-report + scenario-ai-v6-reproducibility-gate",
    status: eligibleForHumanReview ? "awaiting-human-approval" : "collecting-evidence",
    summary: {
      comparableCount: Number(overall.comparableCount || 0),
      aWins: Number(overall.aWins || 0),
      bWins: Number(overall.bWins || 0),
      ties: Number(overall.ties || 0),
      bWinLead: Number(overall.bWins || 0) - Number(overall.aWins || 0),
      bExactLift: Number(overall.bExactLift || 0),
      bFirstHitLift: Number(overall.bFirstHitLift || 0)
    },
    firstHalf: ab?.firstHalf || {},
    secondHalf: ab?.secondHalf || {},
    majorVenueRegression: Array.isArray(ab?.majorVenueRegression) ? ab.majorVenueRegression : [],
    approvedAdjustments: adjustments,
    checklist,
    missingConditions: checklist.filter(row => !row.passed).map(row => row.label),
    humanApprovalRequired: true,
    humanApproved: false,
    adoptionAllowed: false,
    candidateFingerprintRequired: true,
    automaticApplication: false,
    usableForPrediction: false
  };
}

function main() {
  const report = buildReview(readJson(AB_PATH), readJson(REPRO_PATH));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6採用判断：${report.status}／比較${report.summary.comparableCount}R`);
}

if (require.main === module) main();
module.exports = { buildReview, buildChecklist, approvedAdjustments };
