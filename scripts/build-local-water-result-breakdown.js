"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-result-breakdown.json");

function arr(v) { return Array.isArray(v) ? v : []; }
function key(r = {}) { return `${r.date}-${String(r.jcd || "").padStart(2, "0")}-${Number(r.raceNo || 0)}`; }
function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).sort()
    .map(n => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")));
}
function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) for (const name of ["predictions", "verificationPredictions"]) {
    for (const row of arr(doc[name])) {
      const k = key(row);
      if (name === "predictions" || !map.has(k)) map.set(k, row);
    }
  }
  return [...map.values()];
}
function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) for (const race of arr(doc.races)) {
    if (race?.resultAvailable === true && race?.status === "finished") map.set(key(race), race);
  }
  return map;
}
function evidence(record = {}) {
  const p = record.prediction || {};
  const s = p.venueWaterSupport || p?.verificationEvidence?.localWater || {};
  const venue = String(s.venue || "").trim();
  const windRaw = Number(s.wind), waveRaw = Number(s.wave);
  const wind = Number.isFinite(windRaw) ? windRaw : null;
  const wave = Number.isFinite(waveRaw) ? waveRaw : null;
  const tide = String(s.tide || "").trim();
  const statements = [...arr(s.statements), ...arr(s.confirmations), ...arr(s.confirms), ...arr(s.cautions), ...arr(s.alerts)].map(String);
  const formal = Boolean(venue) && statements.length > 0 && (wind !== null || wave !== null || Boolean(tide) || statements.some(x => /イン|差し|潮|風|波|水面|ナイター|展示|乗り心地/.test(x)));
  return { formal, venue, wind, wave, tide, statements };
}
function branches(e = {}) {
  const out = [`venue:${e.venue}`];
  if (e.wind !== null) out.push(e.wind >= 5 ? "wind:5plus" : e.wind >= 3 ? "wind:3to4" : "wind:0to2");
  if (e.wave !== null) out.push(e.wave >= 5 ? "wave:5plus" : e.wave >= 3 ? "wave:3to4" : "wave:0to2");
  if (e.tide) out.push("tide:present");
  if (e.statements.some(x => /イン/.test(x))) out.push("rule:in");
  if (e.statements.some(x => /差し/.test(x))) out.push("rule:sashi");
  if (e.statements.some(x => /潮/.test(x))) out.push("rule:tide");
  return [...new Set(out)];
}
function actualHead(result = {}) {
  const combo = String(result?.trifecta?.combination || result?.resultTicket || "").trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(combo) ? Number(combo.split("-")[0]) : null;
}
function predictedHead(record = {}) {
  const p = record.prediction || {};
  return Number(p?.verificationEvidence?.mainScenario?.headBoatNo ?? p?.aiCore?.raceScenarios?.mainScenario?.headBoatNo ?? p?.raceFlow?.scenario?.headBoatNo ?? 0) || null;
}
function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const rows = predictionRows(predDocs).map(record => ({ record, evidence: evidence(record), result: results.get(key(record)) || null }))
    .filter(row => row.evidence.formal && row.result && actualHead(row.result));
  const buckets = new Map();
  for (const row of rows) {
    const actual = actualHead(row.result), predicted = predictedHead(row.record);
    for (const branch of branches(row.evidence)) {
      const b = buckets.get(branch) || { branch, settledCount: 0, predictedHeadAvailableCount: 0, predictedHeadHitCount: 0, actualHead1Count: 0, actualOutsideHeadCount: 0 };
      b.settledCount++;
      if (predicted) { b.predictedHeadAvailableCount++; if (predicted === actual) b.predictedHeadHitCount++; }
      if (actual === 1) b.actualHead1Count++; else b.actualOutsideHeadCount++;
      buckets.set(branch, b);
    }
  }
  const breakdown = [...buckets.values()].map(b => ({
    ...b,
    predictedHeadHitRate: b.predictedHeadAvailableCount ? Math.round(b.predictedHeadHitCount / b.predictedHeadAvailableCount * 1000) / 10 : null,
    actualHead1Rate: b.settledCount ? Math.round(b.actualHead1Count / b.settledCount * 1000) / 10 : null,
    actualOutsideHeadRate: b.settledCount ? Math.round(b.actualOutsideHeadCount / b.settledCount * 1000) / 10 : null
  })).sort((a, b) => b.settledCount - a.settledCount || a.branch.localeCompare(b.branch));
  return {
    schemaVersion: 1,
    version: "local-water-result-breakdown-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "締切前に保存済みの当地・水面正式証拠だけを公式結果と照合。後付け分類はしない。",
    settledFormalEvidenceRaceCount: rows.length,
    breakdown
  };
}
function main() {
  const report = build(load(path.join(root, "data", "predictions")), load(path.join(root, "data", "results")));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`local water result breakdown: ${report.settledFormalEvidenceRaceCount} settled formal-evidence races`);
}
if (require.main === module) main();
module.exports = { evidence, branches, actualHead, predictedHead, build };
