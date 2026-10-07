"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadDailyDocuments } = require("./local-water-daily-input.cjs");
const audit = require("./build-local-water-priority-selection-consistency-audit");
const clean = report => { const copy = structuredClone(report); delete copy.generatedAt; return copy; };

if (process.argv[2] === "heap-child") {
  const dir = process.argv[3];
  const source = JSON.parse(fs.readFileSync(path.join(dir, "source.json"), "utf8"));
  const docs = loadDailyDocuments(path.join(dir, "predictions"));
  const report = audit.build(source, process.argv[4] === "eager" ? [...docs] : docs);
  assert.equal(report.metrics.targetCount, 34);
  assert.equal(report.metrics.predictionMatchedCount, 33);
  assert.equal(report.metrics.resolvedPairCount, 33);
  assert.equal(report.cases[0].resolvedGap, -10);
  assert.equal(report.cases[32].resolvedGap, -20);
  assert.equal(report.cases[33].classification, "missing-prediction-record");
  assert.equal(report.productionChanged, false);
  assert.equal(report.automaticApplication, false);
  assert.equal(report.usableForPrediction, false);
  console.log(JSON.stringify({ maxRSS: process.resourceUsage().maxRSS }));
} else {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/check-local-water-priority-selection-consistency-audit.yml"), "utf8");
  assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('chappy-local-water-consistency-{0}', github.ref) || 'chappy-main-data-writers' }}"));
  assert.match(workflow, /queue: max\n\s+cancel-in-progress: false/);
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Check local water outer head priority score audit"\]\n\s+branches: \[main\]/);
  const expectedCondition = "github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository && github.event.workflow_run.event != 'pull_request' && github.event.workflow_run.event != 'pull_request_target')";
  assert.equal(workflow.match(/^    if: (.+)$/m)?.[1], expectedCondition);
  // This fixed, asserted expression is also valid JavaScript. Exercise the
  // actual condition, not a separately implemented approximation of its guards.
  const allows = new Function("github", `return (${expectedCondition});`);
  const context = { event_name: "workflow_run", repository: "owner/repo", event: { workflow_run: {
    conclusion: "success", head_branch: "main", head_repository: { full_name: "owner/repo" }, event: "push"
  } } };
  assert.equal(allows(context), true);
  for (const patch of [
    { event: "pull_request" }, { event: "pull_request_target" },
    { head_repository: { full_name: "fork/repo" } }, { head_branch: "feature" }, { conclusion: "failure" }
  ]) assert.equal(allows({ ...context, event: { workflow_run: { ...context.event.workflow_run, ...patch } } }), false);
  for (const event_name of ["push", "workflow_dispatch", "pull_request"])
    assert.equal(allows({ event_name, repository: "owner/repo", event: {} }), true,
      "explicit event behavior stays unchanged; PR Build/Save remains separately blocked");
  const guarded = workflow.split(/\n(?=      - )/).slice(1).filter(step =>
    step.includes("node scripts/build-local-water-priority-selection-consistency-audit.js") || step.includes("git push origin main"));
  assert.equal(guarded.length, 2);
  for (const step of guarded) assert.match(step, /if: github.event_name != 'pull_request'/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-priority-consistency-"));
  try {
    fs.mkdirSync(path.join(dir, "predictions"));
    const small = [], source = { version: "local-water-outer-head-priority-score-audit-v1",
      generatedAt: "2026-01-01T00:00:00Z", nextStep: "audit-local-water-priority-selection-consistency",
      metrics: { scoreComparableCount: 33 }, targetRaces: [] };
    for (let i = 0; i < 32; i++) {
      const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10).replaceAll("-", "");
      const record = { date, jcd: "01", raceNo: 1, prediction: {
        rankings: [{ headBoatNo: 5, priorityScore: 90, selected: false }, { headBoatNo: 1, priorityScore: 80, selected: true }],
        otherRankings: [{ headBoatNo: 5, priorityScore: 100, selected: false }, { headBoatNo: 1, priorityScore: 80, selected: true }]
      } };
      source.targetRaces.push({ date, jcd: "01", raceNo: 1, actualHead: 5, finalHead: 1, comparable: true,
        primaryComparison: { path: "rankings", winnerScore: 90, finalScore: 80, gap: -10, winnerAhead: true, winnerOutscored: false } });
      const doc = { predictions: [record] };
      small.push(structuredClone(doc));
      record.prediction.unrelatedLargeSavedText = "x".repeat(3 * 1024 * 1024);
      fs.writeFileSync(path.join(dir, "predictions", `${date}.json`), JSON.stringify(doc));
    }
    source.targetRaces.push({ ...source.targetRaces[0], primaryComparison: {
      ...source.targetRaces[0].primaryComparison, path: "otherRankings", winnerScore: 100, gap: -20 } });
    source.targetRaces.push({ ...source.targetRaces[0], date: "20990101" });
    fs.writeFileSync(path.join(dir, "source.json"), JSON.stringify(source));
    const before = JSON.stringify({ source, small });
    assert.deepEqual(clean(audit.build(source, loadDailyDocuments(path.join(dir, "predictions")))), clean(audit.build(source, small)));
    assert.deepEqual(clean(audit.build(source, null)), clean(audit.build(source, [])));
    const empty = { ...small[0].predictions[0], prediction: {} }, candidate = small[0].predictions[0];
    for (const docs of [
      [{ predictions: [empty], verificationPredictions: [candidate] }],
      [{ verificationPredictions: [candidate] }, { predictions: [empty] }],
      [{ predictions: [candidate] }, { predictions: [empty] }]
    ]) assert.deepEqual(clean(audit.build(source, docs)), clean(audit.build(source, [{ predictions: [empty] }])));
    assert.equal(JSON.stringify({ source, small }), before);
    const run = mode => spawnSync(process.execPath, ["--max-old-space-size=64", __filename,
      "heap-child", dir, mode], { encoding: "utf8", timeout: 120000 });
    const streamed = run("stream");
    assert.equal(streamed.status, 0, streamed.error || streamed.stderr);
    process.stdout.write(streamed.stdout);
    const old = run("eager");
    assert.notEqual(old.status, 0);
    assert.match(old.stderr, /heap out of memory|Reached heap limit/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("priority consistency: duplicate targets, missing inputs, immutable streaming, precedence and bounded heap passed");
}
