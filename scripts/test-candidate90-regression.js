"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection");
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
const stats={n:0,baseHits:0,newHits:0,added:0,trainBase:0,trainNew:0,testBase:0,testNew:0,incrementalReturn:0};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
 const date=Number(f.slice(0,8)),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;
  const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const p=global.createPrediction(data),sel=selector.select(p),tickets=(sel?.tickets||[]),all=tickets.map(x=>tk(x?.ticket||x)).filter(Boolean),promoted=tickets.filter(x=>x?.selectionTier==="候補補完");
  const base=tickets.filter(x=>x?.selectionTier!=="候補補完").map(x=>tk(x?.ticket||x)).filter(Boolean),baseHit=base.includes(actual),newHit=all.includes(actual);
  if(all.length>10)throw new Error(`ticket cap exceeded ${r?.raceKey||f}`);
  for(const row of promoted){
    if(Number(row?.priorityScore||0)<90)throw new Error(`promotion below 90 ${row?.ticket}`);
    const pos=new Set((row?.physicalCoverage||[]).map(x=>Number(x?.position||0)).filter(x=>x>=1&&x<=3));
    if(pos.size!==3)throw new Error(`promotion without 3-position evidence ${row?.ticket}`);
  }
  stats.n++;stats.added+=promoted.length;if(baseHit)stats.baseHits++;if(newHit)stats.newHits++;
  if(date<=20260808){if(baseHit)stats.trainBase++;if(newHit)stats.trainNew++;}else{if(baseHit)stats.testBase++;if(newHit)stats.testNew++;}
  if(!baseHit&&newHit){stats.incrementalReturn+=Number(r?.result?.payout||r?.result?.officialPayoutPer100||r?.result?.review?.payout||0);}
 }
}
const expected={n:341,baseHits:103,newHits:113,added:205,trainBase:46,trainNew:51,testBase:57,testNew:62,incrementalReturn:30850};
for(const [k,v] of Object.entries(expected)){if(stats[k]!==v)throw new Error(`${k}: expected ${v}, got ${stats[k]}`);}
const recovery=Number((stats.incrementalReturn/(stats.added*100)*100).toFixed(2));if(recovery!==150.49)throw new Error(`incremental recovery expected 150.49, got ${recovery}`);
if(selector.MINIMUM_CANDIDATE_PROMOTION_SCORE!==90)throw new Error("promotion threshold export mismatch");
console.log(JSON.stringify({...stats,incrementalRecoveryRate:recovery},null,2));
console.log("candidate90 regression passed");
