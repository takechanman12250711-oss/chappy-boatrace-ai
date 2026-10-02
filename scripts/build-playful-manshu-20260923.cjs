'use strict';
// Offline 2026-09-23 replay only. Never imported by production prediction code.
const fs=require('node:fs'),path=require('node:path');
const input=require('./analysis-input-contract');
const archive=require('./daily-prediction-source-archive');
const escape=require('./audit-escape-main.cjs');
const DATE='20260923';
const uniq=a=>[...new Set(a)];
const norm=a=>uniq((a||[]).map(input.normalizeTicket).filter(Boolean));
function savedTickets(p){return norm(p?.practicalTickets||p?.practicalSelection?.tickets||[])}
function entriesOf(r){const p=r?.prediction||{},c=p.preRaceConditions||{};return c.boats||c.escapeEvaluationEvidence?.entries||p.entries||[]}
function boatNo(x){const n=Number(x?.boatNo??x?.number??x?.waku??x?.boat);return n>=1&&n<=6?n:null}
function score(x,k){const n=Number(x?.[k]);return Number.isFinite(n)?n:0}
function candidates(record){
 const p=record.prediction||{}, base=savedTickets(p), ev=p.boatEvaluation?.evaluations||p.mainSheet?.evaluations||[], by=new Map(ev.map(x=>[boatNo(x),x]));
 const head=Number(p.mainSheet?.honmei?.boatNo||p.verificationEvidence?.marks?.honmei?.boatNo||0);
 const pool=norm(p.candidate24Tickets||[]);
 const out={headPlay:[],linkPlay:[],thirdPlay:[],boat5:[],boat6:[]};
 // Pre-registered playful rule: only already-evaluated alternate physical candidates; no result data, odds, name, gender or rookie inference.
 for(const t of pool){const b=t.split('-').map(Number);if(base.includes(t))continue;const e1=by.get(b[0]),e2=by.get(b[1]),e3=by.get(b[2]);
   if(b[0]!==head && (score(e1,'attack')>=65||score(e1,'tenkai')>=65)) out.headPlay.push(t);
   if(b[0]===head && (score(e2,'hold')>=65||score(e2,'expected')>=65)) out.linkPlay.push(t);
   if(b[0]===head && (score(e3,'pickup')>=65||score(e3,'expected')>=65)) out.thirdPlay.push(t);
   if(b.includes(5)) out.boat5.push(t); if(b.includes(6)) out.boat6.push(t);
 }
 for(const k of Object.keys(out)) out[k]=uniq(out[k]).slice(0,3);
 return {base,pool,out,head,attributeStatus:{female:'not-inferred',rookie:'not-inferred'},entries:entriesOf(record).map(e=>({boatNo:boatNo(e),registerNo:e.registerNo||e.registrationNumber||'',racerName:e.racerName||e.name||''}))};
}
function sum(rows,key){let stake=0,ret=0,hits=0;for(const r of rows){const ts=key==='base'?r.base:r.play[key];stake+=ts.length*100;if(ts.includes(r.actual)){hits++;ret+=r.payout}}return{races:rows.length,tickets:rows.reduce((n,r)=>n+(key==='base'?r.base:r.play[key]).length,0),hits,hitRate:rows.length?Math.round(hits/rows.length*10000)/100:0,stakeYen:stake,returnYen:ret,profitYen:ret-stake,roi:stake?Math.round(ret/stake*10000)/100:0}}
function main(root=process.cwd()){
 archive.restorePredictionSource({rootDirectory:root,date:DATE});
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/predictions',DATE+'.json'),'utf8')), chosen=new Map(), excluded={};
 for(const r of input.mergePredictionSources(d.predictions||[],d.verificationPredictions||[])){const key=input.raceKey(r);const reason=input.preDeadlineReason(r);if(!key||reason){excluded[reason||'invalid']=(excluded[reason||'invalid']||0)+1;continue}const old=chosen.get(key),at=Date.parse(r.selectedAt||r.capturedAt||'');if(!old||at>Date.parse(old.selectedAt||old.capturedAt||''))chosen.set(key,r)}
 const rd=JSON.parse(fs.readFileSync(path.join(root,'data/results',DATE+'.json'),'utf8')), results=new Map();for(const r of rd.races||[]){const k=input.raceKey(r,DATE);if(k)results.set(k,r)}
 const rows=[];for(const [key,r] of chosen){const result=escape.resultOf(results.get(key));if(!result||result.excluded)continue;const c=candidates(r);if(!c.base.length)continue;const play={};for(const k of Object.keys(c.out))play[k]=uniq([...c.base,...c.out[k]]);rows.push({raceKey:key,jcd:key.split('-')[1],raceNo:Number(key.split('-')[2]),head:c.head,base:c.base,play,added:c.out,actual:result.actual,payout:result.payout,attributeStatus:c.attributeStatus})}
 rows.sort((a,b)=>a.raceKey.localeCompare(b.raceKey));
 const modes=['headPlay','linkPlay','thirdPlay','boat5','boat6'];const report={schemaVersion:1,analysisId:'playful-manshu-20260923-v1',date:DATE,generatedAt:new Date().toISOString(),productionChanged:false,automaticProductionChange:false,rule:{source:'saved pre-deadline candidate24 + saved boat evaluation only',minimumRoleScore:65,maxAddedTicketsPerMode:3,oddsUsed:false,resultUsedForCandidateGeneration:false,female:'not inferred unless explicit saved attribute exists',rookie:'not inferred unless explicit saved attribute exists'},input:{eligiblePredictions:chosen.size,settledEvaluated:rows.length,excluded},baseline:sum(rows,'base'),modes:Object.fromEntries(modes.map(k=>[k,sum(rows,k)])),wakamatSu:rows.filter(r=>r.jcd==='20'),rows};
 const out=path.join(root,'data/stats/playful-manshu-20260923.json');archive.atomicWrite(out,JSON.stringify(report)+'\n');console.log(JSON.stringify({input:report.input,baseline:report.baseline,modes:report.modes,wakamatsu:report.wakamatSu.length}));return report;
}
if(require.main===module)main();module.exports={candidates,sum,main};
