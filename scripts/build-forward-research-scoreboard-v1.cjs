'use strict';

const {execFileSync}=require('node:child_process');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');

const AUDITS=[
  ['signalAvailability','scripts/audit-prerace-theory-signal-forward-v1.cjs'],
  ['roleTicketShadow','scripts/analyze-role-ticket-shadow-v1.cjs'],
  ['roleTicketMarginalCap','scripts/analyze-role-ticket-marginal-cap-v1.cjs'],
  ['roleTicketSpecialTrigger','scripts/analyze-role-ticket-special-trigger-v1.cjs']
];

function run(rel){
  try{return JSON.parse(execFileSync(process.execPath,[path.join(ROOT,rel)],{encoding:'utf8',maxBuffer:20*1024*1024}));}
  catch(err){return {error:String(err?.message||err),available:false};}
}
function gateState(r){
  const gates=Array.isArray(r?.gates)?r.gates:[];
  return gates.map(g=>({n:g.n,reached:!!g.reached,status:g.status||null}));
}
function settledCount(r){
  for(const k of ['eligibleSettledRaceCount','eligibleSnapshotCount','forwardEligibleSettledCount']){
    if(Number.isFinite(Number(r?.[k]))) return Number(r[k]);
  }
  return 0;
}
function bestMode(modes){
  if(!modes||typeof modes!=='object') return null;
  const rows=Object.entries(modes).filter(([,v])=>v&&typeof v==='object'&&Number.isFinite(Number(v.roiPercent))&&Number(v.addedTickets||0)>0)
    .map(([name,v])=>({name,roiPercent:Number(v.roiPercent),rescueCount:Number(v.rescueCount||0),manboatRescueCount:Number(v.manboatRescueCount||0),addedTickets:Number(v.addedTickets||0)}))
    .sort((a,b)=>b.roiPercent-a.roiPercent||b.rescueCount-a.rescueCount);
  return rows[0]||null;
}
function build(){
  const audits={};
  for(const [name,rel] of AUDITS){const r=run(rel);audits[name]={script:rel,settledCount:settledCount(r),gates:gateState(r),bestMode:bestMode(r.modes||r.triggers),raw:r};}
  const counts=Object.values(audits).map(x=>x.settledCount).filter(Number.isFinite);
  const commonSettled=counts.length?Math.min(...counts):0;
  const nextGate=[50,100,250].find(n=>commonSettled<n)||250;
  return {schemaVersion:1,scoreboardId:'forward-research-scoreboard-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,commonSettledRaceCount:commonSettled,nextGate,progressPercent:Number(Math.min(100,100*commonSettled/nextGate).toFixed(1)),audits,policy:'Research consolidation only. No automatic adoption or production ticket changes.'};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
