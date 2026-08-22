"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
require("../js/escape-outer-second-rescue-fixed5");
require("../js/third-place-rescue-14-fixed5");
require("../js/third-place-rescue-12-4-fixed5");
require("../js/pair-31-rescue-fixed5");
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812";
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function payout(r){for(const x of [r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout,r?.result?.odds?.payout]){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
const periods={discovery:{races:0,payoutSum:0,pairSlots:{},signatures:{}},holdout:{races:0,payoutSum:0,pairSlots:{},signatures:{}}},seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual||!actual.startsWith("3-2-"))continue;const p=core.buildPredictionData(i),base=fixed(p);if(base.length!==5||base.some(t=>t.startsWith("3-2-")))continue;const q=periods[date<H?"discovery":"holdout"];q.races++;q.payoutSum+=payout(r);const counts={};for(const t of base){const a=t.split("-");const pair=`${a[0]}-${a[1]}`;counts[pair]=(counts[pair]||0)+1;q.pairSlots[pair]=(q.pairSlots[pair]||0)+1;}const sig=Object.keys(counts).sort().map(k=>`${k}x${counts[k]}`).join("|");q.signatures[sig]=(q.signatures[sig]||0)+1;}catch{}}}
function sortObj(o){return Object.entries(o).map(([key,count])=>({key,count})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));}
const out={schemaVersion:1,holdoutStart:H,target:"actual pair 3-2 is uncovered by current fixed5",periods:{},stableDonorCandidates:[]};
for(const [name,q] of Object.entries(periods)){out.periods[name]={races:q.races,payoutSum:q.payoutSum,pairSlots:sortObj(q.pairSlots),signatures:sortObj(q.signatures).slice(0,15)};}
const d=periods.discovery.pairSlots,h=periods.holdout.pairSlots;for(const pair of Object.keys(d).filter(k=>h[k]))out.stableDonorCandidates.push({pair,discoverySlots:d[pair],holdoutSlots:h[pair],minSlots:Math.min(d[pair],h[pair]),combinedSlots:d[pair]+h[pair]});
out.stableDonorCandidates.sort((a,b)=>b.minSlots-a.minSlots||b.combinedSlots-a.combinedSlots||a.pair.localeCompare(b.pair));
out.notes={productionChanged:false,oddsUsed:false,currentFixed5IncludesPair31Rescue:true,goal:"identify which existing first-second pair slots dominate when true 3-2 is completely uncovered"};
console.log(JSON.stringify(out,null,2));
