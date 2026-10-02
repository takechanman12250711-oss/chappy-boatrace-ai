"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeDate,
  minifyJsonFile
} = require("./minify-daily-prediction");

assert.equal(normalizeDate("2026-08-15"), "20260815");
assert.equal(normalizeDate("2026/08/15"), "20260815");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-minify-"));
const filePath = path.join(directory, "daily.json");
const source = {
  schemaVersion: 3,
  date: "20260815",
  runs: [{ runKey: "r1", selected: false }],
  verificationPredictions: [{ raceKey: "20260815-24-1", evidence: { score: 77 } }],
  scenarioAiV6: { usableForPrediction: false },
  retainedEvidence: { nested: [1, 2, 3] }
};
fs.writeFileSync(filePath, JSON.stringify(source, null, 2) + "\n", "utf8");
const before = fs.readFileSync(filePath, "utf8");
const result = minifyJsonFile(filePath);
const after = fs.readFileSync(filePath, "utf8");

assert.deepEqual(JSON.parse(after), source);
assert.ok(result.afterBytes < result.beforeBytes);
assert.equal(result.beforeBytes, Buffer.byteLength(before, "utf8"));
assert.equal(after, JSON.stringify(source) + "\n");

fs.rmSync(directory, { recursive: true, force: true });
console.log("daily prediction minify preserves all JSON evidence");
