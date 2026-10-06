"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/theory-ab-phase10");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");
const source = path.join(stats, "theory-improvement-proposal-phase9.json");
const candidateSource = path.join(stats, "theory-candidate-branch-analysis-phase9.json");
const approvalSource = path.join(root, "config", "theory-ab-phase10-approval.json");
const approvedSource = path.join(root, "config", "theory-ab-phase10-approved-source.json");
const output = path.join(stats, "theory-ab-phase10.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function buildReport(options = {}) {
  const approval = options.approval || load(approvalSource, {});
  const currentPhase9 = options.phase9 || load(source, {});
  const currentCandidateAnalysis = options.candidateAnalysis || load(candidateSource, {});
  const frozen = options.approvedSource || load(approvedSource, {});
  const frozenMetadataMatches = Boolean(
    approval?.approved === true &&
    frozen?.status === "frozen-approved-source" &&
    String(frozen?.approvalId || "") === String(approval?.approvalId || "") &&
    String(frozen?.frozenAt || "") === String(approval?.humanApprovedAt || "") &&
    String(frozen?.sourceCommit || "") === String(approval?.cutoff?.sourceCommit || "") &&
    frozen?.automaticApplication === false &&
    frozen?.usableForPrediction === false
  );
  const useFrozen = approval?.approved === true;
  const phase9 = useFrozen
    ? (frozenMetadataMatches ? frozen.phase9 : {})
    : currentPhase9;
  const candidateAnalysis = useFrozen
    ? (frozenMetadataMatches ? frozen.candidateAnalysis : {})
    : currentCandidateAnalysis;
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: useFrozen
      ? "config/theory-ab-phase10-approved-source.json + config/theory-ab-phase10-approval.json"
      : "theory-improvement-proposal-phase9.json + theory-candidate-branch-analysis-phase9.json + config/theory-ab-phase10-approval.json",
    approvedSourceFrozen: useFrozen,
    approvedSourceMetadataMatches: useFrozen ? frozenMetadataMatches : null,
    ...engine.build(phase9, candidateAnalysis, approval)
  };
}

function withoutGeneratedAt(report = {}) {
  const { generatedAt, ...semantic } = report;
  return semantic;
}

function writeIfChanged(report, file = output) {
  const current = load(file, null);
  // The shadow collector and result diagnostics share this frozen report.
  // A timestamp-only rewrite must not invalidate a verified result checkpoint.
  // Keep every other field in the comparison, including all approval guards.
  if (
    current &&
    JSON.stringify(withoutGeneratedAt(current)) === JSON.stringify(withoutGeneratedAt(report))
  ) return { changed: false, report: current };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  return { changed: true, report };
}

function main() {
  const result = writeIfChanged(buildReport());
  console.log(`Phase10 A/B基盤：${result.report.status}（${result.changed ? "更新" : "変更なし"}）`);
  return result.report;
}

if (require.main === module) main();
module.exports = { load, buildReport, withoutGeneratedAt, writeIfChanged, main, source, candidateSource, approvalSource, approvedSource, output };
