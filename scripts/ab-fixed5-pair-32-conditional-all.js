"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
require("../js/third-six-rescue-fixed5");
require("../js/escape-outer-second-rescue-fixed5");
require("../js/third-place-rescue-14-fixed5");
require("../js/third-place-rescue-12-4-fixed5");
require("../js/pair-31-rescue-fixed5");
const core=global.ChappyAICore,DIR=path.join(process.cwd(),"data","predictions"),H="20260812",KEYS=["st","ex","flow","attack","hold","pickup"],TH={st:0.01922580645161315,ex:-2.199741935483869,flow:-14.086580645161286,attack:-1.571806451612904,hold:-13.875870967741935,pickup:-3.3443225806451605};
function rows(d){return[...(d.predictions||[]),...(d.verificationPredictions||[])];}
function ticket(v){const p=String(v?.ticket||v||"").match(/[1-6]/g)||[];return p.length>=3?p.slice(0,3).join("-"):"";}
function input(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function fixed(p){const f=p.formations||{};return[...(f.main||[]).slice(0,3),...(f.safety||[]).slice(0,2)].map(ticket).filter(Boolean);}
function analyses(p){return p?.analyses||p?.evaluations||p?.boatEvaluation?.evaluations||[];}
function boatNo(x,i){return Number(x?.boatNo??x?.boat??x?.no??i+1);}
function find(a,n){return(a||[]).find((x,i)=>boatNo(x,i)===n)||null;}
function metric(b,k){const m={st:["indexes.st","stIndex","st"],ex:["indexes.exhibition","indexes.ex","exhibition","ex"],flow:["indexes.raceFlow","raceFlow"],attack:["roleScores.attack","attack"],hold:["roleScores.hold","hold"],pickup:["roleScores.pickup","pickup"]}[k];for(const p of m){let v=b;for(const q of p.split("."))v=v?.[q];if(Number.isFinite(Number(v)))return Number(v);}return 0;}
function payout(r){for(const x of [r?.result?.payout,r?.result?.payoutYen,r?.result?.trifectaPayout,r?.result?.review?.payout,r?.result?.review?.payoutYen,r?.result?.review?.trifectaPayout,r?.result?.odds?.payout]){const n=Number(String(x??"").replace(/[^0-9.-]/g,""));if(Number.isFinite(n)&&n>=0)return n;}return 0;}
const P={};for(const k of [4,5,6])P[k]={discovery:{triggered:0,aHit:0,bHit:0,hitDelta:0,payoutDelta:0},holdout:{triggered:0,aHit:0,bHit:0,hitDelta:0,payoutDelta:0}};
const seen=new Set();
for(const fn of fs.readdirSync(DIR).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=fn.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(DIR,fn),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const i=input(r),actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!i||!actual)continue;const p=core.buildPredictionData(i),base=fixed(p);if(base.length!==5)continue;const has12=base.some(t=>t.startsWith("1-2-")),has32=base.some(t=>t.startsWith("3-2-"));if(!has12||has32)continue;const an=analyses(p),b1=find(an,1),b3=find(an,3);if(!b1||!b3)continue;const diffs={};for(const k of KEYS)diffs[k]=metric(b3,k)-metric(b1,k);const score=KEYS.reduce((s,k)=>s+(diffs[k]>=TH[k]?1:0),0);const cands=(an||[]).map((x,idx)=>({n:boatNo(x,idx),pickup:metric(x,"pickup")})).filter(x=>x.n!==2&&x.n!==3&&Number.isFinite(x.pickup)).sort((a,b)=>b.pickup-a.pickup||a.n-b.n);if(!cands.length)continue;const third=cands[0].n;const donor=base.map((t,j)=>({t,j})).filter(x=>x.t.startsWith("1-2-"));if(!donor.length)continue;const idx=donor[donor.length-1].j;for(const need of [4,5,6]){if(score<need)continue;const alt=base.slice();alt[idx]=`3-2-${third}`;const q=P[need][date<H?"discovery":"holdout"],pay=payout(r),a=base.includes(actual),b=alt.includes(actual);q.triggered++;q.aHit+=a?1:0;q.bHit+=b?1:0;q.hitDelta+=Number(b)-Number(a);q.payoutDelta+=(b?pay:0)-(a?pay:0);}}catch{}}}
const out={schemaVersion:1,holdoutStart:H,target:"current fixed5 has 1-2 and no 3-2; all pair patterns",thresholds:TH,variants:{}};
for(const need of [4,5,6]){const x=P[need],ok=x.discovery.triggered>=30&&x.holdout.triggered>=20&&x.discovery.hitDelta>0&&x.holdout.hitDelta>0&&x.discovery.payoutDelta>=0&&x.holdout.payoutDelta>=0;out.variants[`${need}/6`]={...x,stablePositive:ok};}
out.notes={productionChanged:false,oddsUsed:false,fixed5Maintained:true,currentFixed5IncludesPair31Rescue:true,thresholdSource:"midpoint of discovery keep12 vs shift32 means from PR571",allPairPatterns:true,thirdBoat:"highest current pickup excluding boats 2 and 3"};
console.log(JSON.stringify(out,null,2));
