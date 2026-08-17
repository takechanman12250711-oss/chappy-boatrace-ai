"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PREDICTION_DIR = path.join(ROOT, "data", "predictions");
const RESULT_DIR = path.join(ROOT, "data", "results");
const OUTPUT = path.join(ROOT, "data", "stats", "race-flow-3course-internal-report.json");
const TARGET_LABEL = "3コース攻め";
const STAKE_PER_TICKET = 100;

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort().map(name => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}
function raceKey(row = {}) { return `${String(row.date || "")}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`; }
function ticket(value) { const text = String(value?.ticket || value || "").trim(); return /^[1-6]-[1-6]-[1-6]$/.test(text) && new Set(text.split("-")).size === 3 ? text : ""; }
function tickets(value) { return [...new Set((Array.isArray(value) ? value : []).map(ticket).filter(Boolean))]; }
function practicalTickets(record = {}) { const prediction = record.prediction || {}; return tickets(prediction.practicalTickets || prediction?.practicalSelection?.tickets); }
function scenarioLabel(record = {}) { return String(record?.selection?.scenarioLabel || record?.prediction?.raceFlow?.scenario?.title || record?.prediction?.practicalSelection?.scenarioLabel || "").trim(); }
function evidence(record = {}) { return record?.prediction?.verificationEvidence || record?.prediction?.practicalSelection?.verificationEvidence || record?.verificationEvidence || null; }
function mainScenario(ev = {}) { if (ev?.mainScenario && typeof ev.mainScenario === "object") return ev.mainScenario; const rows = Array.isArray(ev?.scenarios) ? ev.scenarios : []; return rows[0] || null; }
function dimensions(record = {}) {
  const ev = evidence(record) || {}; const main = mainScenario(ev) || {}; const slitRaw = Number(main.slitAdjustment);
  const slitBucket = !Number.isFinite(slitRaw) ? "slit_missing" : slitRaw > 0 ? "slit_positive" : slitRaw < 0 ? "slit_negative" : "slit_neutral";
  const wall = ev.wallTheory || {}; const wallState = wall.formal === true && /^(壁成立|互角|壁崩れ)$/.test(String(wall.state || "")) ? String(wall.state) : "wall_missing";
  const attackerBoatNo = Number(ev?.roles?.attackerBoatNo || main.attackerBoatNo || main.headBoatNo || 0) || null;
  const attackerCourse = Number(ev?.roles?.attackerCourse || main.attackerCourse || main.attacker || 0) || null;
  const stRoles = Array.isArray(ev?.stSlit?.roles) ? ev.stSlit.roles : [];
  const attackerSt = attackerBoatNo ? stRoles.find(role => Number(role?.boatNo || 0) === attackerBoatNo) : null;
  const stSupport = attackerSt ? (attackerSt.isFormal === true || attackerSt.appliedToScore === true ? "st_formal_support" : "st_unconfirmed") : "st_missing";
  return { slitBucket, slitAdjustment: Number.isFinite(slitRaw) ? slitRaw : null, wallState, stSupport, attackerBoatNo, attackerCourse, hasDetailedEvidence: Boolean(Number.isFinite(slitRaw) || wallState !== "wall_missing" || stSupport !== "st_missing") };
}
function resultMap(docs) { const map = new Map(); for (const doc of docs) for (const row of (Array.isArray(doc.races) ? doc.races : [])) if (row?.resultAvailable && row?.status === "finished") map.set(raceKey(row), row); return map; }
function summarize(rows) {
  let settledCount = 0, hitCount = 0, stake = 0, returned = 0;
  for (const row of rows) { const result = row.result; if (!result) continue; const ts = practicalTickets(row.record); if (!ts.length) continue; settledCount++; stake += ts.length * STAKE_PER_TICKET; const actual = ticket(result?.trifecta?.combination); const payout = Math.max(0, Number(result?.trifecta?.payout || 0)); if (actual && ts.includes(actual)) { hitCount++; returned += payout; } }
  return { raceCount: rows.length, settledCount, hitCount, hitRate: settledCount ? Math.round(hitCount / settledCount * 1000) / 10 : null, stake, return: returned, profit: returned - stake, recoveryRate: stake ? Math.round(returned / stake * 1000) / 10 : null };
}
function build(predictionDocs, resultDocs) {
  const results = resultMap(resultDocs); const byKey = new Map(); let selectedCount = 0, verificationCount = 0;
  for (const doc of predictionDocs) {
    for (const [source, records] of [["selected", Array.isArray(doc.predictions) ? doc.predictions : []], ["verification", Array.isArray(doc.verificationPredictions) ? doc.verificationPredictions : []]]) {
      for (const record of records) { if (scenarioLabel(record) !== TARGET_LABEL) continue; if (source === "selected") selectedCount++; else verificationCount++; const key = raceKey(record); const current = byKey.get(key); if (!current || source === "selected") byKey.set(key, { key, source, record, result: results.get(key) || null, dimensions: dimensions(record) }); }
    }
  }
  const rows = [...byKey.values()]; const detailed = rows.filter(row => row.dimensions.hasDetailedEvidence);
  const groups = { all: rows, detailedEvidence: detailed, slit_positive: detailed.filter(r => r.dimensions.slitBucket === "slit_positive"), slit_neutral: detailed.filter(r => r.dimensions.slitBucket === "slit_neutral"), slit_negative: detailed.filter(r => r.dimensions.slitBucket === "slit_negative"), slit_missing: rows.filter(r => r.dimensions.slitBucket === "slit_missing"), "壁成立": detailed.filter(r => r.dimensions.wallState === "壁成立"), "互角": detailed.filter(r => r.dimensions.wallState === "互角"), "壁崩れ": detailed.filter(r => r.dimensions.wallState === "壁崩れ"), wall_missing: rows.filter(r => r.dimensions.wallState === "wall_missing"), st_formal_support: detailed.filter(r => r.dimensions.stSupport === "st_formal_support"), st_unconfirmed: detailed.filter(r => r.dimensions.stSupport === "st_unconfirmed"), st_missing: rows.filter(r => r.dimensions.stSupport === "st_missing") };
  const summaries = Object.fromEntries(Object.entries(groups).map(([name, list]) => [name, summarize(list)]));
  const weakBranchRanking = Object.entries(summaries).filter(([name, value]) => name !== "all" && name !== "detailedEvidence" && value.settledCount >= 10 && value.recoveryRate != null).sort((a,b)=>a[1].recoveryRate-b[1].recoveryRate).map(([branch,value],index)=>({rank:index+1,branch,...value}));
  return { schemaVersion:1, version:"race-flow-3course-internal-v1", generatedAt:new Date().toISOString(), targetLabel:TARGET_LABEL, source:"saved 3course attack records + verificationEvidence + official results", productionChanged:false, diagnostics:{selectedSourceCount:selectedCount,verificationSourceCount:verificationCount,deduplicatedRaceCount:rows.length,detailedEvidenceRaceCount:detailed.length,detailedEvidenceRate:rows.length?Math.round(detailed.length/rows.length*1000)/10:null}, summaries, weakBranchRanking, interpretation:{minimumBranchSettledCount:10,retrospectiveInferenceAllowed:false,automaticApplication:false,usableForPrediction:false,actualPurchase:false,note:"通常の3コース攻め全体は変更せず、保存済み内部証拠だけを分解する"} };
}
function main(){ const report=build(load(PREDICTION_DIR),load(RESULT_DIR)); fs.mkdirSync(path.dirname(OUTPUT),{recursive:true}); fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n"); console.log(`3course internal: ${report.diagnostics.detailedEvidenceRaceCount}/${report.diagnostics.deduplicatedRaceCount}R detailed`); }
if(require.main===module) main();
module.exports={raceKey,ticket,tickets,scenarioLabel,dimensions,summarize,build};
