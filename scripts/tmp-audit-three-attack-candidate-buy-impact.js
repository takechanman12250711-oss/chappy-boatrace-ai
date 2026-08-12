"use strict";
const fs=require('node:fs'),path=require('node:path');
global.window=global;
require('../js/boat-identity');require('../js/ai-core');require('../js/prediction');
const sel=require('../js/practical-selection');
const dir=path.join(process.cwd(),'data','predictions');
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const tk=v=>{const m=String(v?.ticket||v||'').match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join('-'):''};
const dataOf=r=>{const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}}};
const bno=x=>Number(x?.boatNo??x?.number??x?.waku??x?.course??x??0);
const num=(...vs)=>{for(const v of vs){const n=Number(String(v??'').replace(/[^\d.-]/g,''));if(Number.isFinite(n))return n}return null};
const period=n=>n<20260807?'pre':n<=20260810?'mid':'recent';
const getBoat=(boats,n)=>boats.find(x=>bno(x)===n)||{};
const edge=(a,b)=>a!==null&&b!==null?b-a:null;
const out={rule:'avgST boat3 >=0.01 faster than boat1 AND >=0.05 faster than boat2 AND threeAttack score >=60',periods:{pre:{trigger:0,currentHit:0,actual3:0,actual3AlreadyHit:0,actual3PotentialRescue:0,actual1:0,actual1CurrentlyHit:0,actual1AlreadyMiss:0},mid:{trigger:0,currentHit:0,actual3:0,actual3AlreadyHit:0,actual3PotentialRescue:0,actual1:0,actual1CurrentlyHit:0,actual1AlreadyMiss:0},recent:{trigger:0,currentHit:0,actual3:0,actual3AlreadyHit:0,actual3PotentialRescue:0,actual1:0,actual1CurrentlyHit:0,actual1AlreadyMiss:0}},rows:[]};
const seen=new Set();
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=f.slice(0,8),n=+date,d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const pred=global.createPrediction(data),rs=pred?.aiCore?.raceScenarios||{},sc=Array.isArray(rs.scenarios)?rs.scenarios:[];const tri=sc.find(x=>x?.type==='threeAttack');if(!tri)continue;
  const aiHead=Number(rs?.mainScenario?.headBoatNo||pred?.aiCore?.mainSheet?.honmei?.boatNo||pred?.mainSheet?.honmei?.boatNo||0);if(aiHead!==1)continue;
  const boats=data.entries||[],b1=getBoat(boats,1),b2=getBoat(boats,2),b3=getBoat(boats,3);
  const st1=num(b1.avgST,b1.averageST,b1.st,b1.startTiming),st2=num(b2.avgST,b2.averageST,b2.st,b2.startTiming),st3=num(b3.avgST,b3.averageST,b3.st,b3.startTiming);
  const st31=edge(st3,st1),st32=edge(st3,st2),ts=Number(tri.score||0);if(!(st31!==null&&st31>=.01&&st32!==null&&st32>=.05&&ts>=60))continue;
  const actualHead=Number(actual[0]);if(actualHead!==1&&actualHead!==3)continue;
  const practical=sel.select(pred),selected=(practical?.tickets||[]).map(x=>tk(x?.ticket||x)),currentHit=selected.includes(actual),p=period(n),z=out.periods[p];z.trigger++;if(currentHit)z.currentHit++;
  if(actualHead===3){z.actual3++;if(currentHit)z.actual3AlreadyHit++;else z.actual3PotentialRescue++;}else{z.actual1++;if(currentHit)z.actual1CurrentlyHit++;else z.actual1AlreadyMiss++;}
  const possibility=Array.isArray(pred?.ticketSheets?.possibility)?pred.ticketSheets.possibility:[];const cand=possibility.find(x=>tk(x?.ticket||x)===actual);
  out.rows.push({key,date,place:r.place,jcd:r.jcd,raceNo:r.raceNo,actual,actualHead,currentHit,selected,threeAttackScore:ts,st31,st32,actualCandidatePriority:Number(cand?.priorityScore||0),actualCandidateCategory:String(cand?.category||cand?.sourceCategory||''),actualCandidateSelectionTier:String(cand?.selectionTier||''),scenarioMain:{type:rs?.mainScenario?.type,label:rs?.mainScenario?.label,score:rs?.mainScenario?.score}});
 }
}
out.total={trigger:0,currentHit:0,actual3:0,actual3AlreadyHit:0,actual3PotentialRescue:0,actual1:0,actual1CurrentlyHit:0,actual1AlreadyMiss:0};for(const p of ['pre','mid','recent'])for(const k of Object.keys(out.total))out.total[k]+=out.periods[p][k];out.optimisticBuyNet=out.total.actual3PotentialRescue-out.total.actual1CurrentlyHit;out.note='optimisticBuyNet is an upper-bound screen only: it counts currently missed actual-3 races as rescuable and currently hit actual-1 races as at-risk. Production promotion still requires explicit implementation and regression verification.';
fs.mkdirSync('tmp-analysis-output',{recursive:true});fs.writeFileSync('tmp-analysis-output/post331-three-attack-candidate-buy-impact.json',JSON.stringify(out,null,2));console.log(JSON.stringify({rule:out.rule,periods:out.periods,total:out.total,optimisticBuyNet:out.optimisticBuyNet,rows:out.rows},null,2));
