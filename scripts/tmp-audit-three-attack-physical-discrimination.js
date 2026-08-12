"use strict";
const fs=require('node:fs'),path=require('node:path');
global.window=global;
require('../js/boat-identity');require('../js/ai-core');require('../js/prediction');
const dir=path.join(process.cwd(),'data','predictions');
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const tk=v=>{const m=String(v?.ticket||v||'').match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join('-'):''};
const dataOf=r=>{const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}}};
const bno=x=>Number(x?.boatNo??x?.number??x?.waku??x?.course??x??0);
const num=(...vs)=>{for(const v of vs){const n=Number(String(v??'').replace(/[^\d.-]/g,''));if(Number.isFinite(n))return n}return null};
const period=n=>n<20260807?'pre':n<=20260810?'mid':'recent';
const getBoat=(boats,n)=>boats.find(x=>bno(x)===n)||{};
const lowerEdge=(a,b)=>a!==null&&b!==null?b-a:null;
const mk={
  st31_001:x=>x.st31!==null&&x.st31>=.01, st31_003:x=>x.st31!==null&&x.st31>=.03, st31_005:x=>x.st31!==null&&x.st31>=.05,
  st32_001:x=>x.st32!==null&&x.st32>=.01, st32_003:x=>x.st32!==null&&x.st32>=.03, st32_005:x=>x.st32!==null&&x.st32>=.05,
  ex31_001:x=>x.ex31!==null&&x.ex31>=.01, ex31_003:x=>x.ex31!==null&&x.ex31>=.03, ex31_005:x=>x.ex31!==null&&x.ex31>=.05,
  ex32_001:x=>x.ex32!==null&&x.ex32>=.01, ex32_003:x=>x.ex32!==null&&x.ex32>=.03, ex32_005:x=>x.ex32!==null&&x.ex32>=.05,
  tm31_001:x=>x.tm31!==null&&x.tm31>=.01, tm31_003:x=>x.tm31!==null&&x.tm31>=.03, tm31_005:x=>x.tm31!==null&&x.tm31>=.05,
  tm32_001:x=>x.tm32!==null&&x.tm32>=.01, tm32_003:x=>x.tm32!==null&&x.tm32>=.03, tm32_005:x=>x.tm32!==null&&x.tm32>=.05,
  tri55:x=>x.ts>=55, tri60:x=>x.ts>=60, tri65:x=>x.ts>=65, gap5:x=>x.gap<=5, gap10:x=>x.gap<=10,
  attacker3:x=>x.attacker===3, wall2:x=>x.wall===2
};
const groups=[
 ['st31_001','st31_003','st31_005'],['st32_001','st32_003','st32_005'],['ex31_001','ex31_003','ex31_005'],['ex32_001','ex32_003','ex32_005'],['tm31_001','tm31_003','tm31_005'],['tm32_001','tm32_003','tm32_005'],['tri55','tri60','tri65'],['gap5','gap10'],['attacker3'],['wall2']
];
const combos=[];
function addCombo(parts){const key=parts.join('+');if(!combos.some(c=>c.key===key))combos.push({key,parts});}
for(const g of groups)for(const a of g)addCombo([a]);
for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)for(const a of groups[i])for(const b of groups[j])addCombo([a,b]);
for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)for(let k=j+1;k<groups.length;k++)for(const a of groups[i])for(const b of groups[j])for(const c of groups[k])addCombo([a,b,c]);
const base={pre:{n:0,actual1:0,actual3:0},mid:{n:0,actual1:0,actual3:0},recent:{n:0,actual1:0,actual3:0}};
const stats=Object.fromEntries(combos.map(c=>[c.key,{pre:{trigger:0,gain:0,loss:0,other:0},mid:{trigger:0,gain:0,loss:0,other:0},recent:{trigger:0,gain:0,loss:0,other:0}}]));
const featureCoverage=Object.fromEntries(Object.keys(mk).map(k=>[k,{trigger:0,actual1:0,actual3:0}]));
const seen=new Set();let eligible=0;
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=f.slice(0,8),n=+date,d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const pred=global.createPrediction(data),rs=pred?.aiCore?.raceScenarios||{},sc=Array.isArray(rs.scenarios)?rs.scenarios:[];
  const esc=sc.find(x=>x?.type==='escape'),tri=sc.find(x=>x?.type==='threeAttack');if(!esc||!tri)continue;
  const aiHead=Number(rs?.mainScenario?.headBoatNo||pred?.aiCore?.mainSheet?.honmei?.boatNo||pred?.mainSheet?.honmei?.boatNo||0);if(aiHead!==1)continue;
  const actualHead=Number(actual[0]);if(actualHead!==1&&actualHead!==3)continue;
  const boats=data.entries||[],b1=getBoat(boats,1),b2=getBoat(boats,2),b3=getBoat(boats,3);
  const st1=num(b1.avgST,b1.averageST,b1.st,b1.startTiming),st2=num(b2.avgST,b2.averageST,b2.st,b2.startTiming),st3=num(b3.avgST,b3.averageST,b3.st,b3.startTiming);
  const ex1=num(b1.exhibitionSt,b1.exhibitionST,b1.tenjiSt,b1.displaySt),ex2=num(b2.exhibitionSt,b2.exhibitionST,b2.tenjiSt,b2.displaySt),ex3=num(b3.exhibitionSt,b3.exhibitionST,b3.tenjiSt,b3.displaySt);
  const tm1=num(b1.exhibitionTime,b1.tenjiTime,b1.displayTime),tm2=num(b2.exhibitionTime,b2.tenjiTime,b2.displayTime),tm3=num(b3.exhibitionTime,b3.tenjiTime,b3.displayTime);
  const ts=Number(tri.score||0),es=Number(esc.score||0),x={st31:lowerEdge(st3,st1),st32:lowerEdge(st3,st2),ex31:lowerEdge(ex3,ex1),ex32:lowerEdge(ex3,ex2),tm31:lowerEdge(tm3,tm1),tm32:lowerEdge(tm3,tm2),ts,gap:es-ts,attacker:bno(rs?.attacker??tri?.attacker),wall:bno(rs?.wallBoat??rs?.wallBoatNo)};
  const p=period(n);base[p].n++;base[p][actualHead===1?'actual1':'actual3']++;eligible++;
  for(const [name,fn] of Object.entries(mk)){if(fn(x)){featureCoverage[name].trigger++;featureCoverage[name][actualHead===1?'actual1':'actual3']++;}}
  for(const c of combos){if(c.parts.every(name=>mk[name](x))){const z=stats[c.key][p];z.trigger++;if(actualHead===3)z.gain++;else z.loss++;}}
 }
}
const evaluated=[];
for(const c of combos){const v=stats[c.key],total={trigger:0,gain:0,loss:0,other:0,net:0};for(const p of ['pre','mid','recent']){v[p].net=v[p].gain-v[p].loss;for(const q of ['trigger','gain','loss','other'])total[q]+=v[p][q];total.net+=v[p].net;}const nonNegativeAll=['pre','mid','recent'].every(p=>v[p].net>=0),positiveTwoPlus=['pre','mid','recent'].filter(p=>v[p].net>0).length>=2,hasRecent=v.recent.trigger>0,stablePositive=['pre','mid','recent'].every(p=>v[p].net>0);evaluated.push({rule:c.key,...v,total,nonNegativeAll,positiveTwoPlus,hasRecent,stablePositive,eligibleForProposal:total.trigger>=5&&total.net>0&&nonNegativeAll&&positiveTwoPlus&&hasRecent});}
evaluated.sort((a,b)=>Number(b.eligibleForProposal)-Number(a.eligibleForProposal)||b.total.net-a.total.net||b.total.gain-a.total.gain||a.total.trigger-b.total.trigger);
const proposal=evaluated.filter(x=>x.eligibleForProposal).slice(0,20),best=evaluated.slice(0,30);
const out={target:'physical discrimination for current head 1 vs actual head 3',eligible,base,featureCoverage,proposal,best,decision:proposal.length?'CANDIDATE_FOUND_REQUIRES_USER_APPROVAL':'NO_STABLE_PHYSICAL_RULE_FOUND_DO_NOT_CHANGE_PRODUCTION'};
fs.mkdirSync('tmp-analysis-output',{recursive:true});fs.writeFileSync('tmp-analysis-output/post331-three-attack-physical-discrimination.json',JSON.stringify(out,null,2));console.log(JSON.stringify({eligible,base,decision:out.decision,proposal:proposal.slice(0,10),best:best.slice(0,10)},null,2));
