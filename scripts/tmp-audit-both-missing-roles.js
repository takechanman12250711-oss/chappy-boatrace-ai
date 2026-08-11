"use strict";

const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");

const selector = require("../js/practical-selection");
const core = global.ChappyAICore;
const dir = path.join(process.cwd(), "data", "predictions");

const rows = (d) => [
  ...(d.predictions || []),
  ...(d.verificationPredictions || [])
];

function tk(v) {
  const m = String(v?.ticket || v || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).join("-") : "";
}

function dataOf(r) {
  const s = r?.prediction?.preRaceConditions || r?.preRaceConditions;
  if (!s || !Array.isArray(s.boats) || s.boats.length < 5) return null;
  return {
    ...s,
    entries: s.boats,
    boats: s.boats,
    jcd: r.jcd,
    stadiumCode: r.jcd,
    venueCode: r.jcd,
    placeName: r.place,
    venueName: r.place,
    raceNo: r.raceNo,
    rno: r.raceNo,
    weather: s.weather || {}
  };
}

function list(v) {
  return (Array.isArray(v) ? v : []).map((x) => tk(x?.ticket || x)).filter(Boolean);
}

function nums(v) {
  return [...new Set(
    (Array.isArray(v) ? v : [])
      .map((x) => Number(x?.boatNo ?? x))
      .filter((n) => n >= 1 && n <= 6)
  )];
}

function membership(rs, boat) {
  const map = {
    remainer: nums(rs?.remainers),
    follower: nums(rs?.followers),
    pickup: nums(rs?.pickupCandidates),
    road: nums(rs?.roadRaceBoats),
    local: nums(rs?.localExperts),
    blocked: nums(rs?.blockedBoats)
  };
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.includes(boat)]));
}

const out = {
  count: 0,
  secondBoats: {},
  thirdBoats: {},
  secondRoles: {},
  thirdRoles: {},
  pairRolePatterns: {},
  samples: []
};

function bump(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

for (const f of fs.readdirSync(dir).filter((x) => /^202608(0[7-9]|10)\.json$/.test(x)).sort()) {
  const date = f.slice(0, 8);
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

  for (const r of rows(d)) {
    if (r?.result?.settled !== true) continue;
    const data = dataOf(r);
    const actual = tk(r?.result?.resultTicket || r?.result?.review?.resultTicket);
    if (!data || !actual) continue;

    const prediction = global.createPrediction(data);
    const sel = selector.select(prediction);
    if (list(sel?.tickets).includes(actual)) continue;

    const ai = core.buildPredictionData(data);
    const fm = ai?.formations || {};
    const formal = [...new Set([
      ...list(fm.main),
      ...list(fm.safety),
      ...list(fm.flow),
      ...list(fm.longshot)
    ])];
    if (formal.includes(actual)) continue;

    const [winner, second, third] = actual.split("-").map(Number);
    const rs = ai?.raceScenarios || {};
    const scenarios = Array.isArray(rs.scenarios) ? rs.scenarios : [];
    const ws = scenarios.find((s) => Number(s?.attacker || 0) === winner);
    if (!ws) continue;

    const seconds = new Set(nums(ws?.outcome?.secondCandidates));
    const thirds = new Set(nums(ws?.outcome?.thirdCandidates));
    if (seconds.has(second) || thirds.has(third)) continue;

    const analyses = Array.isArray(ai?.analyses)
      ? ai.analyses
      : (Array.isArray(ai?.boatAnalyses) ? ai.boatAnalyses : []);
    const secondA = analyses.find((a) => Number(a?.boatNo || 0) === second) || {};
    const thirdA = analyses.find((a) => Number(a?.boatNo || 0) === third) || {};
    const secondFlags = membership(rs, second);
    const thirdFlags = membership(rs, third);

    out.count++;
    bump(out.secondBoats, String(second));
    bump(out.thirdBoats, String(third));
    for (const [k, v] of Object.entries(secondFlags)) if (v) bump(out.secondRoles, k);
    for (const [k, v] of Object.entries(thirdFlags)) if (v) bump(out.thirdRoles, k);

    const secondPattern = Object.entries(secondFlags).filter(([, v]) => v).map(([k]) => k).sort().join("+") || "none";
    const thirdPattern = Object.entries(thirdFlags).filter(([, v]) => v).map(([k]) => k).sort().join("+") || "none";
    bump(out.pairRolePatterns, `${secondPattern} | ${thirdPattern}`);

    out.samples.push({
      raceKey: r?.raceKey || `${date}-${r.jcd}-${r.raceNo}`,
      actual,
      winnerScenario: ws?.type || null,
      winnerScenarioScore: Number(ws?.score || 0),
      mainScenario: rs?.mainScenario?.type || null,
      mainScore: Number(rs?.mainScenario?.score || 0),
      second,
      secondFlags,
      secondRoleScores: secondA?.roleScores || {},
      secondIndexes: secondA?.indexes || {},
      third,
      thirdFlags,
      thirdRoleScores: thirdA?.roleScores || {},
      thirdIndexes: thirdA?.indexes || {},
      existingSecond: [...seconds],
      existingThird: [...thirds]
    });
  }
}

fs.mkdirSync("tmp-analysis-output", { recursive: true });
fs.writeFileSync(
  "tmp-analysis-output/both-missing-roles.json",
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
