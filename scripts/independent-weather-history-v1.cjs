'use strict';
// Descriptive, observed-sample histories only. No scoring or ticket selection.
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./independent-autonomous-candidate.cjs');
const archive=require('./daily-prediction-source-archive');
const contract=require('./analysis-input-contract');
const VERSION='independent-weather-history-v1',SOURCE='data/stats/independent-weather-history.json';
const json=x=>JSON.stringify(x)+'\n';
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const boat=v=>Number.isInteger(v)&&v>=1&&v<=6;
const day=v=>/^\d{8}$/.test(v||'')&&new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6)}T00:00:00Z`).toISOString().slice(0,10).replaceAll('-','')===v;
function shift(date,days){return new Date(Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}T00:00:00Z`)+days*86400000).toISOString().slice(0,10).replaceAll('-','');}
function condition(w={}){
  const windSpeed=num(w.windSpeed,0,50)?w.windSpeed:null,waveHeight=num(w.waveHeight,0,300)?w.waveHeight:null;
  const direction=windSpeed===0?'calm':({'向かい風':'head','追い風':'tail','横風':'cross'})[w.windDirection]||null;
  const phase=w.tidePhase??w.tideFlow;
  const tidePhase=w.liveTideAvailable===true&&['満潮','干潮','上げ潮','下げ潮'].includes(phase)?phase:null;
  return {direction,windSpeed,waveHeight,tidePhase};
}
function weatherKey(w){return w.direction!==null&&w.windSpeed!==null&&w.waveHeight!==null?`${w.direction}|${w.windSpeed}|${w.waveHeight}`:null;}
function empty(){return {starts:0,first:0,second:0,third:0,other:0,firstDate:null,lastDate:null};}
function add(s,rank,date){s.starts++;s[['first','second','third'][rank-1]||'other']++;s.firstDate=s.firstDate===null?date:s.firstDate<date?s.firstDate:date;s.lastDate=s.lastDate===null?date:s.lastDate>date?s.lastDate:date;}
function statsValid(s,window){return s&&Number.isSafeInteger(s.starts)&&s.starts>=0&&['first','second','third','other'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&
  s.first+s.second+s.third+s.other===s.starts&&(s.starts===0?s.firstDate===null&&s.lastDate===null:day(s.firstDate)&&day(s.lastDate)&&s.firstDate>=window.firstDate&&s.lastDate<=window.lastDate&&s.firstDate<=s.lastDate);}
function rates(s){return {...s,firstRate:s.starts?s.first/s.starts:null,secondRate:s.starts?s.second/s.starts:null,thirdRate:s.starts?s.third/s.starts:null};}
function project(r,date){
  const c=r?.prediction?.preRaceConditions||r?.preRaceConditions,key=contract.raceKey(r);
  const reason=contract.preDeadlineReason(r);if(reason)return {reason};
  if(!Number.isFinite(Date.parse(r.selectedAt))||!key||key.slice(0,8)!==date||c?.schemaVersion!==4||c.source!=='boatrace-official')return {reason:'source-or-identity-invalid'};
  const rows=c.boats||[];
  if(rows.length!==6||new Set(rows.map(b=>b.boatNo)).size!==6||new Set(rows.map(b=>b.registerNo)).size!==6||new Set(rows.map(b=>b.course)).size!==6||
    rows.some(b=>!boat(b.boatNo)||!boat(b.course)||!/^\d{4}$/.test(b.registerNo||'')||b.courseOfficial!==true||b.courseMappingSource!=='official-start-image'))return {reason:'official-boat-mapping-invalid'};
  const weather=condition(c.weather);if(!weatherKey(weather))return {reason:'weather-missing'};
  return {value:{raceKey:key,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,sourceFetchedAt:c.sourceFetchedAt,weather,
    rows:rows.map(b=>({boat:b.boatNo,course:b.course,registerNo:b.registerNo})).sort((a,b)=>a.boat-b.boat)}};
}
function resultProjection(r,key,deadline,generatedAt){
  if(contract.raceKey(r)!==key||r.source!=='boatrace-official'||r.resultAvailable!==true||r.void===true||r.status!=='finished'||r.refund===true||r.hasRefund===true||
    !(Date.parse(r.checkedAt)>=Date.parse(deadline)&&Date.parse(r.checkedAt)<=Date.parse(generatedAt)))return null;
  const starts=r.starts||[],finishers=r.finishers||[];
  if(starts.length!==6||finishers.length!==6||new Set(starts.map(x=>x.boat)).size!==6||new Set(starts.map(x=>x.course)).size!==6||
    new Set(finishers.map(x=>x.boat)).size!==6||new Set(finishers.map(x=>x.rank)).size!==6||
    starts.some(x=>!boat(x.boat)||!boat(x.course)||x.marker||x.falseStart||x.lateStart)||
    finishers.some(x=>!boat(x.boat)||!boat(x.rank)||!/^\d{4}$/.test(x.registerNo||'')))return null;
  const ordered=[...finishers].sort((a,b)=>a.rank-b.rank);
  if(r.trifecta?.combination!==ordered.slice(0,3).map(x=>x.boat).join('-'))return null;
  return {raceKey:key,checkedAt:r.checkedAt,rows:finishers.map(f=>({boat:f.boat,registerNo:f.registerNo,rank:f.rank,course:starts.find(s=>s.boat===f.boat).course})).sort((a,b)=>a.boat-b.boat)};
}
function create({asOfDate,generatedAt,sourceCommit=''}){
  if(!day(asOfDate)||!Number.isFinite(Date.parse(generatedAt)))throw Error('weather_history_clock_invalid');
  return {version:VERSION,generatedAt,sourceCommit,window:{firstDate:shift(asOfDate,-90),lastDate:shift(asOfDate,-1),asOfDate,days:90},
    coverage:{predictionRecords:0,canonicalRaces:0,acceptedRaces:0,acceptedBoats:0,tideKnownRaces:0,rejected:{},missingResultFiles:[]},
    sourceFiles:[],evidence:[],racers:{},usableForPrediction:false,automaticApplication:false,adaptationOrderingImplemented:false,
    population:'saved daily primary and verification inputs with complete weather and six normal finishers only; not all starts; no causal suitability claim'};
}
function ingest(out,date,predictions,results,sourceFiles){
  const reject=r=>{out.coverage.rejected[r]=(out.coverage.rejected[r]||0)+1;};
  if(date<out.window.firstDate||date>out.window.lastDate)return;
  out.sourceFiles.push(...sourceFiles);const canonical=new Map();
  // Existing primary preference; within each kind use latest capture, never choose by result.
  for(const kind of ['verificationPredictions','predictions'])for(const r of predictions[kind]||[]){
    out.coverage.predictionRecords++;const p=project(r,date);if(p.reason){reject(p.reason);continue;}
    const old=canonical.get(p.value.raceKey);
    if(!old||kind==='predictions'&&old.kind!=='predictions'||old.kind===kind&&Date.parse(p.value.selectedAt)>Date.parse(old.value.selectedAt))canonical.set(p.value.raceKey,{...p,kind});
  }
  out.coverage.canonicalRaces+=canonical.size;
  for(const {value:p,kind} of canonical.values()){
    const matching=(results.races||[]).filter(r=>contract.raceKey(r)===p.raceKey);
    if(matching.length!==1){reject(matching.length?'duplicate-result':'result-missing');continue;}
    const result=resultProjection(matching[0],p.raceKey,p.deadlineAt,out.generatedAt);
    if(!result){reject('result-unresolved-or-invalid');continue;}
    if(result.rows.some(r=>p.rows.find(b=>b.boat===r.boat)?.registerNo!==r.registerNo)){reject('registration-mismatch');continue;}
    const courseChanged=result.rows.some(r=>p.rows.find(b=>b.boat===r.boat).course!==r.course);
    // Group by actual result course; preserve exhibition changes as evidence, never substitute boat number.
    const jcd=p.raceKey.split('-')[1],wk=weatherKey(p.weather);
    out.coverage.acceptedRaces++;out.coverage.acceptedBoats+=6;if(p.weather.tidePhase)out.coverage.tideKnownRaces++;
    out.evidence.push({raceKey:p.raceKey,predictionKind:kind,predictionHash:hash(json(p)),resultHash:hash(json(result)),
      selectedAt:p.selectedAt,sourceFetchedAt:p.sourceFetchedAt,deadlineAt:p.deadlineAt,resultCheckedAt:result.checkedAt,
      weather:p.weather,courseChanged,rows:result.rows});
    for(const r of result.rows){
      const racer=out.racers[r.registerNo]||=( {registerNo:r.registerNo,groups:{}} );
      const group=racer.groups[`${jcd}|${r.course}`]||={jcd,course:r.course,allWeather:empty(),byWeather:{}};
      add(group.allWeather,r.rank,date);const cell=group.byWeather[wk]||={condition:{direction:p.weather.direction,windSpeed:p.weather.windSpeed,waveHeight:p.weather.waveHeight},stats:empty(),byTide:{}};
      add(cell.stats,r.rank,date);if(p.weather.tidePhase)add(cell.byTide[p.weather.tidePhase]||=empty(),r.rank,date);
    }
  }
}
function build(root,{now=new Date(),sourceCommit=process.env.GITHUB_SHA||''}={}){
  const generatedAt=now.toISOString(),asOfDate=new Date(now.getTime()+9*3600000).toISOString().slice(0,10).replaceAll('-','');
  const out=create({asOfDate,generatedAt,sourceCommit});
  const dates=[...new Set([...archive.predictionSourceDates(root),...archive.archivedSourceDates(root)])].filter(d=>d>=out.window.firstDate&&d<=out.window.lastDate).sort();
  for(const date of dates){
    const resultPath=`data/results/${date}.json`;if(!fs.existsSync(path.join(root,resultPath))){out.coverage.missingResultFiles.push(date);continue;}
    archive.restorePredictionSource({rootDirectory:root,date});const predictionPath=`data/predictions/${date}.json`;
    const p=fs.readFileSync(path.join(root,predictionPath)),r=fs.readFileSync(path.join(root,resultPath));
    ingest(out,date,JSON.parse(p),JSON.parse(r),[{path:predictionPath,sha256:hash(p)},{path:resultPath,sha256:hash(r)}]);
  }
  out.evidence.sort((a,b)=>a.raceKey.localeCompare(b.raceKey));out.builderHash=hash(fs.readFileSync(__filename));
  archive.atomicWrite(path.join(root,SOURCE),Buffer.from(json(out)));
  console.log(JSON.stringify({weatherHistory:out.coverage,window:out.window,racers:Object.keys(out.racers).length,usableForPrediction:false}));return out;
}
if(require.main===module)build(process.cwd());
module.exports={VERSION,SOURCE,json,hash,condition,weatherKey,empty,rates,statsValid,shift,create,ingest,project,resultProjection,build};
