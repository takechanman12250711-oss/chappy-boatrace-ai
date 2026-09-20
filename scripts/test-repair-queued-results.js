"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  repairQueuedResults,
  validateQueue
} = require("./repair-queued-results");

function write(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value) + "\n");
}

function result(date, complete = false) {
  return {
    source: "boatrace-official",
    date,
    raceCount: 12,
    completedRaces: complete ? 12 : 11,
    voidRaces: 0,
    resolvedRaces: complete ? 12 : 11,
    pendingRaces: complete ? 0 : 1,
    failedRaces: 0,
    complete,
    races: []
  };
}

assert.throws(
  () => validateQueue({ version: "wrong", maxEntries: 5, entries: [] }),
  /version/
);
assert.throws(
  () => validateQueue({ version: "result-repair-queue-v1", maxEntries: 1, entries: [{ date: "20260909" }, { date: "20260910" }] }),
  /上限/
);
assert.throws(
  () => validateQueue({ version: "result-repair-queue-v1", maxEntries: 5, entries: [{ date: "20260909" }, { date: "20260909" }] }),
  /重複/
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "result-repair-queue-"));
const configPath = path.join(root, "queue.json");
const resultPath = path.join(root, "data", "results", "20260909.json");
write(configPath, {
  version: "result-repair-queue-v1",
  maxEntries: 5,
  entries: [{ date: "20260909", enabled: true, reason: "test" }]
});
write(resultPath, result("20260909", false));

let calls = 0;
const runner = (scriptName, args) => {
  calls += 1;
  assert.equal(scriptName, "collect-results.js");
  assert.deepEqual(args, ["--date=20260909"]);
  write(resultPath, result("20260909", true));
};

const first = repairQueuedResults(root, { configPath, runner });
assert.deepEqual(first.repaired, ["20260909"]);
assert.deepEqual(first.skippedComplete, []);
assert.equal(calls, 1, "未完成の明示日だけを1回再取得する");

const second = repairQueuedResults(root, { configPath, runner });
assert.deepEqual(second.repaired, []);
assert.deepEqual(second.skippedComplete, ["20260909"]);
assert.equal(calls, 1, "完成後は同じキューを再取得しない");

const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "result-repair-queue-missing-"));
const missingConfig = path.join(missingRoot, "queue.json");
write(missingConfig, {
  version: "result-repair-queue-v1",
  maxEntries: 5,
  entries: [{ date: "20260908", enabled: true, reason: "test" }]
});
assert.throws(
  () => repairQueuedResults(missingRoot, { configPath: missingConfig, runner }),
  /既存結果ファイルがない/
);

console.log("bounded result repair queue tests passed");
