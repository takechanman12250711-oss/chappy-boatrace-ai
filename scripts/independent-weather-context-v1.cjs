'use strict';
const fs=require('node:fs'),path=require('node:path');
const h=require('./independent-weather-history-v1.cjs');
const VERSION='independent-weather-context-v1';
function load(root){try{const raw=fs.readFileSync(path.join(root,h.SOURCE));return {sha256:h.hash(raw),data:JSON.parse(raw)};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function metadata(source,input){
  if(!source)return {status:'missing',reason:'weather-history-file-missing'};
  const d=source.data,w=d?.window;
  try{
    if(d?.version!==h.VERSION||d.builderHash!==h.hash(fs.readFileSync(require.resolve('./independent-weather-history-v1.cjs')))||
      d.usableForPrediction!==false||d.automaticApplication!==false||d.adaptationOrderingImplemented!==false||
      !/^[a-f0-9]{64}$/.test(source.sha256||'')||!Number.isFinite(Date.parse(d.generatedAt))||Date.parse(d.generatedAt)>Date.parse(input.observedAt)||
      w?.days!==90||w.firstDate!==h.shift(w.asOfDate,-90)||w.lastDate!==h.shift(w.asOfDate,-1)||w.lastDate>=input.date||
      !/^[a-f0-9]{40}$/.test(d.sourceCommit||''))throw Error('invalid');
  }catch{return {status:'unavailable',reason:'weather-history-source-or-cutoff-invalid'};}
  return {status:'available',path:h.SOURCE,sha256:source.sha256,builderHash:d.builderHash,sourceCommit:d.sourceCommit,generatedAt:d.generatedAt,window:w};
}
function capture(input,context,source){
  const history=metadata(source,input),condition=h.condition(context.weather),key=h.weatherKey(condition);
  const rows=[...input.rows].sort((a,b)=>a.boat-b.boat).map(r=>{
    const registerNo=context.officialEntries.find(e=>e.boat===r.boat)?.registerNo||null;
    const row={boat:r.boat,course:r.course,registerNo,status:'unavailable',reason:null,allWeather:null,matchedWeather:null,matchedTide:null};
    if(history.status!=='available'){row.reason=history.reason;return row;}
    if(!key){row.reason='current-weather-missing';return row;}
    if(!registerNo){row.reason='registration-missing';return row;}
    const racer=source.data.racers?.[registerNo],group=racer?.groups?.[`${input.jcd}|${r.course}`];
    if(!group){row.status='no-history';row.reason='no-same-venue-course-history';return row;}
    const cell=group.byWeather?.[key],tide=condition.tidePhase&&cell?.byTide?.[condition.tidePhase];
    const valid=s=>h.statsValid(s,history.window);
    const subset=(a,b)=>['starts','first','second','third','other'].every(k=>a[k]<=b[k]);
    if(racer.registerNo!==registerNo||group.jcd!==input.jcd||group.course!==r.course||!valid(group.allWeather)||
      cell&&(!valid(cell.stats)||h.weatherKey(cell.condition)!==key||!subset(cell.stats,group.allWeather))||
      tide&&(!valid(tide)||!subset(tide,cell.stats))) {row.reason='history-group-invalid';return row;}
    row.status=cell?'observed-samples':'no-matched-weather';row.allWeather=h.rates(group.allWeather);
    row.matchedWeather=h.rates(cell?.stats||h.empty());row.matchedTide=condition.tidePhase?h.rates(tide||h.empty()):null;
    row.reason=cell?'descriptive-only-no-adoption-gate':'exact-weather-sample-zero';return row;
  });
  const body={version:VERSION,raceKey:input.raceKey,inputHash:context.inputHash,contextHash:context.contextHash,observedAt:input.observedAt,
    history,condition,rows,usableForPrediction:false,automaticApplication:false,usedForCandidateSelection:false,adaptationOrderingImplemented:false,
    limitation:'Observed samples among saved inputs; allWeather also includes matchedWeather; rates are not independent or causal suitability estimates'};
  return {...body,evidenceHash:h.hash(h.json(body))};
}
function validate(value,input,context){
  const {evidenceHash,...body}=value||{};
  if(value?.version!==VERSION||evidenceHash!==h.hash(h.json(body)))throw Error('weather_context_hash_invalid');
  // Reconstruct only the preserved projection, so old seals never read a newer history file.
  const m=value.history;let source=null;
  if(m?.status==='available'){
    const racers={};
    for(const row of value.rows||[]){if(row.allWeather){
      const raw=s=>{const {firstRate,secondRate,thirdRate,...stats}=s;return stats;};
      const byWeather={};if(row.status==='observed-samples')byWeather[h.weatherKey(value.condition)]={condition:value.condition,stats:raw(row.matchedWeather),
        byTide:row.matchedTide&&row.matchedTide.starts?{[value.condition.tidePhase]:raw(row.matchedTide)}:{}};
      racers[row.registerNo]={registerNo:row.registerNo,groups:{[`${input.jcd}|${row.course}`]:{jcd:input.jcd,course:row.course,allWeather:raw(row.allWeather),byWeather}}};
    }}
    source={sha256:m.sha256,data:{version:h.VERSION,builderHash:m.builderHash,sourceCommit:m.sourceCommit,generatedAt:m.generatedAt,window:m.window,racers,
      usableForPrediction:false,automaticApplication:false,adaptationOrderingImplemented:false}};
  }else if(m?.status==='unavailable')source={};
  const again=capture(input,context,source);
  // Invalid groups are deliberately unavailable; preserve their reason without inventing evidence.
  if(m?.status==='available')for(let n=0;n<again.rows.length;n++)if(value.rows?.[n]?.reason==='history-group-invalid'){
    const r=value.rows[n];if(r.status!=='unavailable'||r.allWeather!==null||r.matchedWeather!==null||r.matchedTide!==null)throw Error('weather_context_group_invalid');
    again.rows[n]={...again.rows[n],status:'unavailable',reason:'history-group-invalid'};
  }
  const {evidenceHash:unused,...againBody}=again;
  if(h.json(body)!==h.json(againBody))throw Error('weather_context_replay_invalid');
  return true;
}
function report(cohort){
  const r={version:'independent-weather-context-report-v1',sealed:cohort.rows.length,rejected:cohort.rejected,
    historyAvailableRaces:0,currentWeatherKnownRaces:0,tideUnknownRaces:0,boatStatuses:{},matchedSampleBoats:0,
    usedForCandidateSelection:false,adaptationOrderingImplemented:false,usableForPrediction:false,automaticApplication:false};
  for(const {snapshot:s} of cohort.rows){const c=s.weatherHistoryStudy.context;if(c.history.status==='available')r.historyAvailableRaces++;
    if(h.weatherKey(c.condition))r.currentWeatherKnownRaces++;if(c.condition.tidePhase===null)r.tideUnknownRaces++;
    for(const row of c.rows){r.boatStatuses[row.status]=(r.boatStatuses[row.status]||0)+1;if(row.matchedWeather?.starts>0)r.matchedSampleBoats++;}}
  return r;
}
module.exports={VERSION,load,metadata,capture,validate,report};
