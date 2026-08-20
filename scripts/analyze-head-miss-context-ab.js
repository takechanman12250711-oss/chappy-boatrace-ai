"use strict";

const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../js/ai-core");
const core = global.ChappyAICore;

const DIR = path.join(process.cwd(), "data", "predictions");
const HOLDOUT = "20260812";

function rowsOf(d){return [...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticketOf(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function inputOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return {...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function five(p){const f=p?.formations||{};return [...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticketOf).filter(Boolean);}
function scenario(p){const r=p?.raceScenarios||{};return r.mainScenario||r.scenarios?.[0]||{};}
function head(s){return Number(s?.headBoatNo||s?.attackerBoatNo||s?.attacker||s?.outcome?.firstCandidates?.[0]?.boatNo||s?.outcome?.firstCandidates?.[0]||0);}
function windBucket(v){v=Number(v);if(!Number.isFinite(v))return"unknown";if(v<2)return"lt2";if(v<4)return"2to4";if(v<6)return"4to6";return"ge6";}
function waveBucket(v){v=Number(v);if(!Number.isFinite(v))return"unknown";if(v<3)return"lt3";if(v<6)return"3to6";return"ge6";}
function contexts(r,input){const w=input.weather||{};return [`venueWind:${r.jcd}|${windBucket(w.windSpeed??w.wind??w.wind_speed)}`,`venueWave:${r.jcd}|${waveBucket(w.waveHeight??w.wave??w.wave_height)}`];}
function stat(rows){return {races:rows.length,hits:rows.filter(x=>x.hit).length,payout:rows.reduce((a,x)=>a+(x.hit?x.payout:0),0)};}
function rate(s){return s.races?s.hits/s.races:0;}

const all=[];const seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
 const date=fn.slice(0,8),doc=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));
 for(const r of rowsOf(doc)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  try{const input=inputOf(r),actual=ticketOf(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!input||!actual)continue;const p=core.buildPredictionData(input),h=head(scenario(p)),ah=Number(actual[0]);if(!(h>=1&&h<=6)||h===ah)continue;all.push({date,jcd:String(r.jcd||"").padStart(2,"0"),actual,payout:Number(r?.result?.payoutPer100||r?.result?.review?.payoutPer100||0),hit:five(p).includes(actual),contexts:contexts(r,input)});}catch{}
 }
}

const discovery=all.filter(x=>x.date<HOLDOUT),holdout=all.filter(x=>x.date>=HOLDOUT);
const counts=new Map();for(const r of discovery)for(const c of r.contexts)counts.set(c,(counts.get(c)||0)+1);
const hc=new Map();for(const r of holdout)for(const c of r.contexts)hc.set(c,(hc.get(c)||0)+1);
const eligible=[...counts].filter(([c,n])=>n>=8&&(hc.get(c)||0)>=5).map(([c])=>c);
const selected=r=>r.contexts.some(c=>eligible.includes(c));
const dSel=discovery.filter(selected),hSel=holdout.filter(selected);
const dBase=stat(discovery),hBase=stat(holdout),dB=stat(dSel),hB=stat(hSel);
const perContext=eligible.map(context=>{
  const ds=stat(discovery.filter(r=>r.contexts.includes(context)));
  const hs=stat(holdout.filter(r=>r.contexts.includes(context)));
  return {context,discovery:{...ds,hitRate:rate(ds),liftVsAll:rate(ds)-rate(dBase)},holdout:{...hs,hitRate:rate(hs),liftVsAll:rate(hs)-rate(hBase)},stablePositive:rate(ds)>rate(dBase)&&rate(hs)>rate(hBase)};
}).sort((a,b)=>Number(b.stablePositive)-Number(a.stablePositive)||b.holdout.liftVsAll-a.holdout.liftVsAll||b.discovery.liftVsAll-a.discovery.liftVsAll);
const stablePositiveContexts=perContext.filter(x=>x.stablePositive).map(x=>x.context);
console.log(JSON.stringify({schemaVersion:2,holdoutStart:HOLDOUT,eligibleContexts:eligible,discovery:{A:dBase,B:dB,hitRateA:rate(dBase),hitRateB:rate(dB)},holdout:{A:hBase,B:hB,hitRateA:rate(hBase),hitRateB:rate(hB)},perContext,stablePositiveContexts,selectionRule:"No production mutation. Aggregate B is rejected if it does not beat A in both periods. Individual context may survive only if its fixed-five hit rate exceeds all-head-miss baseline in both discovery and holdout.",notes:{productionChanged:false,oddsUsed:false,actualResultUsedOnlyForPostraceEvaluation:true}},null,2));
