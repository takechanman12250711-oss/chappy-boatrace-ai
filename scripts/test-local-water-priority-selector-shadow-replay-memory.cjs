"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadDailyDocuments } = require("./local-water-daily-input.cjs");
const shadow = require("./build-local-water-priority-selector-shadow-replay");
const source = {
  version: "local-water-priority-selection-consistency-audit-v1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  nextStep: "build-local-water-priority-selector-shadow-replay"
};
const clean = report => { const copy = structuredClone(report); delete copy.generatedAt; return copy; };
const stream = function* (docs) { yield* docs; };

function record(date = "20260101", raceNo = 1) {
  return { date, jcd: "1", raceNo, prediction: {
    verificationEvidence: {
      localWater: { venue: "テスト水面", wind: 6, wave: 2, confirmations: ["風の正式証拠"] },
      mainScenario: { headBoatNo: 1 }
    },
    practicalSelection: { frameRiseFallReplayBasis: { raceScenarios: { mainScenario: { branches: [
      { ticket: "1-2-5", headBoatNo: 1, priorityScore: 80 },
      // Preserve dynamic ticket field names and nested score/role evidence.
      { savedFormation: "5-1-2", selection: { scoreBreakdown: { priorityScore: "95" } }, roleLabels: ["alternate-head"] },
      { headBoatNo: 5, priorityScore: 95, ticket: "5-2-1" },
      { headBoatNo: 6, priorityScore: 95, ticket: "6-1-2" }
    ] } } } }
  } };
}
function result(row) {
  return { date: row.date, jcd: "01", raceNo: row.raceNo,
    resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } };
}

if (process.argv[2] === "heap-child") {
  const dir = process.argv[3];
  const docs = loadDailyDocuments(path.join(dir, "predictions"));
  const report = shadow.build(process.argv[4] === "eager" ? [...docs] : docs,
    loadDailyDocuments(path.join(dir, "results")), source);
  assert.equal(report.metrics.settledFormalEvidenceRaceCount, 32);
  assert.equal(report.metrics.comparableReplayCount, 32);
  assert.equal(report.metrics.wrongToCorrectCount, 32);
  assert.equal(report.switchedRaces.length, 32);
  assert.equal(report.sourceGeneratedAt, source.generatedAt);
  assert.equal(report.productionChanged, false);
  assert.equal(report.automaticApplication, false);
  assert.equal(report.usableForPrediction, false);
  console.log(JSON.stringify({ mode: process.argv[4], maxRSS: process.resourceUsage().maxRSS }));
} else {
  const workflow = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/check-local-water-priority-selector-shadow-replay.yml"), "utf8");
  assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('chappy-local-water-selector-replay-{0}', github.ref) || 'chappy-main-data-writers' }}"));
  assert.match(workflow, /queue: max\n\s+cancel-in-progress: false/);
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Check local water priority selection consistency audit"\]\n\s+branches: \[main\]/);
  const expectedCondition = "github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository && github.event.workflow_run.event != 'pull_request' && github.event.workflow_run.event != 'pull_request_target')";
  assert.equal(workflow.match(/^    if: (.+)$/m)?.[1], expectedCondition);
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
    assert.equal(allows({ event_name, repository: "owner/repo", event: {} }), true);
  assert.ok(workflow.includes("node scripts/test-local-water-priority-selector-shadow-replay-memory.cjs"));
  const guarded = workflow.split(/\n(?=      - )/).slice(1).filter(step =>
    step.includes("node scripts/build-local-water-priority-selector-shadow-replay.js") || step.includes("git push origin main"));
  assert.equal(guarded.length, 2);
  for (const step of guarded) assert.match(step, /if: github.event_name != 'pull_request'/);

  const candidate = record(), empty = { ...candidate, prediction: {} };
  const results = [{ races: [result(candidate)] }];
  for (const docs of [
    [{ predictions: [empty], verificationPredictions: [candidate] }],
    [{ verificationPredictions: [candidate] }, { predictions: [empty] }],
    [{ predictions: [candidate] }, { predictions: [empty] }]
  ]) assert.deepEqual(clean(shadow.build(stream(docs), stream(results), source)),
    clean(shadow.build([{ predictions: [empty] }], results, source)),
    "ineligible primary must keep its global dedup key");
  for (const docs of [
    [{ predictions: [candidate], verificationPredictions: [empty] }],
    [{ verificationPredictions: [empty] }, { predictions: [candidate] }],
    [{ verificationPredictions: [candidate] }, { verificationPredictions: [empty] }],
    [{ predictions: [empty] }, { predictions: [candidate] }]
  ]) assert.deepEqual(clean(shadow.build(stream(docs), stream(results), source)),
    clean(shadow.build([{ predictions: [candidate] }], results, source)),
    "latest primary / first verification selection stays unchanged across documents");
  assert.deepEqual(clean(shadow.build(null, null, source)), clean(shadow.build([], [], source)));
  const pending = { ...result(candidate), resultAvailable: false, status: "pending" };
  assert.equal(shadow.build([{ predictions: [candidate] }], stream([...results, { races: [pending] }]), source)
    .metrics.settledFormalEvidenceRaceCount, 1, "pending duplicate must not replace finished result");
  const invalid = { ...result(candidate), trifecta: { combination: "invalid" } };
  assert.equal(shadow.build([{ predictions: [candidate] }], stream([...results, { races: [invalid] }]), source)
    .metrics.settledFormalEvidenceRaceCount, 0, "latest finished result retains precedence even if invalid");
  const noHead = structuredClone(candidate);
  delete noHead.prediction.verificationEvidence.mainScenario;
  const denominator = shadow.build([{ predictions: [noHead] }], results, source);
  assert.equal(denominator.metrics.settledFormalEvidenceRaceCount, 1);
  assert.equal(denominator.metrics.currentHeadAvailableCount, 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-selector-replay-"));
  try {
    fs.mkdirSync(path.join(dir, "predictions"));
    fs.mkdirSync(path.join(dir, "results"));
    const small = [], resultDocs = [];
    for (let i = 0; i < 32; i++) {
      const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10).replaceAll("-", "");
      const row = record(date), doc = { predictions: [row] }, resultDoc = { races: [result(row)] };
      small.push(structuredClone(doc)); resultDocs.push(resultDoc);
      row.prediction.unrelatedLargeSavedText = "x".repeat(3 * 1024 * 1024);
      fs.writeFileSync(path.join(dir, "predictions", `${date}.json`), JSON.stringify(doc));
      fs.writeFileSync(path.join(dir, "results", `${date}.json`), JSON.stringify(resultDoc));
    }
    fs.writeFileSync(path.join(dir, "predictions", "index.json"), "not a daily document");
    const before = JSON.stringify({ small, resultDocs, source });
    const report = shadow.build(loadDailyDocuments(path.join(dir, "predictions")),
      loadDailyDocuments(path.join(dir, "results")), source);
    assert.deepEqual(clean(report), clean(shadow.build(small, resultDocs, source)));
    assert.equal(report.switchedRaces[0].topCandidates[0].index, 1);
    assert.equal(report.switchedRaces[0].topCandidates[0].score, 95);
    assert.equal(report.switchedRaces[0].topCandidates[0].boatNo, 5);
    assert.equal(report.switchedRaces[0].topCandidates[0].role, "head");
    assert.equal(JSON.stringify({ small, resultDocs, source }), before, "saved inputs and provenance stay immutable");
    const run = mode => spawnSync(process.execPath, ["--max-old-space-size=64", __filename,
      "heap-child", dir, mode], { encoding: "utf8", timeout: 120000 });
    const streamed = run("stream");
    assert.equal(streamed.status, 0, streamed.error || streamed.stderr);
    process.stdout.write(streamed.stdout);
    const eager = run("eager");
    assert.notEqual(eager.status, 0, "old eager loader must fail the same heap budget");
    assert.match(eager.stderr, /heap out of memory|Reached heap limit/);
    fs.writeFileSync(path.join(dir, "predictions", "20260101.json"), "broken JSON");
    assert.throws(() => shadow.build(loadDailyDocuments(path.join(dir, "predictions")), resultDocs, source), SyntaxError);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("priority selector replay: full saved evidence, dedup, result precedence, denominator, provenance, immutable streaming and bounded heap passed");
}
