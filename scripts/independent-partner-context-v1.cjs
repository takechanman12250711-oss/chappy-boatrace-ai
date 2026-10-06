'use strict';
// Project already saved official histories; never read the current race's result.
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./independent-autonomous-candidate.cjs');
const VERSION='independent-partner-context-v1',SOURCE='data/stats/racer-skill-patterns.json';
const json=x=>JSON.stringify(x)+'\n';
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
function load(root){
  try{const bytes=fs.readFileSync(path.join(root,SOURCE));return {sha256:hash(bytes),data:JSON.parse(bytes)};}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function course(value,expected){
  if(value?.course!==expected||!integer(value.starts,0,1000000)||!integer(value.wins,0,value.starts)||
    !integer(value.top3,value.wins,value.starts)||!Array.isArray(value.winningMethods))return null;
  const methods=value.winningMethods.map(m=>({key:m.key,count:m.count}));
  if(methods.some(m=>typeof m.key!=='string'||m.key.length>32||!integer(m.count,0,value.wins))||
    new Set(methods.map(m=>m.key)).size!==methods.length||methods.reduce((s,m)=>s+m.count,0)>value.wins)return null;
  return {course:expected,starts:value.starts,wins:value.wins,top3:value.top3,winningMethods:methods.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)};
}
function historyMetadata(source,input){
  const d=source?.data,t=Date.parse(d?.generatedAt),latest=d?.analysisWindow?.latestDate;
  if(!source)return {status:'missing',reason:'history-file-missing'};
  if(d?.schemaVersion!==1||d.source!=='boatrace-official'||!Number.isFinite(t)||t>Date.parse(input.observedAt)||
    !/^\d{8}$/.test(d.firstDate||'')||!/^\d{8}$/.test(d.lastDate||'')||!/^\d{8}$/.test(latest||'')||
    d.firstDate>d.lastDate||latest>d.lastDate||d.lastDate>=input.date||latest>=input.date||
    d.thresholds?.minimumSamples!==12||!/^([a-f0-9]{64})$/.test(source.sha256||''))
    return {status:'unavailable',reason:'history-source-or-cutoff-invalid'};
  return {status:'available',source:'boatrace-official',path:SOURCE,sha256:source.sha256,
    generatedAt:d.generatedAt,firstDate:d.firstDate,lastDate:d.lastDate,latestRaceDate:latest,minimumSamples:12};
}
function capture(data,input,context,source){
  const metadata=historyMetadata(source,input),url=`https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php?day=${input.date}&race=${input.raceNo}&kind=2`;
  const lapComplete=input.jcd==='06'&&data.originalExhibition?.status==='available'&&data.originalExhibition.rowCount===6&&
    data.originalExhibition.sourceUrl===url&&context.officialEntries.every(e=>{
      const v=data.entries.find(x=>x.boat===e.boat);
      return e.registerNo&&v?.registerNo===e.registerNo&&v.exhibition?.lapTimeSourceUrl===url&&
        typeof v.exhibition.lapTime==='number'&&Number.isFinite(v.exhibition.lapTime)&&v.exhibition.lapTime>=30&&v.exhibition.lapTime<=50;
    });
  const rows=[...input.rows].sort((a,b)=>a.boat-b.boat).map(r=>{
    const e=context.officialEntries.find(x=>x.boat===r.boat),history=metadata.status==='available'?source.data.racers?.[e.registerNo]:null;
    const matched=history?.registerNo===e.registerNo&&e.registerNo;
    return {boat:r.boat,course:r.course,registerNo:e.registerNo,
      lapTime:lapComplete?data.entries.find(x=>x.boat===r.boat).exhibition.lapTime:null,
      recent:matched?course(history.windows?.recent1Year?.byCourse?.[r.course],r.course):null,
      previous:matched?course(history.windows?.previous2Years?.byCourse?.[r.course],r.course):null};
  });
  const body={version:VERSION,raceKey:input.raceKey,inputHash:context.inputHash,contextHash:context.contextHash,
    observedAt:input.observedAt,history:metadata,lap:{status:lapComplete?'available':'unavailable',
      sourceUrl:lapComplete?url:null,provenance:'parsed-official-response',actualTurnOpeningObserved:false},rows};
  return {...body,supportHash:hash(json(body))};
}
function validate(value,input,context){
  const {supportHash,...body}=value||{};
  if(value?.version!==VERSION||value.raceKey!==input.raceKey||value.inputHash!==context.inputHash||value.contextHash!==context.contextHash||
    value.observedAt!==input.observedAt||supportHash!==hash(json(body))||!Array.isArray(value.rows)||value.rows.length!==6)
    throw Error('partner_context_invalid');
  const h=value.history;
  if(h.status==='available'){
    const again=historyMetadata({sha256:h.sha256,data:{schemaVersion:1,source:h.source,generatedAt:h.generatedAt,firstDate:h.firstDate,
      lastDate:h.lastDate,analysisWindow:{latestDate:h.latestRaceDate},thresholds:{minimumSamples:h.minimumSamples}}},input);
    if(json(again)!==json(h))throw Error('partner_history_invalid');
  }else if(!['missing','unavailable'].includes(h.status)||value.rows.some(r=>r.recent||r.previous))throw Error('partner_history_invalid');
  for(let n=0;n<6;n++){
    const r=value.rows[n],i=input.rows.find(x=>x.boat===r.boat),e=context.officialEntries.find(x=>x.boat===r.boat);
    if(r.boat!==n+1||r.course!==i?.course||r.registerNo!==e?.registerNo||
      [r.recent,r.previous].some(v=>v!==null&&(!r.registerNo||json(course(v,r.course))!==json(v))))throw Error('partner_history_row_invalid');
  }
  const lap=value.lap,url=`https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php?day=${input.date}&race=${input.raceNo}&kind=2`;
  if(lap?.provenance!=='parsed-official-response'||lap.actualTurnOpeningObserved!==false||
    (lap.status==='available'?input.jcd!=='06'||lap.sourceUrl!==url||value.rows.some(r=>!r.registerNo||typeof r.lapTime!=='number'||!Number.isFinite(r.lapTime)||r.lapTime<30||r.lapTime>50):
      lap.status!=='unavailable'||lap.sourceUrl!==null||value.rows.some(r=>r.lapTime!==null)))throw Error('partner_lap_invalid');
  return true;
}
module.exports={VERSION,SOURCE,load,capture,validate};
