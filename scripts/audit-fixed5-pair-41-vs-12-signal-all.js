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
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812",KEYS=["st","ex","flow","attack","hold","pickup"];
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function analyses(p){return p?.analyses||p?.evaluations||p?.boatEvaluation?.evaluations||[];}
function boatNo(x,i){return Number(x?.boatNo??x?.boat??x?.no??i+1);}
function find(a,n){return(a||[]).find((x,i)=>boatNo(x,i)===n)||null;}
function metric(b,k){const m={st:["indexes.st","stIndex","st"],ex:["indexes.exhibition","indexes.ex","exhibition","ex"],flow:["indexes.raceFlow","raceFlow"],attack:["roleScores.attack","attack"],hold:["roleScores.hold","hold"],pickup:["roleScores.pickup","pickup"]}[k];for(const p of m){let v=b;for(const q of p.split("."))v=v?.[q];if(Number.isFinite(Number(v)))return Number(v);}return 0;}
const P={discovery:{keep12:[],shift41:[]},holdout:{keep12:[],shift41:[]}},seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;let p=core.buildPredictionData(i);if(global.ChappyPair31RescueFixed5?.apply)p=global.ChappyPair31RescueFixed5.apply(p);if(global.ChappyPair32RescueFixed5?.apply)p=global.ChappyPair32RescueFixed5.apply(p);const base=fixed(p);if(base.length!==5)continue;const has12=base.some(t=>t.startsWith("1-2-")),has41=base.some(t=>t.startsWith("4-1-"));if(!has12||has41)continue;const ap=actual.split("-").slice(0,2).join("-");if(ap!=="1-2"&&ap!=="4-1")continue;const an=analyses(p),b1=find(an,1),b4=find(an,4);if(!b1||!b4)continue;const rec={};for(const k of KEYS)rec[k]=metric(b4,k)-metric(b1,k);P[date<H?"discovery":"holdout"][ap==="4-1"?"shift41":"keep12"].push(rec);}catch{}}}
function summarize(arr){const o={n:arr.length};for(const k of KEYS)o[k]=arr.length?arr.reduce((s,x)=>s+x[k],0)/arr.length:0;return o;}
const out={schemaVersion:1,holdoutStart:H,target:"current fixed5 has 1-2 and no 4-1; actual pair 1-2 vs 4-1",periods:{},signals:{}};
for(const per of ["discovery","holdout"]){const a=summarize(P[per].keep12),b=summarize(P[per].shift41);out.periods[per]={keep12:a,shift41:b};for(const k of KEYS){out.signals[k]=out.signals[k]||{};out.signals[k][per]=b[k]-a[k];}}
out.sameDirection={};for(const k of KEYS){const d=out.signals[k].discovery,h=out.signals[k].holdout;out.sameDirection[k]=(d===0||h===0)?false:Math.sign(d)===Math.sign(h);}
out.notes={productionChanged:false,oddsUsed:false,allPairPatterns:true,currentFixed5IncludesPair31Rescue:true,currentFixed5IncludesPair32Rescue:true,goal:"identify reproducible pre-race signals for retaining 1-2 vs reallocating one 1-2 slot to 4-1"};
console.log(JSON.stringify(out,null,2));