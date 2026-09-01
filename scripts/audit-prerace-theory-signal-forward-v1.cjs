'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRED_DIR = path.join(ROOT, 'data', 'predictions');
const ACTIVATED_AT = Date.parse('2026-09-01T10:19:20Z'); // PR #761 merged
const GATES = [50, 100, 250];

function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
function parseTime(v) { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : null; }
function arrays(root) {
  const out = [];
  const seen = new Set();
  function walk(v) {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (Array.isArray(v.runs)) for (const x of v.runs) out.push(x);
    if (Array.isArray(v.predictions)) for (const x of v.predictions) out.push(x);
    if (Array.isArray(v.records)) for (const x of v.records) out.push(x);
    for (const x of Object.values(v)) walk(x);
  }
  walk(root);
  return out;
}
function conditionOf(r) { return r?.conditionSnapshot || r?.predictionConditions || r?.conditions || r?.snapshot || r?.prediction?.conditionSnapshot || null; }
function timeOf(r) {
  const vals = [r?.savedAt,r?.capturedAt,r?.generatedAt,r?.checkedAt,r?.createdAt,r?.timestamp,r?.prediction?.savedAt];
  for (const v of vals) { const t = parseTime(v); if (t !== null) return t; }
  return null;
}
function load() {
  if (!fs.existsSync(PRED_DIR)) return [];
  const files = fs.readdirSync(PRED_DIR).filter(f => /^202609\d{2}\.json$/.test(f)).sort();
  const rows=[];
  for (const f of files) {
    const root=JSON.parse(fs.readFileSync(path.join(PRED_DIR,f),'utf8'));
    for (const r of arrays(root)) {
      const t=timeOf(r); const c=conditionOf(r);
      if (t !== null && t >= ACTIVATED_AT && c?.sourceTiming === 'pre_deadline' && c?.officialResultUsed === false) rows.push({file:f,time:t,condition:c});
    }
  }
  return rows;
}
function countBoat(rows,key){let boats=0,total=0; for(const r of rows){for(const b of (Array.isArray(r.condition.boats)?r.condition.boats:[])){total++; if(finite(b?.[key]))boats++;}} return {boats,total,rate:total?Number((100*boats/total).toFixed(1)):0};}
function full(rows,key){let n=0; for(const r of rows){const b=Array.isArray(r.condition.boats)?r.condition.boats:[]; if(b.length===6&&b.every(x=>finite(x?.[key])))n++;} return n;}
function build(){
  const rows=load();
  const attack=countBoat(rows,'attackStrength'); const flow=countBoat(rows,'raceFlowPower'); const total=countBoat(rows,'totalScore');
  const completeAll=rows.filter(r=>{const b=Array.isArray(r.condition.boats)?r.condition.boats:[];return b.length===6&&b.every(x=>finite(x.attackStrength)&&finite(x.raceFlowPower)&&finite(x.totalScore));}).length;
  return {schemaVersion:1,auditId:'prerace-theory-signal-forward-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSnapshotCount:rows.length,availability:{attack,flow,total,fullAttackSnapshots:full(rows,'attackStrength'),fullFlowSnapshots:full(rows,'raceFlowPower'),fullTotalSnapshots:full(rows,'totalScore'),completeAllSnapshots:completeAll,completeAllRate:rows.length?Number((100*completeAll/rows.length).toFixed(1)):0},gates:GATES.map(n=>({n,reached:rows.length>=n,status:rows.length>=n?'ready_for_signal_outcome_analysis':'collecting'})),policy:'Observation only. No score, ticket, note, purchase, or UI change.'};
}
if(require.main===module) process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
