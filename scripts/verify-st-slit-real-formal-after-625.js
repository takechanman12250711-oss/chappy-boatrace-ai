"use strict";

const assert = require("node:assert/strict");
const raceApi = require("../api/race");
const collector = require("./collect-predictions");
const theoryInput = require("../js/theory-input");

function callApi(handler, query) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const req = { query };
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json(data) {
        if (statusCode >= 400 || !data?.ok) {
          reject(new Error(data?.error || `API error ${statusCode}`));
          return;
        }
        resolve(data);
      }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function verify(query) {
  const raceData = await callApi(raceApi, query);
  const attached = collector.attachVenueRaceHistory(
    raceData,
    query.jcd,
    Number(query.rno)
  );
  const prepared = theoryInput.prepare(
    attached.raceData,
    global.ChappyAICore
  );
  const predictionData = global.ChappyAICore.buildPredictionData(prepared);
  const roles = Array.isArray(predictionData?.stSlitTheory?.roles)
    ? predictionData.stSlitTheory.roles
    : [];
  const formal = roles.filter(row => row?.isFormal === true);
  const applied = roles.filter(row => row?.appliedToScore === true);
  console.log(JSON.stringify({
    date: query.date,
    jcd: query.jcd,
    rno: query.rno,
    roleCount: roles.length,
    formalCount: formal.length,
    appliedCount: applied.length,
    rows: roles.map(row => ({
      boatNo: row.boatNo,
      course: row.course,
      samples: row.samples,
      isFormal: row.isFormal,
      appliedToScore: row.appliedToScore,
      status: row.status
    }))
  }, null, 2));
  assert.ok(roles.length > 0, "ST/slit roles are missing");
  assert.ok(formal.length > 0, "real API path still has zero formal ST roles");
  assert.ok(applied.length > 0, "real API path still has zero applied ST roles");
}

(async () => {
  const candidates = [
    { date: "20260823", jcd: "24", rno: "1" },
    { date: "20260823", jcd: "20", rno: "9" },
    { date: "20260823", jcd: "02", rno: "12" }
  ];
  let lastError = null;
  for (const query of candidates) {
    try {
      await verify(query);
      console.log("real ST/slit formal verification: ok");
      return;
    } catch (error) {
      lastError = error;
      console.warn(`${query.date}-${query.jcd}-${query.rno}: ${error.message}`);
    }
  }
  throw lastError || new Error("no verification candidate succeeded");
})().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
