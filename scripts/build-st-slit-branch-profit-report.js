"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "st-slit-branch-profit-report.json");
const STAKE_PER_TICKET = 100;

function ticket(v) {
  const s = String(v?.ticket || v || "").trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(s) && new Set(s.split("-")).size === 3 ? s : "";
}
function tickets(v) { return [...new Set((Array.isArray(v) ? v : []).map(ticket).filter(Boolean))]; }
function raceKey(r={}) { return `${String(r.date||"")}-${String(r.jcd||"").padStart(2,"0")}-${Number(r.raceNo||0)}`; }
function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
}
function resultMap(docs) {
  const map=new Map();
  for (const d of docs) for (const r of (Array.isArray(d.races)?d.races:[])) if (r.resultAvailable && r.status==="finished") map.set(raceKey(r),r);
  return map;
}
function practicalTickets(record={}) {
  return tickets(record?.prediction?.practicalTickets || record?.prediction?.practicalSelection?.tickets);
}
function stEvidence(record={}) {
  const prediction=record.prediction||{};
  const core=prediction.aiCore||{};
  const scenarios=core.raceScenarios||{};
  const slit=scenarios?.evidence?.slit || core?.stSlitTheory || prediction?.stSlitTheory || {};
  const list=Array.isArray(scenarios.scenarios)?scenarios.scenarios:[];
  const adjustments=list.map(s=>Number(s?.slitAdjustment||0)).filter(Number.isFinite);
  const analyses=Array.isArray(core.analyses)?core.analyses:[];
  const stRows=analyses.map(a=>a?.stTheory).filter(Boolean);
  return {
    alert: (Array.isArray(slit.alerts)&&slit.alerts.length>0) || adjustments.some(v=>v>0),
    risk: (Array.isArray(slit.risks)&&slit.risks.length>0) || adjustments.some(v=>v<0),
    advantage: (Array.isArray(slit.advantages)&&slit.advantages.length>0),
    positiveAdjustment: adjustments.some(v=>v>0),
    negativeAdjustment: adjustments.some(v=>v<0),
    fHolder: analyses.some(a=>Number(a?.fCount||a?.entry?.fCount||0)>0),
    formal: stRows.length>0 && stRows.some(x=>x?.isFormal===true),
    supported: stRows.some(x=>x?.appliedToScore===true || x?.isFormal===true)
  };
}
function summarize(rows) {
  let stake=0, returned=0, hits=0;
  for (const row of rows) {
    const ts=practicalTickets(row.record); if (!ts.length) continue;
    const actual=ticket(row.result?.trifecta?.combination); const payout=Math.max(0,Number(row.result?.trifecta?.payout||0));
    stake += ts.length*STAKE_PER_TICKET;
    if (actual && ts.includes(actual)) { hits++; returned += payout; }
  }
  return { raceCount:rows.length, hitCount:hits, hitRate:rows.length?Math.round(hits/rows.length*1000)/10:null, stake, return:returned, profit:returned-stake, recoveryRate:stake?Math.round(returned/stake*1000)/10:null };
}
function build(predDocs,resultDocs) {
  const results=resultMap(resultDocs); const byKey=new Map();
  for (const d of predDocs) for (const r of (Array.isArray(d.predictions)?d.predictions:[])) {
    const key=raceKey(r); if (!key || !results.has(key)) continue;
    const ev=stEvidence(r); if (!ev.alert&&!ev.risk&&!ev.advantage&&!ev.positiveAdjustment&&!ev.negativeAdjustment&&!ev.supported) continue;
    byKey.set(key,{record:r,result:results.get(key),evidence:ev});
  }
  const rows=[...byKey.values()];
  const branches={
    all: rows,
    alert: rows.filter(r=>r.evidence.alert),
    advantage: rows.filter(r=>r.evidence.advantage),
    risk: rows.filter(r=>r.evidence.risk),
    positiveAdjustment: rows.filter(r=>r.evidence.positiveAdjustment),
    negativeAdjustment: rows.filter(r=>r.evidence.negativeAdjustment),
    fHolder: rows.filter(r=>r.evidence.fHolder),
    formal: rows.filter(r=>r.evidence.formal),
    unsupported: rows.filter(r=>!r.evidence.supported)
  };
  const summaries=Object.fromEntries(Object.entries(branches).map(([k,v])=>[k,summarize(v)]));
  const ranked=Object.entries(summaries).filter(([k,v])=>k!=="all"&&v.raceCount>=10&&v.recoveryRate!=null).sort((a,b)=>a[1].recoveryRate-b[1].recoveryRate).map(([branch,metrics],i)=>({rank:i+1,branch,...metrics}));
  return {schemaVersion:1,version:"st-slit-branch-profit-v1",generatedAt:new Date().toISOString(),source:"saved production predictions + official results",stakePerTicket:STAKE_PER_TICKET,productionChanged:false,summaries,weakBranchRanking:ranked};
}
function main(){const report=build(load(predictionDir),load(resultDir));fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(`ST/slit branches: ${report.summaries.all.raceCount}R`);}
if(require.main===module)main();
module.exports={ticket,tickets,raceKey,stEvidence,summarize,build};
