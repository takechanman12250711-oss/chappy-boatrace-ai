"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
require("../js/escape-outer-second-rescue-fixed5");
require("../js/third-place-rescue-14-fixed5");
require("../js/third-place-rescue-12-4-fixed5");
require("../js/pair-31-rescue-fixed5");
require("../js/pair-32-rescue-fixed5");
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812";
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function current(p){let q=p;if(global.ChappyPair31RescueFixed5?.apply)q=global.ChappyPair31RescueFixed5.apply(q);if(global.ChappyPair32RescueFixed5?.apply)q=global.ChappyPair32RescueFixed5.apply(q);return fixed(q);}
function payout(r){for(const x of [r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout]){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
function pair(t){const a=t.split("-");return a.length>=2?`${a[0]}-${a[1]}`:"";}
function init(){return{races:0,baselineHits:0,currentHits:0,baselinePayout:0,currentPayout:0,changedRaces:0,improved:0,harmed:0,neutral:0,baselineUncovered:0,currentUncovered:0,uncoveredPairs:{},addedTickets:{},removedTickets:{}};}
const P={discovery:init(),holdout:init()},seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;const p=core.buildPredictionData(i),b=fixed(p),c=current(p);if(b.length!==5||c.length!==5)continue;const q=P[date<H?"discovery":"holdout"],pay=payout(r);q.races++;const bh=b.includes(actual),ch=c.includes(actual);if(bh){q.baselineHits++;q.baselinePayout+=pay;}if(ch){q.currentHits++;q.currentPayout+=pay;}const bp=pair(actual);if(!b.some(t=>pair(t)===bp))q.baselineUncovered++;if(!c.some(t=>pair(t)===bp)){q.currentUncovered++;q.uncoveredPairs[bp]=(q.uncoveredPairs[bp]||0)+1;}const add=c.filter(t=>!b.includes(t)),rem=b.filter(t=>!c.includes(t));if(add.length||rem.length){q.changedRaces++;for(const t of add)q.addedTickets[t]=(q.addedTickets[t]||0)+1;for(const t of rem)q.removedTickets[t]=(q.removedTickets[t]||0)+1;if(!bh&&ch)q.improved++;else if(bh&&!ch)q.harmed++;else q.neutral++;}}
catch{}}}
function top(o,n=15){return Object.entries(o).map(([key,count])=>({key,count})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)).slice(0,n);}
const out={schemaVersion:1,holdoutStart:H,periods:{},summary:{}};for(const [name,q] of Object.entries(P)){out.periods[name]={...q,hitDelta:q.currentHits-q.baselineHits,payoutDelta:q.currentPayout-q.baselinePayout,uncoveredDelta:q.currentUncovered-q.baselineUncovered,uncoveredPairs:top(q.uncoveredPairs),addedTickets:top(q.addedTickets),removedTickets:top(q.removedTickets)};}
out.summary={discoveryStablePositive:P.discovery.currentHits>P.discovery.baselineHits&&P.discovery.currentPayout>=P.discovery.baselinePayout,holdoutStablePositive:P.holdout.currentHits>P.holdout.baselineHits&&P.holdout.currentPayout>=P.holdout.baselinePayout,productionChanged:false,oddsUsed:false,baseline:"current main prediction before pair31/pair32 rescue",current:"pair31 rescue then pair32 rescue"};console.log(JSON.stringify(out,null,2));