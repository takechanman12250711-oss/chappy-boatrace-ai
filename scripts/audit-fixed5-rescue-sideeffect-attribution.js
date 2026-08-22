"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
require("../js/escape-outer-second-rescue-fixed5");
require("../js/third-place-rescue-14-fixed5");
require("../js/third-place-rescue-12-4-fixed5");
const baseCore=global.ChappyAICore,baseBuild=baseCore.buildPredictionData.bind(baseCore);
require("../js/pair-31-rescue-fixed5");
const p31=global.ChappyPair31RescueFixed5;
require("../js/pair-32-rescue-fixed5");
const p32=global.ChappyPair32RescueFixed5;
const DIR=path.join(process.cwd(),"data","predictions"),H="20260812";
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function payout(r){for(const x of [r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout]){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
function init(){return{races:0,variants:{base:{hits:0,payout:0},pair31:{hits:0,payout:0},pair32:{hits:0,payout:0},combined:{hits:0,payout:0}},combinedVsBase:{improved:[],harmed:[]},interaction:{pair31ChangedPair32Outcome:0,pair32ChangedPair31Outcome:0,bothApplied:0}};}
const P={discovery:init(),holdout:init()},seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;const base=baseBuild(i),v={base:fixed(base),pair31:fixed(p31.apply(base)),pair32:fixed(p32.apply(base)),combined:fixed(p32.apply(p31.apply(base)))};if(Object.values(v).some(x=>x.length!==5))continue;const q=P[date<H?"discovery":"holdout"],pay=payout(r);q.races++;const hit={};for(const k of Object.keys(v)){hit[k]=v[k].includes(actual);if(hit[k]){q.variants[k].hits++;q.variants[k].payout+=pay;}}
const rec={raceKey:rk,date,jcd:r.jcd,raceNo:r.raceNo,actual,payout:pay,base:v.base,pair31:v.pair31,pair32:v.pair32,combined:v.combined};if(!hit.base&&hit.combined)q.combinedVsBase.improved.push(rec);if(hit.base&&!hit.combined)q.combinedVsBase.harmed.push(rec);const a31=JSON.stringify(v.pair31)!==JSON.stringify(v.base),a32=JSON.stringify(v.pair32)!==JSON.stringify(v.base);if(a31&&a32)q.interaction.bothApplied++;if(hit.pair32!==hit.combined)q.interaction.pair31ChangedPair32Outcome++;if(hit.pair31!==hit.combined)q.interaction.pair32ChangedPair31Outcome++;}catch{}}}
function compact(arr){return arr.map(x=>({raceKey:x.raceKey,actual:x.actual,payout:x.payout,base:x.base,combined:x.combined}));}
const out={schemaVersion:1,holdoutStart:H,periods:{}};for(const [name,q] of Object.entries(P)){out.periods[name]={races:q.races,variants:q.variants,deltas:{pair31:{hits:q.variants.pair31.hits-q.variants.base.hits,payout:q.variants.pair31.payout-q.variants.base.payout},pair32:{hits:q.variants.pair32.hits-q.variants.base.hits,payout:q.variants.pair32.payout-q.variants.base.payout},combined:{hits:q.variants.combined.hits-q.variants.base.hits,payout:q.variants.combined.payout-q.variants.base.payout}},combinedVsBase:{improvedCount:q.combinedVsBase.improved.length,harmedCount:q.combinedVsBase.harmed.length,improved:compact(q.combinedVsBase.improved),harmed:compact(q.combinedVsBase.harmed)},interaction:q.interaction};}
out.notes={productionChanged:false,oddsUsed:false,goal:"attribute combined holdout gains/losses to pair31, pair32, or interaction"};console.log(JSON.stringify(out,null,2));