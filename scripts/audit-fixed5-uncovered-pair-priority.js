"use strict";
const fs=require("node:fs"),path=require("node:path");global.window=global;require("../js/ai-core");require("../js/escape-outer-second-rescue-fixed5");require("../js/third-place-rescue-14-fixed5");require("../js/third-place-rescue-12-4-fixed5");
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812";
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function pairOf(t){const p=t.split("-");return p.length>=2?`${p[0]}-${p[1]}`:"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function payout(r){for(const x of [r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout,r?.result?.odds?.payout]){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
const P={discovery:{},holdout:{}};const seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);
  try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;const pred=core.buildPredictionData(i),base=fixed(pred);if(base.length!==5)continue;const actualPair=pairOf(actual),predPairs=new Set(base.map(pairOf));if(predPairs.has(actualPair))continue;const q=P[date<H?"discovery":"holdout"];const o=q[actualPair]||(q[actualPair]={uncovered:0,payoutSum:0,payoutCount:0,maxPayout:0});const pay=payout(r);o.uncovered++;o.payoutSum+=pay;if(pay>0)o.payoutCount++;o.maxPayout=Math.max(o.maxPayout,pay);}catch{}
 }
}
function list(obj){return Object.entries(obj).map(([pair,v])=>({pair,...v,avgPayout:v.uncovered?Math.round(v.payoutSum/v.uncovered):0})).sort((a,b)=>b.uncovered-a.uncovered||b.payoutSum-a.payoutSum||a.pair.localeCompare(b.pair));}
const D=list(P.discovery),O=list(P.holdout),keys=[...new Set([...D.map(x=>x.pair),...O.map(x=>x.pair)])];
const stable=keys.map(pair=>{const d=D.find(x=>x.pair===pair)||{uncovered:0,payoutSum:0,avgPayout:0,maxPayout:0},h=O.find(x=>x.pair===pair)||{uncovered:0,payoutSum:0,avgPayout:0,maxPayout:0};return{pair,discovery:d,holdout:h,minUncovered:Math.min(d.uncovered,h.uncovered),combinedUncovered:d.uncovered+h.uncovered,combinedPayout:d.payoutSum+h.payoutSum};}).filter(x=>x.discovery.uncovered>0&&x.holdout.uncovered>0).sort((a,b)=>b.minUncovered-a.minUncovered||b.combinedUncovered-a.combinedUncovered||b.combinedPayout-a.combinedPayout||a.pair.localeCompare(b.pair));
console.log(JSON.stringify({schemaVersion:1,holdoutStart:H,periods:{discovery:D,holdout:O},stablePriority:stable.slice(0,20),notes:{productionChanged:false,oddsUsed:false,goal:"rank fixed5-uncovered actual first-second pairs by reproducible frequency and payout opportunity"}},null,2));
