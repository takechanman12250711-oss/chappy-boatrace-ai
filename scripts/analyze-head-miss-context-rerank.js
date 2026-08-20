"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
const core = global.ChappyAICore;

const DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT = "20260812";
const MIN_DISCOVERY = 8;
const MIN_HOLDOUT = 5;

function rowsOf(doc) {
  return [...(doc.predictions || []), ...(doc.verificationPredictions || [])];
}
function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
}
function boatNoOf(value, index = 0) {
  if (typeof value === "number" || typeof value === "string") {
    const m = String(value).match(/[1-6]/);
    return m ? Number(m[0]) : 0;
  }
  return Number(value?.boatNo ?? value?.boat ?? value?.no ?? value?.waku ?? value?.course ?? index + 1);
}
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function metric(obj, paths) {
  for (const itemPath of paths) {
    let value = obj;
    for (const key of itemPath.split(".")) value = value?.[key];
    const n = num(value);
    if (n !== null) return n;
  }
  return null;
}
function inputOf(row) {
  const s = row?.prediction?.preRaceConditions || row?.preRaceConditions;
  if (!s || !Array.isArray(s.boats) || s.boats.length < 6) return null;
  return {
    ...s,
    entries: s.boats,
    boats: s.boats,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    place: row.place,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    weather: s.weather || {}
  };
}
function basicFive(prediction) {
  const f = prediction?.formations || {};
  return [...(f.main || []).slice(0, 3), ...(f.safety || []).slice(0, 2)].map(ticketOf).filter(Boolean);
}
function mainScenarioOf(prediction) {
  const r = prediction?.raceScenarios || {};
  return r.mainScenario || r.scenarios?.[0] || {};
}
function scenarioHead(s) {
  return Number(s?.headBoatNo || s?.attackerBoatNo || s?.attacker || s?.outcome?.firstCandidates?.[0]?.boatNo || s?.outcome?.firstCandidates?.[0] || 0);
}
function analysesOf(prediction) {
  return prediction?.analyses || prediction?.evaluations || prediction?.boatEvaluation?.evaluations || [];
}
function findBoat(analyses, boatNo) {
  return analyses.find((item, index) => boatNoOf(item, index) === boatNo) || null;
}
function weatherOf(input) {
  return input?.weather || {};
}
function windBucket(wind) {
  if (wind === null) return "unknown";
  if (wind < 2) return "lt2";
  if (wind < 4) return "2to4";
  if (wind < 6) return "4to6";
  return "ge6";
}
function waveBucket(wave) {
  if (wave === null) return "unknown";
  if (wave < 3) return "lt3";
  if (wave < 6) return "3to6";
  return "ge6";
}
function gapBucket(gap) {
  if (gap === null) return "unknown";
  if (gap <= -10) return "le-10";
  if (gap <= -5) return "-10to-5";
  if (gap < 5) return "-5to5";
  if (gap < 10) return "5to10";
  return "ge10";
}
function directionBucket(value) {
  const text = String(value || "").trim();
  return text || "unknown";
}
function isNewEngine(input) {
  const text = JSON.stringify(input || {});
  return /新エンジン|新モーター|new\s*engine/i.test(text);
}
function add(map, key, row) {
  const item = map.get(key) || {
    key,
    n: 0,
    payout: 0,
    dates: new Set(),
    venues: new Set(),
    discovery: 0,
    holdout: 0,
    transitions: new Map()
  };
  item.n += 1;
  item.payout += row.payout;
  item.dates.add(row.date);
  item.venues.add(row.jcd);
  if (row.date < HOLDOUT) item.discovery += 1;
  else item.holdout += 1;
  item.transitions.set(row.transition, (item.transitions.get(row.transition) || 0) + 1);
  map.set(key, item);
}
function finish(map) {
  return [...map.values()].map(item => ({
    key: item.key,
    n: item.n,
    payout: item.payout,
    dates: item.dates.size,
    venues: item.venues.size,
    discovery: item.discovery,
    holdout: item.holdout,
    canTimeSplit: item.discovery >= MIN_DISCOVERY && item.holdout >= MIN_HOLDOUT,
    topTransitions: [...item.transitions.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([transition,n])=>({transition,n}))
  })).sort((a,b)=>b.n-a.n || b.payout-a.payout);
}
function main() {
  const seen = new Set();
  const misses = [];
  const failures = [];
  for (const filename of fs.readdirSync(DIR).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
    const date = filename.slice(0,8);
    const doc = JSON.parse(fs.readFileSync(path.join(DIR, filename), "utf8"));
    for (const row of rowsOf(doc)) {
      if (row?.result?.settled !== true) continue;
      const key = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const input = inputOf(row);
        const actual = ticketOf(row?.result?.resultTicket || row?.result?.review?.resultTicket);
        if (!input || !actual) continue;
        const prediction = core.buildPredictionData(input);
        const predictedHead = scenarioHead(mainScenarioOf(prediction));
        const actualHead = Number(actual.split("-")[0]);
        if (!(predictedHead >= 1 && predictedHead <= 6) || predictedHead === actualHead) continue;
        const analyses = analysesOf(prediction);
        const predictedBoat = findBoat(analyses, predictedHead);
        const actualBoat = findBoat(analyses, actualHead);
        const weather = weatherOf(input);
        const wind = metric(weather, ["windSpeed", "wind", "wind_speed"]);
        const wave = metric(weather, ["waveHeight", "wave", "wave_height"]);
        const windDir = weather.windDirection || weather.windDir || weather.wind_direction || input.windDirection || input.windDir;
        const features = {};
        for (const [name, paths] of Object.entries({
          st:["indexes.st","st"], ex:["indexes.ex","ex"], raceFlow:["indexes.raceFlow","raceFlow"],
          attack:["roleScores.attack","indexes.attack","attack"], hold:["roleScores.hold","indexes.hold","hold"],
          pickup:["roleScores.pickup","indexes.pickup","pickup"], local:["indexes.local","local"],
          national:["indexes.national","national"], road:["indexes.road","road"], total:["indexes.total","total"]
        })) {
          const p = metric(predictedBoat, paths);
          const a = metric(actualBoat, paths);
          features[name] = { predicted:p, actual:a, gap: a !== null && p !== null ? a-p : null };
        }
        misses.push({
          date,
          jcd:String(row.jcd || "").padStart(2,"0"),
          raceNo:Number(row.raceNo || 0),
          predictedHead,
          actualHead,
          transition:`${predictedHead}>${actualHead}`,
          actual,
          payout:Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0),
          currentHit:basicFive(prediction).includes(actual),
          wind,
          wave,
          windDir:directionBucket(windDir),
          newEngine:isNewEngine(input),
          features
        });
      } catch (error) {
        failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
      }
    }
  }

  const dimensions = {
    venue:new Map(), wind:new Map(), wave:new Map(), windDirection:new Map(), newEngine:new Map(),
    venueWind:new Map(), venueWave:new Map(), venueNewEngine:new Map(), transition:new Map()
  };
  const featureGaps = {};
  for (const name of ["st","ex","raceFlow","attack","hold","pickup","local","national","road","total"]) featureGaps[name] = new Map();

  for (const row of misses) {
    add(dimensions.venue, row.jcd, row);
    add(dimensions.wind, windBucket(row.wind), row);
    add(dimensions.wave, waveBucket(row.wave), row);
    add(dimensions.windDirection, row.windDir, row);
    add(dimensions.newEngine, row.newEngine ? "new" : "normal", row);
    add(dimensions.venueWind, `${row.jcd}|${windBucket(row.wind)}`, row);
    add(dimensions.venueWave, `${row.jcd}|${waveBucket(row.wave)}`, row);
    add(dimensions.venueNewEngine, `${row.jcd}|${row.newEngine ? "new" : "normal"}`, row);
    add(dimensions.transition, row.transition, row);
    for (const [name, value] of Object.entries(row.features)) add(featureGaps[name], gapBucket(value.gap), row);
  }

  const contextCandidates = [
    ...finish(dimensions.venueWind).map(x=>({family:"venueWind",...x})),
    ...finish(dimensions.venueWave).map(x=>({family:"venueWave",...x})),
    ...finish(dimensions.venueNewEngine).map(x=>({family:"venueNewEngine",...x})),
    ...Object.entries(featureGaps).flatMap(([name,map])=>finish(map).map(x=>({family:`gap:${name}`,...x})))
  ].filter(x=>x.canTimeSplit).sort((a,b)=>b.n-a.n || b.payout-a.payout);

  console.log(JSON.stringify({
    schemaVersion:1,
    source:"latest main with production third-six rescue enabled",
    holdoutStart:HOLDOUT,
    totalHeadMisses:misses.length,
    currentFiveHitsAmongHeadMisses:misses.filter(r=>r.currentHit).length,
    currentFiveMissesAmongHeadMisses:misses.filter(r=>!r.currentHit).length,
    dimensions:{
      transition:finish(dimensions.transition).slice(0,30),
      venue:finish(dimensions.venue).slice(0,24),
      wind:finish(dimensions.wind),
      wave:finish(dimensions.wave),
      windDirection:finish(dimensions.windDirection).slice(0,20),
      newEngine:finish(dimensions.newEngine),
      venueWind:finish(dimensions.venueWind).slice(0,40),
      venueWave:finish(dimensions.venueWave).slice(0,40),
      venueNewEngine:finish(dimensions.venueNewEngine).slice(0,40),
      featureGaps:Object.fromEntries(Object.entries(featureGaps).map(([name,map])=>[name,finish(map)]))
    },
    nextCandidates:contextCandidates.slice(0,30),
    selectionRule:"ranking only; no production change. Candidate must exist in discovery>=8 and holdout>=5 before any future A/B",
    failures,
    notes:{productionChanged:false,automaticApplication:false,oddsUsed:false,actualResultUsedOnlyForPostraceLabel:true}
  }, null, 2));
}
main();
