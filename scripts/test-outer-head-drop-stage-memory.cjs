"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadDailyDocuments } = require("./local-water-daily-input.cjs");
const audit = require("./build-outer-head-drop-stage-audit");
const clean = report => { const copy = structuredClone(report); delete copy.generatedAt; return copy; };

if (process.argv[2] === "heap-child") {
  const input = loadDailyDocuments(process.argv[3]);
  const report = audit.build(process.argv[4] === "eager" ? [...input] : input);
  assert.equal(report.settledPredictionCount, 32);
  assert.equal(report.finalHead56Count, 16);
  assert.equal(report.candidateStage56RaceCount, 32);
  assert.equal(report.scenarioStage56RaceCount, 32);
  assert.equal(report.productionChanged, false);
  assert.equal(report.automaticApplication, false);
  assert.equal(report.usableForPrediction, false);
  console.log(JSON.stringify({ maxRSS: process.resourceUsage().maxRSS }));
} else {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/check-outer-head-drop-stage-audit.yml"), "utf8");
  assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('chappy-outer-head-drop-stage-{0}', github.ref) || 'chappy-main-data-writers' }}"));
  assert.match(workflow, /queue: max\n\s+cancel-in-progress: false/);
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Collect official race results"\]\n\s+branches: \[main\]/);
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
    step.includes("node scripts/build-outer-head-drop-stage-audit.js") || step.includes("git push origin main"));
  assert.equal(guarded.length, 2);
  for (const step of guarded) assert.match(step, /if: github.event_name != 'pull_request'/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-outer-head-drop-stage-"));
  try {
    const small = [];
    for (let i = 0; i < 32; i++) {
      const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10).replaceAll("-", "");
      const record = { date, jcd: "01", raceNo: 1, prediction: {
        verificationEvidence: { mainScenario: { headBoatNo: i % 2 ? 5 : 1 } },
        candidatePool: [{ boatNo: 5, role: "head" }],
        aiCore: { raceScenarios: { mainScenario: { headBoatNo: 5 } } }
      } };
      const doc = { predictions: [record] };
      small.push(structuredClone(doc));
      record.prediction.unrelatedLargeSavedText = "x".repeat(3 * 1024 * 1024);
      fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(doc));
    }
    const before = JSON.stringify(small);
    assert.deepEqual(clean(audit.build(loadDailyDocuments(dir))), clean(audit.build(small)));
    const empty = { ...small[0].predictions[0], prediction: {} };
    const candidate = small[0].predictions[0];
    for (const docs of [
      [{ predictions: [empty], verificationPredictions: [candidate] }],
      [{ verificationPredictions: [candidate] }, { predictions: [empty] }],
      [{ predictions: [candidate] }, { predictions: [empty] }]
    ]) assert.deepEqual(clean(audit.build(docs)), clean(audit.build([{ predictions: [empty] }])));
    assert.equal(JSON.stringify(small), before);
    const run = mode => spawnSync(process.execPath, ["--max-old-space-size=64", __filename,
      "heap-child", dir, mode], { encoding: "utf8", timeout: 120000 });
    const streamed = run("stream");
    assert.equal(streamed.status, 0, streamed.error || streamed.stderr);
    process.stdout.write(streamed.stdout);
    const old = run("eager");
    assert.notEqual(old.status, 0);
    assert.match(old.stderr, /heap out of memory|Reached heap limit/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("outer head drop stage: immutable streaming, precedence, bounded heap and workflow guards passed");
}
