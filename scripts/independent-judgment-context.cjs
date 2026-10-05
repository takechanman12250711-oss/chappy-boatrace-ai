'use strict';
// Preserve already-fetched official facts for the next judgment-rule study.
// This module does not choose a scenario, assign roles, rank boats or make tickets.
const {createHash}=require('node:crypto');
const VERSION='independent-judgment-context-v1';
const json=x=>JSON.stringify(x);
const hash=x=>createHash('sha256').update(json(x)+'\n').digest('hex');
const number=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
const integer=(x,min,max)=>Number.isInteger(x)?number(x,min,max):null;
const text=(x,max)=>typeof x==='string'&&x.length<=max?x:null;
function ranks(profile,registerNo,input){
  if(profile?.version!=='official-course-start-rank-v1'||profile.status!=='available'||
    profile.source!=='boatrace-official-course'||profile.registerNo!==registerNo||
    profile.sourceUrl!==`https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${registerNo}`||
    !/^[a-f0-9]{64}$/.test(profile.sourceSha256||'')||
    !(Date.parse(profile.fetchedAt)<=Date.parse(input.observedAt))||
    new Date(Date.parse(profile.fetchedAt)+9*3600000).toISOString().slice(0,10).replaceAll('-','')!==input.date||
    profile.referenceOnly!==true||profile.population!=='general-only-unconfirmed')return null;
  const values=profile.byCourse;
  if(!values||Object.keys(values).length!==6||[1,2,3,4,5,6].some(c=>values[c]!==null&&number(values[c],1,6)===null))return null;
  return {version:profile.version,source:profile.source,status:profile.status,registerNo,
    byCourse:Object.fromEntries([1,2,3,4,5,6].map(c=>[c,values[c]])),sourceUrl:profile.sourceUrl,
    sourceSha256:profile.sourceSha256,fetchedAt:profile.fetchedAt,referenceOnly:true,population:'general-only-unconfirmed'};
}
function capture(data,input){
  if(!Array.isArray(data?.entries)||data.entries.length!==6||new Set(data.entries.map(r=>r.boat)).size!==6||
    data.entries.some(r=>!Number.isInteger(r.boat)||r.boat<1||r.boat>6))throw Error('judgment_context_entries_invalid');
  const officialEntries=data.entries.map(e=>{
    const i=input.rows.find(r=>r.boat===e.boat);
    if(!i||e.exhibition?.displayTime!==i.displayTime)throw Error('judgment_context_exhibition_mismatch');
    const registerNo=/^\d{4}$/.test(e.registerNo||'')?String(e.registerNo):null;
    const series=e.currentRace?.stList;
    const stList=Array.isArray(series)&&series.length<=24&&series.every(v=>number(v,0,1)!==null)?[...series]:null;
    return {boat:e.boat,registerNo,className:['A1','A2','B1','B2'].includes(e.className)?e.className:null,
      fCount:integer(e.fCount,0,9),lCount:integer(e.lCount,0,9),avgSt:number(e.avgSt,0,1),
      currentRace:{stList},nationalWinRate:number(e.nationalWinRate,0,10),national2Rate:number(e.national2Rate,0,100),
      national3Rate:number(e.national3Rate,0,100),localWinRate:number(e.localWinRate,0,10),
      local2Rate:number(e.local2Rate,0,100),local3Rate:number(e.local3Rate,0,100),
      motorNo:integer(e.motorNo,1,999),motor2Rate:number(e.motor2Rate,0,100),motor3Rate:number(e.motor3Rate,0,100),
      exhibition:{displayTime:i.displayTime,tilt:number(e.exhibition?.tilt,-10,10),
        propeller:text(e.exhibition?.propeller,32),partsExchange:text(e.exhibition?.partsExchange,256)},
      officialStartRank:ranks(e.officialStartRank,registerNo,input)};
  }).sort((a,b)=>a.boat-b.boat);
  const w=data.weather||{},weather={temperature:number(w.temperature,-30,60),windSpeed:number(w.windSpeed,0,100),
    waterTemperature:number(w.waterTemperature,-10,60),waveHeight:number(w.waveHeight,0,1000),
    windDirection:text(w.windDirection,40),windDirectionCode:integer(w.windDirectionCode,0,16),
    tideLevel:number(w.tideLevel,-2000,2000),tideFlow:text(w.tideFlow,40),liveTideAvailable:w.liveTideAvailable===true};
  const body={version:VERSION,raceKey:input.raceKey,observedAt:input.observedAt,
    provenance:'parsed-official-response',sourceUrls:[...input.urls],inputHash:hash(input),
    officialEntries,weather,coverage:{registeredRacers:officialEntries.filter(e=>e.registerNo).length,
      averageST:officialEntries.filter(e=>e.avgSt!==null).length,currentSeriesST:officialEntries.filter(e=>e.currentRace.stList?.length).length,
      courseStartRank:officialEntries.filter(e=>e.officialStartRank).length,skillClass:officialEntries.filter(e=>e.className).length,
      localPerformance:officialEntries.filter(e=>e.localWinRate!==null).length,motorPerformance:officialEntries.filter(e=>e.motor2Rate!==null).length},
    judgmentStages:['flow','course','start','exhibition','remainPickup','localWater','skill','motor'],
    judgmentImplemented:false,usedForCandidateSelection:false,usableForPrediction:false};
  return {...body,contextHash:hash(body)};
}
function validate(context,input){
  if(!context||context.version!==VERSION||context.inputHash!==hash(input)||context.raceKey!==input.raceKey||
    context.observedAt!==input.observedAt||json(capture({entries:context.officialEntries,weather:context.weather},input))!==json(context))
    throw Error('judgment_context_invalid');
  return true;
}
module.exports={VERSION,capture,validate};
