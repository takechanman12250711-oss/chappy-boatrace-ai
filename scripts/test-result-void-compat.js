"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "result-void-compat.js"),
  "utf8"
);

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}

async function runCase(payload, url = "https://chappy-boatrace-api.vercel.app/api/result?date=20260807&jcd=24&rno=1") {
  const originalPayload = JSON.stringify(payload);
  const sandbox = {
    console,
    Headers,
    Response,
    MutationObserver: FakeMutationObserver,
    document: {
      documentElement: {},
      getElementById() { return null; }
    },
    setTimeout,
    clearTimeout,
    fetch: async () => new Response(originalPayload, {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "result-void-compat.js" });
  const response = await sandbox.fetch(url);
  return { sandbox, payload: await response.json() };
}

(async () => {
  const allF = {
    ok: true,
    resultAvailable: false,
    status: "not_finished",
    trifecta: null,
    date: "20260807",
    jcd: "24",
    raceNo: 1,
    starts: [1, 2, 3, 4, 5, 6].map((boat, index) => ({
      course: index + 1,
      boat,
      marker: "F",
      falseStart: true,
      lateStart: false
    }))
  };
  const normalized = await runCase(allF);
  assert.equal(normalized.payload.status, "void");
  assert.equal(normalized.payload.void, true);
  assert.equal(normalized.payload.voidReason, "all-boats-f-l");
  assert.equal(normalized.payload.resultAvailable, false);
  assert.equal(normalized.sandbox.__CHAPPY_LAST_VOID_RESULT__.raceNo, 1);

  const pending = {
    ok: true,
    resultAvailable: false,
    status: "not_finished",
    trifecta: null,
    starts: [
      { course: 1, boat: 1, marker: "F", falseStart: true },
      { course: 2, boat: 2, marker: "", falseStart: false }
    ]
  };
  const untouched = await runCase(pending);
  assert.equal(untouched.payload.status, "not_finished");
  assert.equal(untouched.payload.void, undefined);

  const settled = {
    ok: true,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination: "1-2-3" },
    starts: []
  };
  const settledResult = await runCase(settled);
  assert.equal(settledResult.payload.status, "finished");
  assert.equal(settledResult.payload.void, undefined);

  const unrelated = await runCase(
    allF,
    "https://chappy-boatrace-api.vercel.app/api/race?date=20260807&jcd=24&rno=1"
  );
  assert.equal(unrelated.payload.status, "not_finished");
  assert.equal(unrelated.payload.void, undefined);

  console.log("result void compatibility tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
