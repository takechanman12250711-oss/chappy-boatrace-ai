"use strict";

const fs = require("node:fs");
const path = require("node:path");

const INPUT = path.join(__dirname, "..", "data", "stats", "improvement-review.json");
const OUTPUT = path.join(__dirname, "..", "data", "stats", "prediction-gap-report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectProposals(source) {
  const reports = Array.isArray(source?.reports) ? source.reports : [];
  const root = Array.isArray(source?.proposals) ? source.proposals : [];
  return [...root, ...reports.flatMap(report => Array.isArray(report?.proposals) ? report.proposals : [])];
}

function normalizedCandidate(proposal, index) {
  const sampleSize = number(proposal?.sampleSize ?? proposal?.samples ?? proposal?.count);
  const impact = Math.abs(number(proposal?.impact ?? proposal?.gap ?? proposal?.delta ?? proposal?.difference));
  const confidence = number(proposal?.confidence ?? proposal?.confidenceScore ?? proposal?.reliability);
  const priorityScore = Math.round((Math.min(sampleSize, 200) * 0.25 + Math.min(impact, 100) * 0.5 + Math.min(confidence, 100) * 0.25) * 10) / 10;

  return {
    id: text(proposal?.id) || `candidate-${index + 1}`,
    category: text(proposal?.category) || "未分類",
    target: text(proposal?.target) || text(proposal?.theory) || text(proposal?.condition) || "要確認",
    issue: text(proposal?.issue) || text(proposal?.reason) || text(proposal?.summary) || "実績データとのズレを確認",
    sampleSize,
    impact,
    confidence,
    priorityScore,
    evidence: proposal?.evidence ?? proposal?.metrics ?? null,
    recommendation: text(proposal?.recommendation) || text(proposal?.proposal) || "候補として確認し、承認前は反映しない",
    status: "candidate_only",
    approvalRequired: true,
    autoApply: false
  };
}

function build(source) {
  const candidates = collectProposals(source)
    .map(normalizedCandidate)
    .filter(item => item.sampleSize > 0 || item.impact > 0 || item.confidence > 0 || item.target !== "要確認")
    .sort((a, b) => b.priorityScore - a.priorityScore || b.sampleSize - a.sampleSize)
    .slice(0, 50);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "data/stats/improvement-review.json",
    mode: "analysis_only",
    predictionLogicChanged: false,
    ticketSelectionChanged: false,
    approvalRequired: true,
    autoApply: false,
    candidateCount: candidates.length,
    candidates
  };
}

function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error("improvement-review.json がありません。先に build-improvement-review.js を実行してください");
  }
  const output = build(readJson(INPUT));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`予想精度改善候補を ${output.candidateCount} 件抽出しました`);
}

if (require.main === module) main();
module.exports = { build, collectProposals, normalizedCandidate };
