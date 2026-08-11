"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection"),core=global.ChappyAICore,dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function list(v){return(Array.isArray(v)?v:[]).map(tk).filter(Boolean);}function bump(o,k){o[k]=(o[k]||0)+1;}
function nums(v){return(Array.isArray(v)?v:[]).map(x=>Number(x?.boatNo??x)).filter(n=>n>=1&&n<=6);}
const out={sample:0,hits:0,misses:0,exactFormationPresent:0,exactFormationAbsent:0,train:{misses:0,present:0,absent:0},test:{misses:0,present:0,absent:0},byWinner:{},byMainScenario:{},winnerScenario:{exists:0,missing:0},roleGap:{bothPresent:0,secondMissing:0,thirdMissing:0,bothMissing:0,noWinnerScenario:0},headCoverage:{main:0,safety:0,longshot:0,none:0},routeSignals:{winnerBlockedByMain:0,secondIsMainAttacker:0,thirdIsMainAttacker:0},examples:[]};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
 const date=Number(f.slice(0,8)),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
  const prediction=global.createPrediction(data),sel=selector.select(prediction),selected=list(sel?.tickets),ai=core.buildPredictionData(data),fm=ai?.formations||{};out.sample++;
  if(selected.includes(actual)){out.hits++;continue;}out.misses++;const part=date<=20260808?out.train:out.test;part.misses++;
  const main=list(fm.main),safety=list(fm.safety),flow=list(fm.flow),longshot=list(fm.longshot),all=[...new Set([...main,...safety,...flow,...longshot])];
  if(all.includes(actual)){out.exactFormationPresent++;part.present++;continue;}out.exactFormationAbsent++;part.absent++;
  const [winner,second,third]=actual.split("-").map(Number),rs=ai?.raceScenarios||{};bump(out.byWinner,String(winner));bump(out.byMainScenario,String(rs?.mainScenario?.type||"unknown"));
  const mainHeads=new Set(main.map(x=>Number(x.split("-")[0]))),safetyHeads=new Set(safety.map(x=>Number(x.split("-")[0]))),longHeads=new Set(longshot.map(x=>Number(x.split("-")[0])));
  if(mainHeads.has(winner))out.headCoverage.main++;else if(safetyHeads.has(winner))out.headCoverage.safety++;else if(longHeads.has(winner))out.headCoverage.longshot++;else out.headCoverage.none++;
  const scenarios=Array.isArray(rs.scenarios)?rs.scenarios:[],ws=scenarios.find(s=>Number(s?.attacker||0)===winner);
  let hs=false,ht=false;if(!ws){out.winnerScenario.missing++;out.roleGap.noWinnerScenario++;}else{out.winnerScenario.exists++;const sec=new Set(nums(ws?.outcome?.secondCandidates)),thi=new Set(nums(ws?.outcome?.thirdCandidates));hs=sec.has(second);ht=thi.has(third);if(hs&&ht)out.roleGap.bothPresent++;else if(!hs&&!ht)out.roleGap.bothMissing++;else if(!hs)out.roleGap.secondMissing++;else out.roleGap.thirdMissing++;}
  const mainAttacker=Number(rs?.mainScenario?.attacker||rs?.mainScenario?.headBoatNo||0),blocked=new Set(nums(rs?.mainScenario?.blockedBoats));if(blocked.has(winner))out.routeSignals.winnerBlockedByMain++;if(second===mainAttacker)out.routeSignals.secondIsMainAttacker++;if(third===mainAttacker)out.routeSignals.thirdIsMainAttacker++;
  if(out.examples.length<40)out.examples.push({raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,actual,mainScenario:rs?.mainScenario?.type||"",mainAttacker,winnerScenario:ws?.type||null,winnerScenarioScore:ws?.score??null,mainScore:rs?.mainScenario?.score??null,headCoverage:mainHeads.has(winner)?"main":safetyHeads.has(winner)?"safety":longHeads.has(winner)?"longshot":"none",secondInWinnerScenario:hs,thirdInWinnerScenario:ht,blockedByMain:blocked.has(winner)});
 }
}
out.hitRate=Number((out.hits/out.sample*100).toFixed(2));out.absentRateAmongMisses=Number((out.exactFormationAbsent/out.misses*100).toFixed(2));
fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/post312-generation-gaps.json",JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));