"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/ai-core");const core=global.ChappyAICore;
const dir=path.join(process.cwd(),"data","predictions"),START="20260812";
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const key=v=>{const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):""};
const list=v=>(Array.isArray(v)?v:[]).map(key).filter(Boolean);
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,place:r.place,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function byBoat(arr,no){return (arr||[]).find((x,i)=>Number(x?.boatNo||x?.boat||i+1)===Number(no))||null;}
function rawBoat(input,no){return (input.boats||[]).find((x,i)=>Number(x?.boat||x?.boatNo||i+1)===Number(no))||null;}
function metric(obj,...paths){for(const p of paths){let v=obj;for(const k of p.split("."))v=v?.[k];const x=n(v);if(x!==null)return x;}return null;}
function diff(a,b){return a!==null&&b!==null?a-b:null;}
function preRaceFeatures(ai,input,scenario,head){
  const a=ai.analyses||ai.evaluations||ai.boatEvaluation?.evaluations||[];
  const h=byBoat(a,head),b1=byBoat(a,1),b2=byBoat(a,2),r1=rawBoat(input,1),r2=rawBoat(input,2),rh=rawBoat(input,head);
  const sc=(ai.raceScenarios?.scenarios||[]).filter(Boolean).sort((x,y)=>Number(y?.score||0)-Number(x?.score||0));
  const mainScore=n(scenario?.score),secondScore=n(sc.find(x=>x!==scenario)?.score);
  const avgSt=x=>metric(x,"avgSt","averageSt","stAverage");
  const exSt=x=>metric(x,"exhibitionSt","exhibitionST","startExhibition.st","tenjiSt");
  const exTime=x=>metric(x,"exhibitionTime","displayTime","exhibition.displayTime","tenjiTime");
  const role=(x,k)=>metric(x,`roleScores.${k}`,`indexes.${k}`,k);
  return {
    scenarioScore:mainScore,
    scenarioGap:diff(mainScore,secondScore),
    headTotal:metric(h,"indexes.total","total","score"),
    headRaceFlow:metric(h,"indexes.raceFlow","raceFlow","tenkai"),
    headAttack:role(h,"attack"),headHold:role(h,"hold"),headPickup:role(h,"pickup"),headRoad:role(h,"road"),
    headAvgSt:avgSt(rh),headExSt:exSt(rh),headExTime:exTime(rh),
    st2Minus1:diff(avgSt(r2),avgSt(r1)),exSt2Minus1:diff(exSt(r2),exSt(r1)),exTime2Minus1:diff(exTime(r2),exTime(r1)),
    hold2Minus1:diff(role(b2,"hold"),role(b1,"hold")),pickup2Minus1:diff(role(b2,"pickup"),role(b1,"pickup")),
    windSpeed:metric(input,"weather.windSpeed","windSpeed"),waveHeight:metric(input,"weather.waveHeight","waveHeight")
  };
}
function candidateRules(details){
  const numeric=["scenarioScore","scenarioGap","headTotal","headRaceFlow","headAttack","headHold","headPickup","headRoad","headAvgSt","headExSt","headExTime","st2Minus1","exSt2Minus1","exTime2Minus1","hold2Minus1","pickup2Minus1","windSpeed","waveHeight"];
  const out=[];
  for(const field of numeric){
    const vals=[...new Set(details.map(x=>x.features[field]).filter(v=>v!==null).map(v=>Number(v.toFixed(4))))].sort((a,b)=>a-b);
    for(const threshold of vals){for(const op of ["<=",">="]){const hit=x=>x.features[field]!==null&&(op==="<="?x.features[field]<=threshold:x.features[field]>=threshold);const selected=details.filter(hit),saved=selected.filter(x=>x.type==="loss").length,sacrificed=selected.filter(x=>x.type==="gain").length;if(saved<2)continue;out.push({field,op,threshold,matched:selected.length,savedLosses:saved,sacrificedGains:sacrificed,netHitEffect:saved-sacrificed,lossCoverage:Number((saved/Math.max(1,details.filter(x=>x.type==="loss").length)).toFixed(3)),gainDamage:Number((sacrificed/Math.max(1,details.filter(x=>x.type==="gain").length)).toFixed(3))});}}
  }
  return out.sort((a,b)=>b.netHitEffect-a.netHitEffect||b.savedLosses-a.savedLosses||a.sacrificedGains-b.sacrificedGains).slice(0,30);
}
function summary(arr){const fields=["scenarioScore","scenarioGap","headTotal","headRaceFlow","headAttack","headHold","headPickup","headRoad","headAvgSt","headExSt","headExTime","st2Minus1","exSt2Minus1","exTime2Minus1","hold2Minus1","pickup2Minus1","windSpeed","waveHeight"],out={};for(const f of fields){const v=arr.map(x=>x.features[f]).filter(x=>x!==null).sort((a,b)=>a-b);if(!v.length)continue;out[f]={n:v.length,min:v[0],median:v[Math.floor(v.length/2)],max:v[v.length-1],mean:Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(4))};}return out;}
function main(){const details=[],fail=[];for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=f.slice(0,8);if(date<START)continue;const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8")),seen=new Set();for(const r of rows(d)){if(r?.result?.settled!==true)continue;const rk=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(rk))continue;seen.add(rk);try{const input=dataOf(r),actual=key(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!input||!actual)continue;const ai=core.buildPredictionData(input),old=core.buildFormations(ai.analyses,ai.raceScenarios),prodMain=list(ai.formations?.main).slice(0,3),prodSafety=list(ai.formations?.safety).slice(0,2),oldMain=list(old.main).slice(0,3),oldSafety=list(old.safety).slice(0,2),prod=[...prodMain,...prodSafety],cf=[...oldMain,...oldSafety],ph=prod.includes(actual),ch=cf.includes(actual);if(ph===ch)continue;const type=ph?"gain":"loss",scenario=ai.raceScenarios?.mainScenario||{},scenarioType=String(scenario?.type||"unknown"),head=Number(scenario?.headBoatNo||scenario?.attacker||scenario?.outcome?.firstCandidates?.[0]?.boatNo||0);details.push({type,date,jcd:String(r.jcd||"").padStart(2,"0"),raceNo:Number(r.raceNo||0),place:r.place||"",scenario:scenarioType,scenarioHead:head,actual,pay:Number(r?.result?.payoutPer100||r?.result?.review?.payoutPer100||0),prodSafety,oldSafety,addedSafety:prodSafety.filter(t=>!oldSafety.includes(t)),removedSafety:oldSafety.filter(t=>!prodSafety.includes(t)),features:preRaceFeatures(ai,input,scenario,head)});}catch(e){fail.push(`${date}-${r.jcd}-${r.raceNo}:${e?.message||e}`);}}}
  const gains=details.filter(x=>x.type==="gain"),losses=details.filter(x=>x.type==="loss"),rules=candidateRules(details),positive=rules.filter(r=>r.netHitEffect>0);
  console.log(JSON.stringify({schemaVersion:2,source:"#308 post-adoption exact replay / pre-race feature scan",changedCases:details.length,gains:gains.length,losses:losses.length,gainFeatureSummary:summary(gains),lossFeatureSummary:summary(losses),candidateRules:rules,positiveRuleCount:positive.length,bestPositiveRule:positive[0]||null,lossDetails:losses,failures:fail,interpretation:{ruleMeaning:"If the pre-race condition is true, disabling #308 would save each matched loss but sacrifice each matched gain.",adoptionRule:"No candidate is production-safe until replayed on all 697R and time-split/venue-split validation shows net improvement without concentrating on one day or venue."},productionChanged:false},null,2));}
main();
