"use strict";
const fs=require("node:fs"),path=require("node:path");global.window=global;require("../js/ai-core");require("../js/escape-outer-second-rescue-fixed5");require("../js/third-place-rescue-14-fixed5");require("../js/third-place-rescue-12-4-fixed5");
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812";
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function pairOf(t){const p=String(t).match(/[1-6]/g)||[];return p.length>=2?`${p[0]}-${p[1]}`:"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function payout(r){const xs=[r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout,r?.result?.odds?.payout];for(const x of xs){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
function init(){return{races:0,slots:0,actual:{},allocated:{},coveredActual:{},uncoveredActual:{},patterns:{},hits:0,payout:0};}
function inc(o,k,n=1){o[k]=(o[k]||0)+n;}
const P={discovery:init(),holdout:init()},seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);
  try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;const p=core.buildPredictionData(i),base=fixed(p);if(!base.length)continue;const q=P[date<H?"discovery":"holdout"],ap=pairOf(actual),pairs=base.map(pairOf).filter(Boolean);q.races++;q.slots+=pairs.length;inc(q.actual,ap);for(const x of pairs)inc(q.allocated,x);const uniq=[...new Set(pairs)].sort();const pat=uniq.map(x=>`${x}x${pairs.filter(y=>y===x).length}`).join("|");inc(q.patterns,pat);if(uniq.includes(ap))inc(q.coveredActual,ap);else inc(q.uncoveredActual,ap);if(base.includes(actual)){q.hits++;q.payout+=payout(r);}
  }catch{}
 }
}
function rank(o){return Object.entries(o).map(([key,value])=>({key,value})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key));}
function summarize(q){const pairKeys=new Set([...Object.keys(q.actual),...Object.keys(q.allocated)]);const pairBalance=[...pairKeys].map(k=>{const actual=q.actual[k]||0,alloc=q.allocated[k]||0;return{pair:k,actualRaces:actual,actualShare:q.races?Math.round(actual/q.races*10000)/100:0,allocatedSlots:alloc,allocationShare:q.slots?Math.round(alloc/q.slots*10000)/100:0,coverage:q.coveredActual[k]||0,uncovered:q.uncoveredActual[k]||0,coverageRate:actual?Math.round((q.coveredActual[k]||0)/actual*10000)/100:0};}).sort((a,b)=>b.actualRaces-a.actualRaces||a.pair.localeCompare(b.pair));return{races:q.races,slots:q.slots,hits:q.hits,hitRate:q.races?Math.round(q.hits/q.races*10000)/100:0,payout:q.payout,avgPayoutPerRace:q.races?Math.round(q.payout/q.races*10)/10:0,pairBalance,topUncovered:rank(q.uncoveredActual).slice(0,15),topAllocationPatterns:rank(q.patterns).slice(0,15)};}
console.log(JSON.stringify({schemaVersion:1,base:"main after PR546; later rescue A/B rejected",holdoutStart:H,periods:{discovery:summarize(P.discovery),holdout:summarize(P.holdout)},notes:{productionChanged:false,oddsUsed:false,goal:"audit how five fixed tickets allocate first-second pairs versus actual pair frequency and coverage"}},null,2));