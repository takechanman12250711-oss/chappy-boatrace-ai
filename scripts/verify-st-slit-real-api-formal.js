"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/boat-identity");
require("../js/ai-core");
const theoryInput = require("../js/theory-input");

const aiCore = global.ChappyAICore;
const TARGETS = [
  ["24", 1],
  ["05", 12],
  ["03", 12],
  ["04", 9],
  ["06", 11],
  ["08", 3],
  ["17", 11],
  ["19", 3],
  ["20", 3],
  ["22", 9]
];

async function loadRace(jcd, rno) {
  const url = `https://chappy-boatrace-api.vercel.app/api/race?jcd=${jcd}&rno=${rno}&date=20260823`;
  const response = await fetch(url, { headers: { "user-agent": "chappy-st-formal-e2e/1.0" } });
  if (!response.ok) return null;
  const data = await response.json();
  return { url, data };
}

(async () => {
  const attempts = [];
  for (const [jcd, rno] of TARGETS) {
    const loaded = await loadRace(jcd, rno);
    if (!loaded) {
      attempts.push({ jcd, rno, status: "http-failed" });
      continue;
    }
    const prepared = theoryInput.prepare(loaded.data, aiCore);
    const prediction = aiCore.buildPredictionData(prepared);
    const roles = Array.isArray(prediction?.stSlitTheory?.roles)
      ? prediction.stSlitTheory.roles
      : [];
    const formalRoles = roles.filter(role => role?.isFormal === true);
    const appliedRoles = roles.filter(role => role?.appliedToScore === true);
    attempts.push({
      jcd,
      rno,
      entries: Array.isArray(prepared?.entries) ? prepared.entries.length : 0,
      historyRacers: Array.isArray(prepared?.historyContext?.racers)
        ? prepared.historyContext.racers.length
        : Object.keys(prepared?.historyContext?.racers || {}).length,
      officialCourses: (prepared?.startExhibition || []).filter(row => row?.isOfficialCourse === true).length,
      roles: roles.length,
      formalRoles: formalRoles.length,
      appliedRoles: appliedRoles.length,
      source: prediction?.stSlitTheory?.source || ""
    });
    if (formalRoles.length > 0 && appliedRoles.length > 0) {
      console.log(JSON.stringify({ verified: true, target: { jcd, rno }, attempts }, null, 2));
      assert.ok(formalRoles.length > 0);
      assert.ok(appliedRoles.length > 0);
      process.exit(0);
    }
  }
  console.log(JSON.stringify({ verified: false, attempts }, null, 2));
  throw new Error("実APIデータでST/スリット正式反映を確認できませんでした");
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});