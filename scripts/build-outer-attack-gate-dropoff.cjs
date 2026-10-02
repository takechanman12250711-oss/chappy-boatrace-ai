'use strict';
const fs=require('node:fs'),path=require('node:path');
const input=require('./analysis-input-contract');
const shadow=require('../js/outer-attack-ticket-shadow.js');
const ROOT=path.resolve(__dirname,'..');
function build(){
 const cohort=input.collectCanonicalPredictions(path.join(ROOT,'data','predictions'));
 const rows=[],counts={total:0,preDeadline:0,basisInvalid:0,topNot1:0,noChallengerPair:0,noStAttackAdvantage:0,noFlowSuppression:0,noExhibitionAdvantage:0,active:0,ambiguous:0,inactiveOther:0};
 for(const record of cohort){counts.total++;const reason=input.preDeadlineReason(record);if(reason)continue;counts.preDeadline++;
  const s=shadow.detectSignal(record);const pairs=Array.isArray(s.pairs)?s.pairs:[];let gate='';
  if(!s.basisValid)gate='basisInvalid';
  else if(Number(s.baselineTopBoatNo)!==1)gate='topNot1';
  else if(!pairs.length)gate='noChallengerPair';
  else if(!pairs.some(p=>p.attackSignal))gate='noStAttackAdvantage';
  else if(!pairs.some(p=>p.flowSuppressed))gate='noFlowSuppression';
  else if(!pairs.some(p=>Number(p.weightedGaps?.exhibition)>=shadow.FIXED_SIGNAL.exhibitionMinimum))gate='noExhibitionAdvantage';
  else if(s.status==='active')gate='active';
  else if(s.status==='ambiguous-multiple-targets')gate='ambiguous';
  else gate='inactiveOther';
  counts[gate]++;rows.push({raceKey:input.raceKey(record),selectedAt:record.selectedAt||record.capturedAt||'',gate,status:s.status,baselineTopBoatNo:s.baselineTopBoatNo||null,matchedBoatNos:s.matchedBoatNos||[],pairs:pairs.map(p=>({boatNo:p.boatNo,matched:p.matched,attackSignal:p.attackSignal,flowSuppressed:p.flowSuppressed,weightedGaps:p.weightedGaps}))});
 }
 return{schemaVersion:1,analysisId:'outer-attack-gate-dropoff-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,fixedSignal:shadow.FIXED_SIGNAL,counts,rows};
}
function main(){const r=build(),out=path.join(ROOT,'data/stats/outer-attack-gate-dropoff-v1.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.counts));return r}
if(require.main===module)main();module.exports={build,main};
