"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const builder = require("./build-practical-priority-shadow-report");
const report = require("../js/practical-priority-shadow-report");
const shadow = require("../js/practical-priority-shadow");

function row(date, raceNo = 1) {
  return {
    raceKey: `${date}-01-${raceNo}`,
    date,
    selectedAt: "2026-08-13T00:00:00Z",
    deadlineAt: "2026-08-13T01:00:00Z",
    practicalPriorityShadow: {
      eligible: true,
      logicFingerprint: shadow.LOGIC_FINGERPRINT,
      cohortContractFingerprint: report.CONTRACT_FINGERPRINT,
      sourceSelectionFingerprint: report.REGISTERED_CONTRACT.sourceSelectionFingerprint,
      capturedAt: "2026-08-13T00:00:00Z",
      sourceCommit: "memory-regression-fixture",
      baseTickets: [{ ticket: "1-2-3", diagnostics: { ignored: true } }, "1-2-4"],
      shadowTickets: ["1-2-3", "1-3-4"],
      replacement: { addedTicket: "1-3-4", removedTicket: "1-2-4",
        addedPriorityScore: 91, removedPriorityScore: 70 },
      diagnostics: { unused: "discard" }
    },
    result: { settled: true, review: { resultTicket: "1-3-4", payoutPer100: 500 } },
    prediction: { unused: "discard" }
  };
}

// Compare the complete report, not just counts. Include fallback values,
// invalid results, voids, duplicate resolution and an ineligible newer row.
const variants = [
  {},
  { settled: false },
  { settled: true, resultTicket: "", payoutPer100: 0 },
  { settled: true, resultTicket: "invalid", payoutPer100: 800 },
  { settled: true, resultTicket: "1-2-3", payoutPer100: -1 },
  { settled: true, payoutPer100: 0, review: { resultTicket: "1-2-3", payoutPer100: 600 } },
  { settled: true, void: true },
  { settled: false, resolvedVoid: true },
  { status: "void" }
];
const original = variants.map((result, i) => ({ ...row("20260813", i + 1), result }));
original.push(row("20260814"));
original.push({ ...row("20260814"), result: { settled: false } });
const newer = row("20260814");
newer.practicalPriorityShadow.eligible = false;
newer.practicalPriorityShadow.capturedAt = "2026-08-13T00:01:00Z";
original.push(newer);
original.push(null, { raceKey: "20260815-01-1" });
const compact = original.map(builder.compactPredictionRow);
assert.deepEqual(report.build(compact), report.build(original));
assert.equal(compact[0].prediction, undefined);
assert.equal(compact[0].practicalPriorityShadow.diagnostics, undefined);
assert.equal(compact[0].practicalPriorityShadow.baseTickets[0], "1-2-3");

if (process.argv[2] === "--child") {
  const directory = process.argv[3];
  const rows = builder.predictionRows({
    predictionDirectory: path.join(directory, "predictions"),
    resultDirectory: path.join(directory, "results")
  });
  const expected = JSON.parse(fs.readFileSync(path.join(directory, "expected.json"), "utf8"));
  assert.deepEqual(report.build(rows), expected);
  assert.equal(rows.length, 50);
  assert(rows.every(item => !item.prediction && !item.practicalPriorityShadow?.diagnostics));
  console.log("bounded-heap archive/report parity passed (128 MiB heap)");
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-priority-memory-"));
  try {
    const predictions = path.join(directory, "predictions");
    const results = path.join(directory, "results");
    fs.mkdirSync(predictions);
    fs.mkdirSync(results);
    const expectedRows = [];
    let totalBytes = 0;
    for (let index = 0; index < 48; index += 1) {
      const date = new Date(Date.UTC(2026, 7, 13 + index)).toISOString().slice(0, 10).replace(/-/g, "");
      const selected = row(date);
      // More than 192 MiB of parsed history must not be retained in a 128 MiB heap.
      selected.prediction = { diagnostics: "x".repeat(4 * 1024 * 1024) };
      selected.practicalPriorityShadow.diagnostics = { unused: "y".repeat(256 * 1024) };
      const verification = row(date);
      verification.result = { settled: true, resultTicket: "6-5-4", payoutPer100: 900 };
      if (index === 1) selected.practicalPriorityShadow.eligible = false;
      const data = { predictions: [selected], verificationPredictions: [verification] };
      if (index === 2) data.verificationPredictions.push(row(date, 2));
      if (index === 3) data.verificationPredictions.push({ raceKey: `${date}-01-3`, selectedAt: selected.selectedAt });
      const official = { date, races: index === 0
        ? [{ jcd: "01", raceNo: 1, status: "finished", resultAvailable: true,
          trifecta: { combination: "1-2-3", payout: 1000 } }]
        : index === 2 ? [{ jcd: "01", raceNo: 2, status: "void" }] : [] };
      const serialized = JSON.stringify(data);
      totalBytes += Buffer.byteLength(serialized);
      fs.writeFileSync(path.join(predictions, `${date}.json`), serialized);
      if (official.races.length) fs.writeFileSync(path.join(results, `${date}.json`), JSON.stringify(official));
      // Keep the expectation independently via the old full-row contract.
      delete selected.prediction;
      delete selected.practicalPriorityShadow.diagnostics;
      expectedRows.push(...builder.rowsFromPredictionData(data, official));
    }
    // Pre-contract/non-daily files must not even be parsed.
    fs.writeFileSync(path.join(predictions, "20260812.json"), "not JSON");
    fs.writeFileSync(path.join(predictions, "index.json"), "not JSON");
    assert(totalBytes > 192 * 1024 * 1024);
    fs.writeFileSync(path.join(directory, "expected.json"), JSON.stringify(report.build(expectedRows)));
    const child = spawnSync(process.execPath, ["--max-old-space-size=128", __filename, "--child", directory], {
      encoding: "utf8", timeout: 60000, env: { ...process.env, NODE_OPTIONS: "" }
    });
    assert.equal(child.status, 0, `${child.error || ""}\n${child.stdout}\n${child.stderr}`);
    process.stdout.write(child.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
