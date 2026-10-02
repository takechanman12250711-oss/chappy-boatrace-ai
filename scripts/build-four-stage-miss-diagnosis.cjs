'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const ROOT=path.resolve(__dirname,'..');
function parts(t){return String(t||'').split('-').map(Number)}
function pct(n,d){return d?Number((100*n/d).toFixed(2)):0}
function build(){
 const cohort=input.buildDefaultCohort({root:ROOT});
 const counts={races:0,hits:0,headMiss:0,secondMiss:0,thirdMiss:0,narrowingMiss:0,absentFrom24:0};
 const rows=[];
 for(const r of cohort.records){
  const actual=input.actualTicket(r.__officialResult); if(!actual)continue;
  const pool=exp.collectTicketPool(r); if(!pool.length)continue;
  const base=pool.slice(0,7),top24=pool.slice(0,24),a=parts(actual);
  counts.races++;
  if(base.some(x=>x.ticket===actual)){counts.hits++;continue;}
  const baseHeads=new Set(base.map(x=>parts(x.ticket)[0]));
  const basePrefixes=new Set(base.map(x=>{const p=parts(x.ticket);return p.length===3?[p[0],p[1]].join('-'):''}));
  const actualPrefix=[a[0],a[1]].join('-');
  let reason='';
  if(!baseHeads.has(a[0])){reason='head_miss';counts.headMiss++;}
  else if(!basePrefixes.has(actualPrefix)){reason='second_place_miss';counts.secondMiss++;}
  else {reason='third_place_miss';counts.thirdMiss++;}
  if(top24.some(x=>x.ticket===actual)){counts.narrowingMiss++;reason+='_but_in_top24';} else counts.absentFrom24++;
  const idx=pool.findIndex(x=>x.ticket===actual);
  rows.push({raceKey:r.__analysisRaceKey||input.raceKey(r),actual,reason,baseTickets:base.map(x=>x.ticket),actualRank:idx>=0?idx+1:null});
 }
 const misses=counts.races-counts.hits;
 return {schemaVersion:1,analysisId:'four-stage-miss-diagnosis-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,
 methodology:{baseline:'first 7 saved pre-race candidates',stages:['head_miss','second_place_miss','third_place_miss','narrowing_miss'],externalReferenceMapping:'Use the same stages for Hiyori/Macour/BR feature comparisons; no automatic production adoption.'},
 summary:{...counts,misses,hitRatePercent:pct(counts.hits,counts.races),missShare:{head:pct(counts.headMiss,misses),second:pct(counts.secondMiss,misses),third:pct(counts.thirdMiss,misses),narrowing:pct(counts.narrowingMiss,misses),absentFrom24:pct(counts.absentFrom24,misses)}},rows};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};