"use strict";

const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../js/ai-core");
const core = global.ChappyAICore;

const DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT = "20260812";
const MIN_DISCOVERY = 8;
const MIN_HOLDOUT = 5;
const MIN_TRANSITION_DISCOVERY = 5;

function rowsOf(d){return [...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticketOf(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function inputOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return {...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function five(p){const f=p?.formations||{};return [...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticketOf).filter(Boolean);}
function scenario(p){const r=p?.raceScenarios||{};return r.mainScenario||r.scenarios?.[0]||{};}
function head(s){return Number(s?.headBoatNo||s?.attackerBoatNo||s?.attacker||s?.outcome?.firstCandidates?.[0]?.boatNo||s?.outcome?.firstCandidates?.[0]||0);}
function windBucket(v){v=Number(v);if(!Number.isFinite(v))return"unknown";if(v<2)return"lt2";if(v<4)return"2to4";if(v<6)return"4to6";return"ge6";}
function waveBucket(v){v=Number(v);if(!Number.isFinite(v))return"unknown";if(v<3)return"lt3";if(v<6)return"3to6";return"ge6";}
function contexts(r,input){const w=input.weather||{};return [`venueWind:${String(r.jcd||"").padStart(2,"0")}|${windBucket(w.windSpeed??w.wind??w.wind_speed)}`,`venueWave:${String(r.jcd||"").padStart(2,"0")}|${waveBucket(w.waveHeight??w.wave??w.wave_height)}`];}
function stat(rows,key){return {races:rows.length,hits:rows.filter(x=>x[key]).length,payout:rows.reduce((a,x)=>a+(x[key]?x.payout:0),0)};}
function rate(s){return s.races?s.hits/s.races:0;}
function replaceHead(ticket,from,to){const p=ticket.split("-");if(p.length!==3||Number(p[0])!==from)return ticket;p[0]=String(to);if(new Set(p).size<3)return"";return p.join("-");}
function rerankedFive(base,from,to){const out=[];for(const t of base){const changed=replaceHead(t,from,to);if(changed&&!out.includes(changed))out.push(changed);}for(const t of base){if(!out.includes(t))out.push(t);}return out.slice(0,5);}
function bestTransition(rows,context,from){const m=new Map();for(const r of rows){if(r.predictedHead!==from||!r.contexts.includes(context))continue;const k=`${from}>${r.actualHead}`;m.set(k,(m.get(k)||0)+1);}const ranked=[...m].sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked[0][1]<MIN_TRANSITION_DISCOVERY)return null;return {transition:ranked[0][0],to:Number(ranked[0][0].split(">")[1]),n:ranked[0][1]};}

const all=[];const seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
 const date=fn.slice(0,8),doc=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));
 for(const r of rowsOf(doc)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  try{const input=inputOf(r),actual=ticketOf(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!input||!actual)continue;const p=core.buildPredictionData(input),predictedHead=head(scenario(p)),actualHead=Number(actual[0]);if(!(predictedHead>=1&&predictedHead<=6)||predictedHead===actualHead)continue;const base=five(p);all.push({date,jcd:String(r.jcd||"").padStart(2,"0"),actual,payout:Number(r?.result?.payoutPer100||r?.result?.review?.payoutPer100||0),predictedHead,actualHead,base,contexts:contexts(r,input),aHit:base.includes(actual)});}catch{}
 }
}

const discovery=all.filter(x=>x.date<HOLDOUT),holdout=all.filter(x=>x.date>=HOLDOUT);
const dc=new Map(),hc=new Map();for(const r of discovery)for(const c of r.contexts)dc.set(c,(dc.get(c)||0)+1);for(const r of holdout)for(const c of r.contexts)hc.set(c,(hc.get(c)||0)+1);
const eligible=[...dc].filter(([c,n])=>n>=MIN_DISCOVERY&&(hc.get(c)||0)>=MIN_HOLDOUT).map(([c])=>c);
const rules=[];
for(const context of eligible){for(let from=1;from<=6;from++){const best=bestTransition(discovery,context,from);if(best)rules.push({context,from,...best});}}
function apply(r){const candidates=rules.filter(x=>x.from===r.predictedHead&&r.contexts.includes(x.context)).sort((a,b)=>b.n-a.n);if(!candidates.length)return {...r,bFive:r.base,bHit:r.aHit,rule:null};const rule=candidates[0],bFive=rerankedFive(r.base,rule.from,rule.to);return {...r,bFive,bHit:bFive.includes(r.actual),rule:`${rule.context}|${rule.transition}`};}
const d=discovery.map(apply),h=holdout.map(apply),dApplied=d.filter(x=>x.rule),hApplied=h.filter(x=>x.rule);
function summary(rows){const A=stat(rows,"aHit"),B=stat(rows,"bHit");return {A:{...A,hitRate:rate(A)},B:{...B,hitRate:rate(B)},deltaHits:B.hits-A.hits,deltaHitRate:rate(B)-rate(A),deltaPayout:B.payout-A.payout};}
const perRule=[...new Set([...dApplied,...hApplied].map(x=>x.rule))].map(rule=>{const ds=dApplied.filter(x=>x.rule===rule),hs=hApplied.filter(x=>x.rule===rule),D=summary(ds),H=summary(hs);return {rule,discovery:D,holdout:H,stablePositive:D.deltaHits>0&&H.deltaHits>0};}).sort((a,b)=>Number(b.stablePositive)-Number(a.stablePositive)||b.holdout.deltaHits-a.holdout.deltaHits||b.discovery.deltaHits-a.discovery.deltaHits);
console.log(JSON.stringify({schemaVersion:3,holdoutStart:HOLDOUT,totalHeadMisses:all.length,eligibleContexts:eligible,learnedRules:rules,allHeadMisses:{discovery:summary(d),holdout:summary(h)},appliedOnly:{discovery:summary(dApplied),holdout:summary(hApplied)},perRule,stablePositiveRules:perRule.filter(x=>x.stablePositive).map(x=>x.rule),selectionRule:"B is a real fixed-five counterfactual: learn the dominant predicted-head>actual-head transition from discovery only, replace that head in existing fixed-five tickets without using odds or holdout labels, then compare A vs B. Production adoption requires positive hit delta in both discovery and holdout.",notes:{productionChanged:false,oddsUsed:false,holdoutUsedForRuleLearning:false,actualResultUsedForDiscoveryTrainingAndPostraceEvaluation:true}},null,2));
