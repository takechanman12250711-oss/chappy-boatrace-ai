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

const rows = (d) => [...(d.predictions || []), ...(d.verificationPredictions || [])];

function tk(v) {
  const m = String(v?.ticket || v || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).join("-") : "";
}
function dataOf(r) {
  const s = r?.prediction?.preRaceConditions || r?.preRaceConditions;
  if (!s || !Array.isArray(s.boats) || s.boats.length < 5) return null;
  return {...s, entries:s.boats, boats:s.boats, jcd:r.jcd, stadiumCode:r.jcd, venueCode:r.jcd, placeName:r.place, venueName:r.place, raceNo:r.raceNo, rno:r.raceNo, weather:s.weather || {}};
}
function list(v) { return (Array.isArray(v) ? v : []).map((x) => tk(x?.ticket || x)).filter(Boolean); }
function nums(v) { return [...new Set((Array.isArray(v) ? v : []).map((x) => Number(x?.boatNo ?? x)).filter((n) => n >= 1 && n <= 6))]; }
function pay(r) { return Number(r?.result?.payout || r?.result?.officialPayoutPer100 || r?.result?.review?.payout || 0); }
function make() { return {n:0, baseHits:0, newHits:0, gains:0, added:0, ret:0, gainRaces:[]}; }
function finish(x) { return {...x, baseHitRate:x.n ? Number((x.baseHits/x.n*100).toFixed(2)) : 0, hitRate:x.n ? Number((x.newHits/x.n*100).toFixed(2)) : 0, roi:x.added ? Number((x.ret/(x.added*100)*100).toFixed(2)) : 0}; }

function evalRace(r, date) {
  const data = dataOf(r);
  const actual = tk(r?.result?.resultTicket || r?.result?.review?.resultTicket);
  if (!data || !actual) return null;

  const prediction = global.createPrediction(data);
  const sel = selector.select(prediction);
  const base = list(sel?.tickets);
  const baseHit = base.includes(actual);
  const ai = core.buildPredictionData(data);
  const rs = ai?.raceScenarios || {};
  const scenarios = Array.isArray(rs.scenarios) ? rs.scenarios : [];
  const analyses = Array.isArray(ai?.analyses) ? ai.analyses : (Array.isArray(ai?.boatAnalyses) ? ai.boatAnalyses : []);
  const pickupScores = new Map(analyses.map((a) => [Number(a?.boatNo || 0), Number(a?.roleScores?.pickup || 0)]));
  const holdScores = new Map(analyses.map((a) => [Number(a?.boatNo || 0), Number(a?.roleScores?.hold || 0)]));
  const pickups = nums(rs?.pickupCandidates);
  const remainers = nums(rs?.remainers);
  const followers = new Set(nums(rs?.followers));

  const raw = [];
  for (const sc of scenarios) {
    const head = Number(sc?.attacker || 0);
    const existingSecond = new Set(nums(sc?.outcome?.secondCandidates));
    const existingThird = new Set(nums(sc?.outcome?.thirdCandidates));
    if (!head) continue;

    for (const second of pickups) {
      if (second === head || existingSecond.has(second) || (pickupScores.get(second) || 0) < 65) continue;
      for (const third of remainers) {
        if (third === head || third === second || existingThird.has(third)) continue;
        if (!followers.has(third) || (holdScores.get(third) || 0) < 65) continue;
        raw.push({ticket:`${head}-${second}-${third}`, scenarioScore:Number(sc?.score || 0), pickupScore:pickupScores.get(second) || 0, holdScore:holdScores.get(third) || 0, second, third, scenarioType:sc?.type || null});
      }
    }
  }

  const seen = new Set();
  const cap = Math.max(0, 10 - base.length);
  const eligible = raw
    .filter((x) => {
      if (base.includes(x.ticket) || seen.has(x.ticket)) return false;
      seen.add(x.ticket);
      return true;
    })
    .sort((a,b) => b.scenarioScore-a.scenarioScore || b.pickupScore-a.pickupScore || b.holdScore-a.holdScore || a.ticket.localeCompare(b.ticket))
    .slice(0, cap);
  const hit = baseHit || eligible.some((x) => x.ticket === actual);
  return {actual, baseHit, hit, eligible, payout:pay(r), raceKey:r?.raceKey || `${date}-${r.jcd}-${r.raceNo}`};
}

function add(x,e,date) {
  x.n++;
  if (e.baseHit) x.baseHits++;
  if (e.hit) x.newHits++;
  x.added += e.eligible.length;
  if (!e.baseHit && e.hit) {
    x.gains++;
    x.ret += e.payout;
    if (x.gainRaces.length < 40) x.gainRaces.push({raceKey:e.raceKey,date,actual:e.actual,payout:e.payout,added:e.eligible.length,tickets:e.eligible});
  }
}

const target = {all:make(), train:make(), test:make(), days:{}};
const historical = {preTarget:make(), target:make(), postTarget:make(), all:make(), days:{}};
const uniqueSeen = new Set();

for (const f of fs.readdirSync(dir).filter((x) => /^\d{8}\.json$/.test(x)).sort()) {
  const date = f.slice(0,8);
  const d = JSON.parse(fs.readFileSync(path.join(dir,f), "utf8"));
  for (const r of rows(d)) {
    if (r?.result?.settled !== true) continue;
    const e = evalRace(r,date);
    if (!e) continue;
    const n = Number(date);
    if (n >= 20260807 && n <= 20260810) {
      add(target.all,e,date);
      add(n <= 20260808 ? target.train : target.test,e,date);
      target.days[date] ??= make();
      add(target.days[date],e,date);
    }
    if (uniqueSeen.has(e.raceKey)) continue;
    uniqueSeen.add(e.raceKey);
    add(historical.all,e,date);
    const period = n < 20260807 ? historical.preTarget : (n <= 20260810 ? historical.target : historical.postTarget);
    add(period,e,date);
    historical.days[date] ??= make();
    add(historical.days[date],e,date);
  }
}

for (const k of ["all","train","test"]) target[k] = finish(target[k]);
for (const k of Object.keys(target.days)) target.days[k] = finish(target.days[k]);
for (const k of ["preTarget","target","postTarget","all"]) historical[k] = finish(historical[k]);
for (const k of Object.keys(historical.days)) historical.days[k] = finish(historical.days[k]);

const out = {rule:{pickupScoreMin:65, holdScoreMin:65, requiresSecond:["pickupCandidates"], requiresThird:["remainers","followers"], maxTickets:10}, targetRowBasis:target, historicalUniqueRaceBasis:historical};
fs.mkdirSync("tmp-analysis-output", {recursive:true});
fs.writeFileSync("tmp-analysis-output/pickup-remainer-swap.json", JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
