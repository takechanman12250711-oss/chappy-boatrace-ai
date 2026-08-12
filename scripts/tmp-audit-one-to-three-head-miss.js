"use strict";
const fs=require('node:fs'),path=require('node:path');
global.window=global;
require('../js/boat-identity');require('../js/ai-core');require('../js/prediction');
const sel=require('../js/practical-selection'),dir=path.join(process.cwd(),'data','predictions');
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const tk=v=>{const m=String(v?.ticket||v||'').match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join('-'):''};
const dataOf=r=>{const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}}};
const bno=x=>Number(x?.boatNo??x?.number??x?.waku??x?.course??x??0);
const num=(...vs)=>{for(const v of vs){const n=Number(String(v??'').replace(/[^\d.-]/g,''));if(Number.isFinite(n))return n}return null};
const text=(...vs)=>{for(const v of vs){if(v!==null&&v!==undefined&&String(v).trim())return String(v)}return ''};
const bucket=n=>n>=95?'95+':n>=90?'90-94':n>=85?'85-89':n>=80?'80-84':n>=75?'75-79':n>=70?'70-74':n>=65?'65-69':'<65';
const inc=(o,k)=>{const s=String(k??'unknown');o[s]=(o[s]||0)+1};
const out={target:'main head 1 -> actual head 3, selected ticket miss',total:0,byPeriod:{pre:0,mid:0,recent:0},mainLabels:{},mainTypes:{},mainAttackers:{},wallBoats:{},priorityBuckets:{},thirdBoat:{course:{},class:{},stVs1:{fasterBy005:0,fasterBy003:0,faster:0,equal:0,slower:0,unknown:0},exStVs1:{fasterBy005:0,fasterBy003:0,faster:0,equal:0,slower:0,unknown:0},displayVs1:{betterBy003:0,better:0,equal:0,worse:0,unknown:0}},rootKeys:{},mainScenarioKeys:{},scenarioArrayLengths:{},scenarioHeadSets:{},samples:[]};
const seen=new Set();
function period(n){return n<20260807?'pre':n<=20260810?'mid':'recent'}
function cmpLower(a,b,kind){if(a===null||b===null){out.thirdBoat[kind].unknown++;return}const d=b-a;if(kind==='stVs1'||kind==='exStVs1'){if(d>=.05)out.thirdBoat[kind].fasterBy005++;if(d>=.03)out.thirdBoat[kind].fasterBy003++;if(d>0)out.thirdBoat[kind].faster++;else if(d===0)out.thirdBoat[kind].equal++;else out.thirdBoat[kind].slower++;}else{if(d>=.03)out.thirdBoat[kind].betterBy003++;if(d>0)out.thirdBoat[kind].better++;else if(d===0)out.thirdBoat[kind].equal++;else out.thirdBoat[kind].worse++;}}
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=f.slice(0,8),n=+date,d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const pred=global.createPrediction(data),pr=sel.select(pred),selected=(pr?.tickets||[]).map(x=>tk(x?.ticket||x));if(selected.includes(actual))continue;
  const [ah]=actual.split('-').map(Number),rs=pred?.aiCore?.raceScenarios||{},main=rs?.mainScenario||{},mh=Number(main?.headBoatNo||pred?.mainSheet?.honmei?.boatNo||0);if(mh!==1||ah!==3)continue;
  out.total++;out.byPeriod[period(n)]++;
  inc(out.mainLabels,main?.label||main?.name||'unknown');inc(out.mainTypes,main?.type||'unknown');inc(out.mainAttackers,bno(rs?.attacker??main?.attacker)||'none');inc(out.wallBoats,bno(rs?.wallBoat??rs?.wallBoatNo)||'none');
  const cand=(pred?.ticketSheets?.possibility||[]).find(x=>tk(x?.ticket||x)===actual);inc(out.priorityBuckets,bucket(Number(cand?.priorityScore||0)));
  const boats=data.entries||[],b1=boats.find(x=>bno(x)===1)||{},b3=boats.find(x=>bno(x)===3)||{};inc(out.thirdBoat.course,bno(b3)||3);inc(out.thirdBoat.class,text(b3.className,b3.grade,b3.class,b3.rank)||'unknown');
  const st1=num(b1.avgST,b1.averageST,b1.st,b1.startTiming),st3=num(b3.avgST,b3.averageST,b3.st,b3.startTiming);cmpLower(st3,st1,'stVs1');
  const es1=num(b1.exhibitionSt,b1.exhibitionST,b1.tenjiSt,b1.displaySt),es3=num(b3.exhibitionSt,b3.exhibitionST,b3.tenjiSt,b3.displaySt);cmpLower(es3,es1,'exStVs1');
  const dt1=num(b1.exhibitionTime,b1.tenjiTime,b1.displayTime),dt3=num(b3.exhibitionTime,b3.tenjiTime,b3.displayTime);cmpLower(dt3,dt1,'displayVs1');
  Object.keys(rs).forEach(k=>inc(out.rootKeys,k));Object.keys(main).forEach(k=>inc(out.mainScenarioKeys,k));const sc=Array.isArray(rs.scenarios)?rs.scenarios:[];inc(out.scenarioArrayLengths,sc.length);inc(out.scenarioHeadSets,sc.map(s=>Number(s?.headBoatNo||0)).filter(Boolean).join(',')||'none');
  if(out.samples.length<12)out.samples.push({key,date,place:r.place,jcd:r.jcd,raceNo:r.raceNo,actual,priority:Number(cand?.priorityScore||0),main:{label:main?.label,type:main?.type,score:main?.score,rate:main?.rate,probability:main?.probability,headBoatNo:main?.headBoatNo,attacker:main?.attacker,outcome:main?.outcome},raceScenarioSummary:{attacker:rs?.attacker,wallBoat:rs?.wallBoat,wallBoatNo:rs?.wallBoatNo,blockedBoats:rs?.blockedBoats,remainers:rs?.remainers,followers:rs?.followers,pickupCandidates:rs?.pickupCandidates,scenarioHeads:sc.map(s=>({label:s?.label,type:s?.type,score:s?.score,rate:s?.rate,headBoatNo:s?.headBoatNo,attacker:s?.attacker,outcome:s?.outcome}))},boat1:b1,boat3:b3,boat3Analysis:(pred?.aiCore?.analyses||pred?.aiCore?.boatAnalyses||[]).find(x=>bno(x)===3)||null});
 }
}
fs.mkdirSync('tmp-analysis-output',{recursive:true});fs.writeFileSync('tmp-analysis-output/post330-one-to-three-head-miss.json',JSON.stringify(out,null,2));console.log(JSON.stringify({...out,samples:out.samples.slice(0,3)},null,2));
