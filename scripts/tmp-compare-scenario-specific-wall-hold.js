"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
const core=global.ChappyAICore;
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function parts(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).map(Number):null;}
function key(v){const x=parts(v);return x?x.join("-"):"";}
function list(v){return(Array.isArray(v)?v:[]).map(key).filter(Boolean);}
function uniq(a){return[...new Set(a)];}
function generateForHead(head,seconds,thirds,limit,out){for(const s of seconds){if(s===head)continue;for(const t of thirds){if(t===head||t===s)continue;const z=`${head}-${s}-${t}`;if(!out.includes(z))out.push(z);if(out.length>=limit)return;}}}
function scenarioBundle(rs,sc){const blocked=Array.isArray(sc?.blockedBoats)?sc.blockedBoats:[];return{...rs,attacker:Number(sc?.attacker||0),mainScenario:sc,blockedBoats:blocked};}
function buildAlt(data,ai,recalcWall){const rs=ai.raceScenarios||{},cur=list(ai.formations?.safety),heads=uniq(cur.map(x=>Number(x[0]))),out=[];for(const h of heads){const sc=(rs.scenarios||[]).find(s=>Number(s.attacker)===h);let seconds=[],thirds=[];if(sc){const bundle=scenarioBundle(rs,sc);const wall=recalcWall?core.buildWallTheory(data.entries||data.boats,ai.analyses,data,bundle):(rs.wallTheory||{});const hp=core.buildHoldPickupTheory(data.entries||data.boats,ai.analyses,sc,wall,{attackerBoatNo:h,attackerCourse:Number(sc.attacker||h),blockedBoats:Array.isArray(sc.blockedBoats)?sc.blockedBoats:[]});seconds=(hp.secondCandidates||[]).map(x=>Number(x.boatNo));thirds=(hp.thirdCandidates||[]).map(x=>Number(x.boatNo));}else{const hp=rs.holdPickupTheory||{};seconds=(hp.secondCandidates||[]).map(x=>Number(x.boatNo));thirds=(hp.thirdCandidates||[]).map(x=>Number(x.boatNo));}generateForHead(h,seconds,thirds,8,out);if(out.length>=8)break;}return out;}
const rec=[];
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
 const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;
  const data=dataOf(r),actual=key(r?.result?.resultTicket||r?.result?.review?.resultTicket);
  if(!data||!actual)continue;
  const ai=core.buildPredictionData(data),cur=list(ai.formations?.safety),altHold=buildAlt(data,ai,false),altWallHold=buildAlt(data,ai,true),main=list(ai.formations?.main),mh=Number(ai?.raceScenarios?.mainScenario?.attacker||0);
  rec.push({date:Number(f.slice(0,8)),actual,cur,altHold,altWallHold,main,headMiss:mh!==Number(actual[0])});
 }
}
function met(xs,field){let s8=0,s2=0,m5=0,hm8=0,hm2=0;for(const x of xs){const use=x[field];if(use.includes(x.actual))s8++;if(use.slice(0,2).includes(x.actual))s2++;if([...x.main.slice(0,3),...use.slice(0,2)].includes(x.actual))m5++;if(x.headMiss&&use.includes(x.actual))hm8++;if(x.headMiss&&use.slice(0,2).includes(x.actual))hm2++;}return{n:xs.length,safety8:s8,safetyFirst2:s2,main3cover2:m5,headMissSafety8:hm8,headMissFirst2:hm2};}
function compare(xs,a,b){let gain8=0,loss8=0,gain2=0,loss2=0;for(const x of xs){const aa=x[a],bb=x[b],ca=aa.includes(x.actual),cb=bb.includes(x.actual),c2a=aa.slice(0,2).includes(x.actual),c2b=bb.slice(0,2).includes(x.actual);if(!ca&&cb)gain8++;if(ca&&!cb)loss8++;if(!c2a&&c2b)gain2++;if(c2a&&!c2b)loss2++;}return{gain8,loss8,gain2,loss2};}
function pack(xs){return{current:met(xs,"cur"),scenarioHold:met(xs,"altHold"),scenarioWallHold:met(xs,"altWallHold"),holdVsCurrent:compare(xs,"cur","altHold"),wallHoldVsCurrent:compare(xs,"cur","altWallHold"),wallHoldVsHold:compare(xs,"altHold","altWallHold")};}
const train=rec.filter(x=>x.date<=20260808),test=rec.filter(x=>x.date>=20260809);
console.log(JSON.stringify({all:pack(rec),train:pack(train),test:pack(test)},null,2));
