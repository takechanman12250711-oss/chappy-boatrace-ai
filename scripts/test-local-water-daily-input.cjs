"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadDailyDocuments, mapPredictionRows } = require("./local-water-daily-input.cjs");
const builders = [
  "build-local-water-strong-condition-cohort",
  "build-local-water-main-head-selection-audit",
  "build-local-water-outer-head-candidate-ranking-audit",
  "build-local-water-outer-head-stage-audit",
  "build-local-water-result-breakdown",
  "build-local-water-outer-head-bottleneck-audit",
  "build-local-water-outside-head-miss-structure",
  "build-local-water-outer-head-priority-score-audit"
];

if (process.argv[2] === "heap-child") {
  const [dir, name, mode] = process.argv.slice(3);
  const docs = loadDailyDocuments(path.join(dir, "predictions"));
  // Negative control reproduces the previous eager loader, before aggregation.
  const input = mode === "eager" ? [...docs] : docs;
  const report = require(`./${name}`).build(input, loadDailyDocuments(path.join(dir, "results")));
  assert.equal(report.actualHead56RaceCount ?? report.settledFormalEvidenceRaceCount ?? report.metrics?.settledFormalEvidenceRaceCount ?? report.metrics?.unselectedScenarioHeadCount, 32);
  assert.equal(report.productionChanged, false);
  assert.equal(report.automaticApplication, false);
  assert.equal(report.usableForPrediction, false);
  console.log(JSON.stringify({ name, mode, maxRSS: process.resourceUsage().maxRSS }));
} else {
  const row = (id, tag) => ({ date: "20261005", jcd: "01", raceNo: id, tag });
  const documents = [
    { predictions: [row(1, "primary"), row(3, "old-primary")],
      verificationPredictions: [row(1, "ignored-verification"), row(2, "first-verification")] },
    { predictions: [row(3, "new-primary"), row(4, "filtered-primary"), row(2, "later-primary")],
      verificationPredictions: [row(2, "ignored-late-verification"), row(4, "must-not-fill"), row(5, "first")] },
    { verificationPredictions: [row(5, "ignored-last")] }
  ];
  const before = JSON.stringify(documents), calls = [];
  const projected = mapPredictionRows(documents, value => {
    calls.push(value.tag);
    return value.tag === "filtered-primary" ? null : value.tag;
  });
  assert.deepEqual(projected, ["primary", "new-primary", "later-primary", null, "first"]);
  assert.ok(!calls.some(value => /ignored|must-not-fill/.test(value)));
  assert.equal(JSON.stringify(documents), before, "saved inputs must remain unchanged");

  // PR validation has no remote writes and must not reserve the production
  // writer queue. Every production event keeps the original shared writer lock.
  for (const name of builders) {
    const topic = name.replace("build-local-water-", "");
    const workflow = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", `check-local-water-${topic}.yml`), "utf8");
    assert.ok(workflow.includes("group: ${{ github.event_name == 'pull_request' && format('chappy-local-water-audit-{0}', github.ref) || 'chappy-main-data-writers' }}"));
    assert.match(workflow, /queue: max\n\s+cancel-in-progress: false/);
    assert.ok(workflow.includes("ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || 'main' }}"));
    const steps = workflow.split(/\n(?=      - )/).slice(1);
    const buildAndSave = steps.filter(step => step.includes(`node scripts/${name}.js`) || step.includes("git push origin main"));
    assert.equal(buildAndSave.length, 2);
    for (const step of buildAndSave) assert.match(step, /if: github.event_name != 'pull_request'/,
      `${topic}: pull requests may not build or save production reports`);
    assert.ok(workflow.includes("node scripts/test-local-water-daily-input.cjs"));
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-local-water-input-"));
  try {
    assert.deepEqual([...loadDailyDocuments(path.join(dir, "missing"))], []);
    fs.mkdirSync(path.join(dir, "predictions"));
    fs.mkdirSync(path.join(dir, "results"));
    const predictions = [], results = [];
    for (let index = 0; index < 32; index++) {
      const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10).replaceAll("-", "");
      const record = { date, jcd: "01", raceNo: 1, prediction: {
        venueWaterSupport: { venue: "桐生", wind: 6, wave: 2, confirmations: ["風の正式証拠"] },
        aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
        verificationEvidence: { mainScenario: { headBoatNo: 1 } },
        practicalSelection: { frameRiseFallReplayBasis: { raceScenarios: { mainScenario: { branches: [
          { ticket: "5-1-2", headBoatNo: 5, priorityScore: 80, reason: "展開40/40" },
          { ticket: "1-2-5", headBoatNo: 1, priorityScore: 90, reason: "展開40/40" }
        ] } } } }
      } };
      const doc = { predictions: [record] };
      const result = { races: [{ date, jcd: "01", raceNo: 1, resultAvailable: true,
        status: "finished", trifecta: { combination: "5-1-2" } }] };
      predictions.push(structuredClone(doc)); results.push(result);
      record.prediction.unusedLargeSavedText = "x".repeat(3 * 1024 * 1024);
      fs.writeFileSync(path.join(dir, "predictions", `${date}.json`), JSON.stringify(doc));
      fs.writeFileSync(path.join(dir, "results", `${date}.json`), JSON.stringify(result));
    }
    fs.writeFileSync(path.join(dir, "predictions", "index.json"), "not a daily document");
    const immutableBefore = JSON.stringify({ predictions, results });
    const clean = report => { const copy = structuredClone(report); delete copy.generatedAt; return copy; };
    for (const name of builders) {
      const build = require(`./${name}`).build;
      assert.deepEqual(clean(build(loadDailyDocuments(path.join(dir, "predictions")), results)),
        clean(build(predictions, results)), `${name}: full recursive saved evidence produces identical summaries`);
      if (/main-head-selection-audit|outer-head-candidate-ranking-audit/.test(name)) {
        const mixedResults = structuredClone(results.slice(0, 2));
        mixedResults[0].races[0].trifecta.combination = "1-2-3";
        const mixed = build(predictions.slice(0, 2), mixedResults);
        assert.equal(mixed.metrics.settledFormalEvidenceRaceCount, 2,
          "non-5/6 settled winners must remain in the formal denominator");
        assert.equal(mixed.metrics.actualHead56Count, 1);
      }
      const primary = { ...predictions[0].predictions[0], prediction: {} };
      const verification = predictions[0].predictions[0];
      for (const docs of [
        [{ predictions: [primary], verificationPredictions: [verification] }],
        [{ verificationPredictions: [verification] }, { predictions: [primary] }],
        [{ predictions: [verification] }, { predictions: [primary] }]
      ]) {
        assert.deepEqual(clean(build(docs, results)), clean(build([{ predictions: [primary] }], results)),
          `${name}: filtered primary retains dedup precedence`);
      }
      const child = spawnSync(process.execPath, ["--max-old-space-size=64", __filename,
        "heap-child", dir, name, "stream"], { encoding: "utf8", timeout: 120000 });
      assert.equal(child.status, 0, `${name}: ${child.error || child.stderr}`);
      process.stdout.write(child.stdout);
    }
    assert.equal(JSON.stringify({ predictions, results }), immutableBefore, "all diagnostic builders leave source objects unchanged");
    const control = spawnSync(process.execPath, ["--max-old-space-size=64", __filename,
      "heap-child", dir, builders[0], "eager"], { encoding: "utf8", timeout: 120000 });
    assert.notEqual(control.status, 0, "eager negative control must exceed the same heap budget");
    assert.match(control.stderr, /heap out of memory|Reached heap limit/);
    fs.writeFileSync(path.join(dir, "predictions", "20260101.json"), "broken JSON");
    assert.throws(() => [...loadDailyDocuments(path.join(dir, "predictions"))], SyntaxError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("local water daily input: streaming, projection, immutable inputs, dedup precedence and bounded heap passed");
}
