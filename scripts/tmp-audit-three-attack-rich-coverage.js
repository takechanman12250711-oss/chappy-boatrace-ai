"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const tk=v=>{const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):""};
const dataOf=r=>{const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}}};
const bno=x=>Number(x?.boatNo??x?.number??x?.waku??x?.course??x??0);
const num=(...vs)=>{for(const v of vs){if(v===null||v===undefined||String(v).trim()==="")continue;const n=Number(String(v).replace(/[^\d.-]/g,""));if(Number.isFinite(n))return n}return null};
const getBoat=(boats,n)=>boats.find(x=>bno(x)===n)||{};
const period=n=>n<20260807?"pre":n<=20260810?"mid":"recent";
const seen=new Set();const out=[];
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=f.slice(0,8),n=+date,d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);
  const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const pred=global.createPrediction(data),rs=pred?.aiCore?.analysisRaceScenarios||pred?.aiCore?.raceScenarios||{},sc=Array.isArray(rs.scenarios)?rs.scenarios:[];
  const esc=sc.find(x=>x?.type==="escape"),tri=sc.find(x=>x?.type==="threeAttack");if(!esc||!tri)continue;
  const aiHead=Number(rs?.mainScenario?.headBoatNo||rs?.mainScenario?.attackerBoatNo||rs?.mainScenario?.attacker||pred?.aiCore?.mainSheet?.honmei?.boatNo||pred?.mainSheet?.honmei?.boatNo||0);if(aiHead!==1)continue;
  const actualHead=Number(actual[0]);if(actualHead!==1&&actualHead!==3)continue;
  const boats=data.entries||[],b1=getBoat(boats,1),b2=getBoat(boats,2),b3=getBoat(boats,3);
  const st=[b1,b2,b3].map(b=>num(b.currentST,b.exhibitionST,b.exhibitionSt,b.tenjiST,b.tenjiSt,b.st,b.startTiming,b.averageST,b.avgST));
  const avg=[b1,b2,b3].map(b=>num(b.averageST,b.avgST,b.st,b.startTiming));
  const ex=[b1,b2,b3].map(b=>num(b.exhibitionTime,b.tenjiTime,b.displayTime,b.exTime,b.time));
  const turn=[b1,b2,b3].map(b=>num(b.turnTime,b.mawariashiTime));
  const wall=pred?.aiCore?.wallTheory||pred?.wallTheory||rs?.wallTheory||{};
  const wallCandidateNo=Number(wall?.wallCandidateNo||0),wallState=String(wall?.state||"");
  const wallFormal=/^(壁成立|互角|壁崩れ)$/.test(wallState)&&wallCandidateNo>=1&&wallCandidateNo<=6&&Number.isFinite(Number(wall?.score))&&Boolean(String(wall?.grade||""));
  const attacker=Number(wall?.attackerNo||rs?.attacker||tri?.attacker||0);
  out.push({key,date,period:period(n),actual,actualHead,threeAttackScore:Number(tri.score||0),escapeScore:Number(esc.score||0),avgStAvailable:avg.every(v=>v!==null),slitAvailable:st.every(v=>v!==null),exhibitionAvailable:ex.every(v=>v!==null),turnAvailable:turn.every(v=>v!==null),wallFormal,wallCandidateNo,wallState,attacker,avgSt31:avg[0]!==null&&avg[2]!==null?avg[0]-avg[2]:null,avgSt32:avg[1]!==null&&avg[2]!==null?avg[1]-avg[2]:null,slit31:st[0]!==null&&st[2]!==null?st[0]-st[2]:null,slit32:st[1]!==null&&st[2]!==null?st[1]-st[2]:null,ex31:ex[2]!==null&&ex[0]!==null?ex[0]-ex[2]:null,ex32:ex[2]!==null&&ex[1]!==null?ex[1]-ex[2]:null,turn31:turn[2]!==null&&turn[0]!==null?turn[0]-turn[2]:null,turn32:turn[2]!==null&&turn[1]!==null?turn[1]-turn[2]:null});
 }
}
const ps=["pre","mid","recent"];
function count(filter){return Object.fromEntries([...ps.map(p=>[p,out.filter(x=>x.period===p&&filter(x)).length]),["total",out.filter(filter).length]]);}
const coverage={eligible:count(()=>true),actual3:count(x=>x.actualHead===3),avgST:count(x=>x.avgStAvailable),slit:count(x=>x.slitAvailable),exhibition:count(x=>x.exhibitionAvailable),turn:count(x=>x.turnAvailable),wallFormal:count(x=>x.wallFormal),slitExWall:count(x=>x.slitAvailable&&x.exhibitionAvailable&&x.wallFormal),allRich:count(x=>x.slitAvailable&&x.exhibitionAvailable&&x.turnAvailable&&x.wallFormal)};
const candidates=[];
const stCuts=[0,.01,.03,.05,.10],exCuts=[0,.01,.03,.05],triCuts=[55,60,65],states=["壁崩れ","互角"];
for(const s31 of stCuts)for(const s32 of stCuts)for(const e31 of exCuts)for(const e32 of exCuts)for(const tri of triCuts)for(const state of states){
 const rule=x=>x.slit31!==null&&x.slit32!==null&&x.ex31!==null&&x.ex32!==null&&x.wallFormal&&x.slit31>=s31-1e-9&&x.slit32>=s32-1e-9&&x.ex31>=e31-1e-9&&x.ex32>=e32-1e-9&&x.threeAttackScore>=tri&&x.wallState===state;
 const by={};let gain=0,loss=0,trigger=0;for(const p of ps){const z=out.filter(x=>x.period===p&&rule(x));const g=z.filter(x=>x.actualHead===3).length,l=z.filter(x=>x.actualHead===1).length;by[p]={trigger:z.length,gain:g,loss:l,net:g-l};gain+=g;loss+=l;trigger+=z.length;}
 const net=gain-loss,nonNeg=ps.every(p=>by[p].net>=0),positive=ps.filter(p=>by[p].net>0).length>=2,recent=by.recent.trigger>0;if(trigger>=5&&net>0&&nonNeg&&positive&&recent)candidates.push({rule:{s31,s32,e31,e32,tri,state},...by,total:{trigger,gain,loss,net}});
}
candidates.sort((a,b)=>b.total.net-a.total.net||b.total.gain-a.total.gain||a.total.trigger-b.total.trigger);
const report={target:"final rich physical 1-head vs 3-head audit",raceCount:out.length,coverage,candidateCount:candidates.length,best:candidates.slice(0,30),decision:candidates.length?"RICH_PHYSICAL_CANDIDATE_FOUND_NEEDS_EXACT_PRACTICAL_VALIDATION":"NO_STABLE_RICH_PHYSICAL_RULE_END_1_TO_3_WORK",rows:out};
fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/final-three-attack-rich-coverage.json",JSON.stringify(report,null,2));console.log(JSON.stringify({raceCount:report.raceCount,coverage,candidateCount:report.candidateCount,best:report.best.slice(0,10),decision:report.decision},null,2));