"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection"),core=global.ChappyAICore,dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function list(v){return(Array.isArray(v)?v:[]).map(tk).filter(Boolean);}function nums(v){return(Array.isArray(v)?v:[]).map(x=>Number(x?.boatNo??x)).filter(n=>n>=1&&n<=6);}function has(v,n){return nums(v).includes(n);}function bump(o,k){o[k]=(o[k]||0)+1;}
const out={count:0,byThird:{},roles:{remainer:0,follower:0,pickup:0,road:0,local:0,blocked:0,mainAttacker:0},pickupRank:{},roadRank:{},samples:[]};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
 const date=Number(f.slice(0,8)),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;const prediction=global.createPrediction(data),sel=selector.select(prediction);if(list(sel?.tickets).includes(actual))continue;const ai=core.buildPredictionData(data),fm=ai?.formations||{},all=[...new Set([...list(fm.main),...list(fm.safety),...list(fm.flow),...list(fm.longshot)])];if(all.includes(actual))continue;
  const [winner,second,third]=actual.split("-").map(Number),rs=ai?.raceScenarios||{},scenarios=Array.isArray(rs.scenarios)?rs.scenarios:[],ws=scenarios.find(s=>Number(s?.attacker||0)===winner);if(!ws)continue;const sec=new Set(nums(ws?.outcome?.secondCandidates)),thi=new Set(nums(ws?.outcome?.thirdCandidates));if(!sec.has(second)||thi.has(third))continue;
  out.count++;bump(out.byThird,String(third));const mainAttacker=Number(rs?.attacker||0),pickup=nums(rs?.pickupCandidates),road=nums(rs?.roadRaceBoats),analyses=Array.isArray(ai?.analyses)?ai.analyses:(Array.isArray(ai?.boatAnalyses)?ai.boatAnalyses:[]),a=analyses.find(x=>Number(x?.boatNo||0)===third)||{};
  const flags={remainer:has(rs?.remainers,third),follower:has(rs?.followers,third),pickup:pickup.includes(third),road:road.includes(third),local:has(rs?.localExperts,third),blocked:has(rs?.blockedBoats,third),mainAttacker:mainAttacker===third};for(const [k,v] of Object.entries(flags))if(v)out.roles[k]++;
  const pr=pickup.indexOf(third),rr=road.indexOf(third);bump(out.pickupRank,pr>=0?String(pr+1):"none");bump(out.roadRank,rr>=0?String(rr+1):"none");
  out.samples.push({raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,actual,winnerScenario:ws?.type||null,winnerScenarioScore:Number(ws?.score||0),mainScenario:rs?.mainScenario?.type||null,mainScore:Number(rs?.mainScenario?.score||0),third,flags,pickupRank:pr>=0?pr+1:null,roadRank:rr>=0?rr+1:null,roleScores:a?.roleScores||{},indexes:a?.indexes||{}});
 }}
fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/third-missing-roles.json",JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
