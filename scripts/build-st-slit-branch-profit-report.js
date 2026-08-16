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
  const coreScenarios=core.raceScenarios||{};
  const verification=prediction.verificationEvidence||{};
  const storedScenarios=Array.isArray(verification.scenarios)?verification.scenarios:[];
  const coreScenarioList=Array.isArray(coreScenarios.scenarios)?coreScenarios.scenarios:[];
  const list=storedScenarios.length?storedScenarios:coreScenarioList;
  const slit=verification?.slit || coreScenarios?.evidence?.slit || core?.stSlitTheory || prediction?.stSlitTheory || {};
  const adjustments=list.filter(s=>s && Object.prototype.hasOwnProperty.call(s,"slitAdjustment")).map(s=>Number(s.slitAdjustment)).filter(Number.isFinite);
  const reasons=list.flatMap(s=>Array.isArray(s?.slitReasons)?s.slitReasons:[]).map(String);
  const analyses=Array.isArray(core.analyses)?core.analyses:[];
  const stRows=analyses.map(a=>a?.stTheory).filter(Boolean);
  const storedRoles=Array.isArray(verification?.stSlit?.roles)?verification.stSlit.roles:[];
  const roleRows=storedRoles.length?storedRoles:stRows;
  const positive=adjustments.some(v=>v>0);
  const negative=adjustments.some(v=>v<0);
  const reasonAlert=reasons.some(v=>/優勢|先行|早い|速い|攻め/i.test(v));
  const reasonRisk=reasons.some(v=>/劣勢|遅れ|遅い|凹|F持ち|フライング/i.test(v));
  return {
    alert:(Array.isArray(slit.alerts)&&slit.alerts.length>0)||positive||reasonAlert,
    risk:(Array.isArray(slit.risks)&&slit.risks.length>0)||negative||reasonRisk,
    advantage:(Array.isArray(slit.advantages)&&slit.advantages.length>0)||roleRows.some(x=>/advantage|優勢/i.test(String(x?.status||""))),
    positiveAdjustment:positive,
    negativeAdjustment:negative,
    fHolder:analyses.some(a=>Number(a?.fCount||a?.entry?.fCount||0)>0)||roleRows.some(x=>Number(x?.fCount||0)>0),
    formal:roleRows.length>0&&roleRows.some(x=>x?.isFormal===true),
    supported:roleRows.some(x=>x?.appliedToScore===true||x?.isFormal===true),
    source:storedScenarios.length?"verificationEvidence":"aiCore",
    scenarioCount:list.length,
    adjustmentFieldCount:adjustments.length,
    roleCount:roleRows.length,
    adjustments
  };
}
function normalizeVerificationResult(record={}, results=new Map()) {
  const embedded=record.result||{};
  if(embedded.settled && ticket(embedded.resultTicket)) {
    return {trifecta:{combination:ticket(embedded.resultTicket),payout:Math.max(0,Number(embedded.payout||0))}};
  }
  return results.get(raceKey(record))||null;
}
function summarize(rows) {
  let stake=0,returned=0,hits=0,settledCount=0;
  for(const row of rows){
    if(!row.result)continue;
    settledCount++;
    const ts=practicalTickets(row.record);if(!ts.length)continue;
    const actual=ticket(row.result?.trifecta?.combination);const payout=Math.max(0,Number(row.result?.trifecta?.payout||0));
    stake+=ts.length*STAKE_PER_TICKET;
    if(actual&&ts.includes(actual)){hits++;returned+=payout;}
  }
  return {raceCount:rows.length,settledCount,hitCount:hits,hitRate:settledCount?Math.round(hits/settledCount*1000)/10:null,stake,return:returned,profit:returned-stake,recoveryRate:stake?Math.round(returned/stake*1000)/10:null};
}
function diagnose(records) {
  let raceCount=0, scenarioEvidenceRaceCount=0, adjustmentEvidenceRaceCount=0, stSlitRoleEvidenceRaceCount=0;
  for (const record of records) {
    raceCount++;
    const ev=stEvidence(record);
    if(ev.source==="verificationEvidence"&&ev.scenarioCount>0)scenarioEvidenceRaceCount++;
    if(ev.adjustmentFieldCount>0)adjustmentEvidenceRaceCount++;
    if(ev.roleCount>0)stSlitRoleEvidenceRaceCount++;
  }
  return {raceCount,scenarioEvidenceRaceCount,adjustmentEvidenceRaceCount,stSlitRoleEvidenceRaceCount};
}
function branchSummaries(rows) {
  const branches={all:rows,alert:rows.filter(r=>r.evidence.alert),advantage:rows.filter(r=>r.evidence.advantage),risk:rows.filter(r=>r.evidence.risk),positiveAdjustment:rows.filter(r=>r.evidence.positiveAdjustment),negativeAdjustment:rows.filter(r=>r.evidence.negativeAdjustment),fHolder:rows.filter(r=>r.evidence.fHolder),formal:rows.filter(r=>r.evidence.formal),unsupported:rows.filter(r=>!r.evidence.supported)};
  return Object.fromEntries(Object.entries(branches).map(([k,v])=>[k,summarize(v)]));
}
function build(predDocs,resultDocs){
  const results=resultMap(resultDocs);const byKey=new Map();
  const selectedRecords=predDocs.flatMap(d=>Array.isArray(d.predictions)?d.predictions:[]);
  const verificationRecords=predDocs.flatMap(d=>Array.isArray(d.verificationPredictions)?d.verificationPredictions:[]);
  let verificationEvidenceRaceCount=0,adjustmentEvidenceRaceCount=0;
  for(const r of selectedRecords){
    const ev=stEvidence(r);
    const key=raceKey(r);if(!key||!results.has(key))continue;
    if(ev.source==="verificationEvidence"&&ev.scenarioCount>0)verificationEvidenceRaceCount++;
    if(ev.adjustmentFieldCount>0)adjustmentEvidenceRaceCount++;
    if(!ev.alert&&!ev.risk&&!ev.advantage&&!ev.positiveAdjustment&&!ev.negativeAdjustment&&!ev.supported)continue;
    byKey.set(key,{record:r,result:results.get(key),evidence:ev});
  }
  const selectedDiagnostics=diagnose(selectedRecords);
  const verificationDiagnostics=diagnose(verificationRecords);
  const rows=[...byKey.values()];
  const summaries=branchSummaries(rows);
  const ranked=Object.entries(summaries).filter(([k,v])=>k!=="all"&&v.settledCount>=10&&v.recoveryRate!=null).sort((a,b)=>a[1].recoveryRate-b[1].recoveryRate).map(([branch,metrics],i)=>({rank:i+1,branch,...metrics}));

  const prospectiveRows=verificationRecords
    .map(record=>({record,evidence:stEvidence(record),result:normalizeVerificationResult(record,results)}))
    .filter(row=>row.evidence.adjustmentFieldCount>0);
  const prospectiveSummaries=branchSummaries(prospectiveRows);
  const firstEvidence=prospectiveRows.length?{
    raceKey:raceKey(prospectiveRows[0].record),
    selectedAt:prospectiveRows[0].record.selectedAt||null,
    settled:Boolean(prospectiveRows[0].result),
    adjustments:prospectiveRows[0].evidence.adjustments
  }:null;

  return {
    schemaVersion:5,
    version:"st-slit-branch-profit-v5",
    generatedAt:new Date().toISOString(),
    source:"selected production predictions + official results; ST evidence-bearing verification predictions are a separate prospective shadow cohort",
    stakePerTicket:STAKE_PER_TICKET,
    productionChanged:false,
    evidenceDiagnostics:{
      totalPredictionRaceCount:selectedDiagnostics.raceCount,
      verificationEvidenceRaceCountAll:selectedDiagnostics.scenarioEvidenceRaceCount,
      adjustmentEvidenceRaceCountAll:selectedDiagnostics.adjustmentEvidenceRaceCount,
      stSlitRoleEvidenceRaceCountAll:selectedDiagnostics.stSlitRoleEvidenceRaceCount,
      verificationEvidenceRaceCount,
      adjustmentEvidenceRaceCount,
      verificationPredictions:verificationDiagnostics
    },
    summaries,
    weakBranchRanking:ranked,
    verificationProspective:{
      label:"ST/slit evidence prospective shadow cohort",
      actualPurchase:false,
      oldRecordsBackfilled:false,
      evidenceRaceCount:prospectiveRows.length,
      firstEvidence,
      summaries:prospectiveSummaries
    }
  };
}
function main(){const report=build(load(predictionDir),load(resultDir));fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(`ST/slit selected evidence ${report.evidenceDiagnostics.adjustmentEvidenceRaceCountAll}R / prospective verification ${report.verificationProspective.evidenceRaceCount}R`);}
if(require.main===module)main();
module.exports={ticket,tickets,raceKey,stEvidence,normalizeVerificationResult,summarize,diagnose,branchSummaries,build};
