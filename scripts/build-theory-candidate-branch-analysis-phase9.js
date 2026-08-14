"use strict";

const fs = require("node:fs");
const path = require("node:path");
const analysis = require("../js/theory-candidate-branch-analysis-phase9");
const performanceBuilder = require("./build-theory-performance-report");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");
const out = path.join(stats, "theory-candidate-branch-analysis-phase9.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function withoutGeneratedAt(report = {}) {
  const { generatedAt, ...semantic } = report;
  return semantic;
}

function buildReport(options = {}) {
  const collected = options.collected || performanceBuilder.collect(options);
  const phase9 = options.phase9 || load(
    path.join(stats, "theory-improvement-proposal-phase9.json"),
    {}
  );
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: "official pre-deadline cohort + theory-improvement-proposal-phase9.json",
    sourceFiles: [
      "data/predictions/YYYYMMDD.json",
      "data/results/YYYYMMDD.json",
      "data/stats/theory-improvement-proposal-phase9.json"
    ],
    analysisInputContract: performanceBuilder.ANALYSIS_INPUT_CONTRACT,
    analysisInputDiagnostics: collected.diagnostics || {},
    ...analysis.build(collected.records || [], phase9)
  };
}

function writeIfChanged(report, file = out) {
  const current = load(file, null);
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
  console.log(
    `Phase9候補枝分析：${result.report.status}／正式${result.report.formalRaceCount || 0}R／候補${result.report.candidateCount || 0}` +
    (result.changed ? "（更新）" : "（変更なし）")
  );
  return result;
}

if (require.main === module) main();
module.exports = { root, stats, out, load, withoutGeneratedAt, buildReport, writeIfChanged, main };
