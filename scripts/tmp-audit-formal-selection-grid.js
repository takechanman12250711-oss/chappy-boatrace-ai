"use strict";

const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection"),core=global.ChappyAICore,dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function list(v){return(Array.isArray(v)?v:[]).map(x=>tk(x?.ticket||x)).filter(Boolean);}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function pay(r){return Number(r?.result?.payout||r?.result?.officialPayoutPer100||r?.result?.review?.payout||0);}
function make(){return{n:0,baseHits:0,newHits:0,gains:0,added:0,ret:0};}
function finish(x){return{...x,baseHitRate:x.n?Number((x.baseHits/x.n*100).toFixed(2)):0,hitRate:x.n?Number((x.newHits/x.n*100).toFixed(2)):0,roi:x.added?Number((x.ret/(x.added*100)*100).toFixed(2)):0};}
const thresholds=[70,75,80,85,90];
const profiles={
 all:{main:99,safety:99,flow:99,longshot:99},
 main:{main:6,safety:0,flow:0,longshot:0},
 safety:{main:0,safety:8,flow:0,longshot:0},
 mainSafety:{main:6,safety:8,flow:0,longshot:0},
 mainSafetyLong2:{main:6,safety:8,flow:0,longshot:2},
 coreFlow5:{main:6,safety:8,flow:5,longshot:2},
 coreFlow7:{main:6,safety:8,flow:7,longshot:2},
 coreFlow9:{main:6,safety:8,flow:9,longshot:2},
 coreFlow12:{main:6,safety:8,flow:12,longshot:2},
 flow5:{main:0,safety:0,flow:5,longshot:0},
 flow7:{main:0,safety:0,flow:7,longshot:0},
 flow9:{main:0,safety:0,flow:9,longshot:0},
 flow12:{main:0,safety:0,flow:12,longshot:0},
 longshot:{main:0,safety:0,flow:0,longshot:5}
};
const configs=[];for(const [profile,limits] of Object.entries(profiles))for(const threshold of thresholds)configs.push({key:`${profile}-p${threshold}`,profile,limits,threshold});
const stats=Object.fromEntries(configs.map(c=>[c.key,{all:make(),train:make(),test:make(),pre:make(),targetUnique:make(),days:{}}]));
function categoryRanks(fm,ticket){const out={};for(const k of ["main","safety","flow","longshot"]){const i=list(fm?.[k]).indexOf(ticket);if(i>=0)out[k]=i+1;}return out;}
function qualifies(ranks,limits){return Object.entries(ranks).some(([k,r])=>(limits[k]||0)>0&&r<=limits[k]);}
function bestRank(ranks,limits){let best=999;for(const [k,r] of Object.entries(ranks))if((limits[k]||0)>0&&r<=limits[k])best=Math.min(best,r);return best;}
function evalRace(r,date){const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)return null;const p=global.createPrediction(data),sel=selector.select(p),base=list(sel?.tickets),baseHit=base.includes(actual),ai=core.buildPredictionData(data),fm=ai?.formations||{};const excluded=(Array.isArray(sel?.excludedCandidates)?sel.excludedCandidates:[]).filter(x=>String(x?.reasonCode||"")==="CANDIDATE_ONLY_EVALUATION").map(x=>{const ticket=tk(x?.ticket);return{ticket,priority:Number(x?.priorityScore||0),ranks:categoryRanks(fm,ticket)};}).filter(x=>x.ticket&&Object.keys(x.ranks).length);return{actual,base,baseHit,payout:pay(r),raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,excluded};}
function add(x,e,c){x.n++;if(e.baseHit)x.baseHits++;const cap=Math.max(0,10-e.base.length),seen=new Set();const added=e.excluded.filter(v=>v.priority>=c.threshold&&qualifies(v.ranks,c.limits)&&!e.base.includes(v.ticket)&&!seen.has(v.ticket)&&(seen.add(v.ticket),true)).sort((a,b)=>b.priority-a.priority||bestRank(a.ranks,c.limits)-bestRank(b.ranks,c.limits)||a.ticket.localeCompare(b.ticket)).slice(0,cap);const hit=e.baseHit||added.some(v=>v.ticket===e.actual);if(hit)x.newHits++;x.added+=added.length;if(!e.baseHit&&hit){x.gains++;x.ret+=e.payout;}}
const uniqueSeen=new Set();
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=f.slice(0,8),n=Number(date),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const e=evalRace(r,date);if(!e)continue;if(n>=20260807&&n<=20260810){for(const c of configs){const s=stats[c.key];add(s.all,e,c);add(n<=20260808?s.train:s.test,e,c);s.days[date]??=make();add(s.days[date],e,c);}}if(uniqueSeen.has(e.raceKey))continue;uniqueSeen.add(e.raceKey);for(const c of configs){const s=stats[c.key];if(n<20260807)add(s.pre,e,c);else if(n<=20260810)add(s.targetUnique,e,c);}}}
const ranking=[];for(const c of configs){const s=stats[c.key];for(const k of ["all","train","test","pre","targetUnique"])s[k]=finish(s[k]);for(const k of Object.keys(s.days))s.days[k]=finish(s.days[k]);const robust=Math.min(s.train.roi,s.test.roi);ranking.push({key:c.key,profile:c.profile,threshold:c.threshold,robust,target:s.all,train:s.train,test:s.test,pre:s.pre,targetUnique:s.targetUnique,days:s.days});}
ranking.sort((a,b)=>b.robust-a.robust||b.target.roi-a.target.roi||a.target.added-b.target.added);
const out={ranking,configs,stats};fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/formal-selection-grid.json",JSON.stringify(out,null,2));console.log(JSON.stringify({top:ranking.slice(0,20)},null,2));
