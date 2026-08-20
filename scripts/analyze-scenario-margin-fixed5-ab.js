"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
try { require("../js/third-six-rescue-fixed5"); } catch {}
const core = global.ChappyAICore;

const DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT = "20260812";
const MIN_DISCOVERY = 20;
const MIN_HOLDOUT = 10;

function rowsOf(doc) { return [...(doc.predictions || []), ...(doc.verificationPredictions || [])]; }
function ticketOf(value) {
  const parts = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : "";
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
function fiveFromFormations(f) {
  return [...(f?.main || []).slice(0, 3), ...(f?.safety || []).slice(0, 2)].map(ticketOf).filter(Boolean).slice(0, 5);
}
function currentFive(prediction) { return fiveFromFormations(prediction?.formations || {}); }
function analysesOf(prediction) {
  return prediction?.analyses || prediction?.evaluations || prediction?.boatEvaluation?.evaluations || [];
}
function scenarioHead(s) {
  return Number(s?.headBoatNo || s?.attackerBoatNo || s?.attacker || s?.outcome?.firstCandidates?.[0]?.boatNo || s?.outcome?.firstCandidates?.[0] || 0);
}
function scoreOf(s) {
  const n = Number(s?.score);
  return Number.isFinite(n) ? n : null;
}
function scenarioType(s) { return String(s?.type || "unknown"); }
function gapBucket(gap) {
  if (gap === null) return "unknown";
  if (gap <= 2) return "le2";
  if (gap <= 5) return "2to5";
  if (gap <= 8) return "5to8";
  if (gap <= 12) return "8to12";
  return "gt12";
}
function counterScenarios(raceScenarios, alt) {
  const outcome = alt?.outcome || {};
  const holdPickup = raceScenarios?.holdPickupTheory || {};
  return {
    ...raceScenarios,
    mainScenario: alt,
    scenarios: [alt, ...(raceScenarios?.scenarios || []).filter(s => s !== alt)],
    attacker: scenarioHead(alt),
    blockedBoats: [...(alt?.blockedBoats || [])],
    holdPickupTheory: {
      ...holdPickup,
      secondCandidates: Array.isArray(outcome.secondCandidates) ? outcome.secondCandidates : holdPickup.secondCandidates,
      thirdCandidates: Array.isArray(outcome.thirdCandidates) ? outcome.thirdCandidates : holdPickup.thirdCandidates,
      remainers: Array.isArray(outcome.remainers) ? outcome.remainers : holdPickup.remainers,
      pickupCandidates: Array.isArray(outcome.pickupCandidates) ? outcome.pickupCandidates : holdPickup.pickupCandidates
    }
  };
}
function chooseAlt(prediction) {
  const rs = prediction?.raceScenarios || {};
  const main = rs.mainScenario || rs.scenarios?.[0] || null;
  if (!main) return null;
  const mainHead = scenarioHead(main);
  const candidates = (rs.scenarios || [])
    .filter(s => s !== main && scenarioHead(s) >= 1 && scenarioHead(s) <= 6 && scenarioHead(s) !== mainHead)
    .sort((a,b) => (scoreOf(b) ?? -Infinity) - (scoreOf(a) ?? -Infinity));
  return candidates[0] ? { main, alt: candidates[0], rs } : null;
}
function summarize(rows) {
  const A = { races: rows.length, hits: 0, payout: 0 };
  const B = { races: rows.length, hits: 0, payout: 0 };
  let gains = 0, losses = 0;
  const gainDates = new Set(), gainVenues = new Set(), lossDates = new Set(), lossVenues = new Set();
  for (const r of rows) {
    if (r.aHit) { A.hits++; A.payout += r.payout; }
    if (r.bHit) { B.hits++; B.payout += r.payout; }
    if (r.bHit && !r.aHit) { gains++; gainDates.add(r.date); gainVenues.add(r.jcd); }
    if (r.aHit && !r.bHit) { losses++; lossDates.add(r.date); lossVenues.add(r.jcd); }
  }
  return {
    A, B,
    deltaHits: B.hits - A.hits,
    deltaPayout: B.payout - A.payout,
    gains, losses,
    gainDates: gainDates.size,
    gainVenues: gainVenues.size,
    lossDates: lossDates.size,
    lossVenues: lossVenues.size,
    stakeDelta: 0
  };
}
function passes(stat) {
  return stat.A.races >= MIN_DISCOVERY && stat.deltaHits > 0 && stat.deltaPayout >= 0 && stat.gains >= stat.losses && stat.gainDates >= 3 && stat.gainVenues >= 3;
}

const all = [], seen = new Set(), failures = [];
for (const fn of fs.readdirSync(DIR).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
  const date = fn.slice(0,8);
  const doc = JSON.parse(fs.readFileSync(path.join(DIR, fn), "utf8"));
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
      const picked = chooseAlt(prediction);
      if (!picked) continue;
      const mainScore = scoreOf(picked.main), altScore = scoreOf(picked.alt);
      if (mainScore === null || altScore === null) continue;
      const aFive = currentFive(prediction);
      const bFormations = core.buildFormations(analysesOf(prediction), counterScenarios(picked.rs, picked.alt));
      const bFive = fiveFromFormations(bFormations);
      if (aFive.length < 5 || bFive.length < 5) continue;
      const mainHead = scenarioHead(picked.main), altHead = scenarioHead(picked.alt);
      const gap = mainScore - altScore;
      all.push({
        date,
        jcd: String(row.jcd || "").padStart(2,"0"),
        raceNo: Number(row.raceNo || 0),
        actual,
        payout: Number(row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0),
        aHit: aFive.includes(actual),
        bHit: bFive.includes(actual),
        mainType: scenarioType(picked.main),
        altType: scenarioType(picked.alt),
        mainHead,
        altHead,
        gap,
        bucket: gapBucket(gap),
        ruleKey: `${scenarioType(picked.main)}>${scenarioType(picked.alt)}|${mainHead}>${altHead}|${gapBucket(gap)}`
      });
    } catch (error) {
      failures.push(`${date}-${row.jcd}-${row.raceNo}:${error?.message || error}`);
    }
  }
}

const discovery = all.filter(r => r.date < HOLDOUT);
const holdout = all.filter(r => r.date >= HOLDOUT);
const keys = [...new Set(discovery.map(r => r.ruleKey))];
const discoveryRules = keys.map(key => {
  const rows = discovery.filter(r => r.ruleKey === key);
  return { key, discovery: summarize(rows) };
}).filter(x => x.discovery.A.races >= MIN_DISCOVERY && passes(x.discovery))
  .sort((a,b) => b.discovery.deltaHits - a.discovery.deltaHits || b.discovery.deltaPayout - a.discovery.deltaPayout);

const frozenKeys = discoveryRules.map(x => x.key);
const results = discoveryRules.map(x => {
  const hRows = holdout.filter(r => r.ruleKey === x.key);
  const hold = summarize(hRows);
  const holdPass = hold.A.races >= MIN_HOLDOUT && hold.deltaHits > 0 && hold.deltaPayout >= 0 && hold.gains >= hold.losses && hold.gainDates >= 3 && hold.gainVenues >= 3;
  return { ...x, holdout: hold, stablePositive: holdPass };
});

const appliedDiscovery = discovery.filter(r => frozenKeys.includes(r.ruleKey));
const appliedHoldout = holdout.filter(r => frozenKeys.includes(r.ruleKey));

console.log(JSON.stringify({
  schemaVersion: 1,
  source: "latest main; counterfactual fixed-five generated from best alternate pre-race scenario",
  holdoutStart: HOLDOUT,
  totalEvaluated: all.length,
  discoveryRulesTested: keys.length,
  frozenDiscoveryPositiveRules: frozenKeys,
  appliedOnly: { discovery: summarize(appliedDiscovery), holdout: summarize(appliedHoldout) },
  perRule: results,
  stablePositiveRules: results.filter(x => x.stablePositive).map(x => x.key),
  failures,
  gate: "rule is learned only on discovery; production candidate requires discovery>=20 and holdout>=10, positive hit delta, nonnegative payout delta, gains>=losses, gains on >=3 dates and >=3 venues in both periods",
  notes: {
    productionChanged: false,
    oddsUsed: false,
    holdoutUsedForRuleLearning: false,
    preRaceActivationUsesOnlyScenarioTypeHeadAndScoreGap: true,
    actualResultUsedOnlyForPostraceEvaluation: true,
    fixedFiveTickets: true
  }
}, null, 2));
