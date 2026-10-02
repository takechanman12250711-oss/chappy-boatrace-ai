'use strict';
const fs=require('node:fs'),path=require('node:path');
const input=require('./analysis-input-contract');
const evaluator=require('./final-ticket-candidate-evaluator.cjs');
const replay=require('./build-playful-manshu-20260923.cjs');
const CONFIG=require('../data/experiments/playful-link-position-v1.json');
const ROOT=path.resolve(__dirname,'..'), OUT=path.join(ROOT,'data/stats/playful-link-position-forward-v1.json');
const START=Date.parse(CONFIG.registeredAt);
const uniq=a=>[...new Set(a)];
function payout(r){return evaluator.payout(r)}
function summary(rows,side){let stake=0,ret=0,hits=0;for(const r of rows){const t=r[side];stake+=t.length*100;if(t.includes(r.actual)){hits++;ret+=r.payout}}return{races:rows.length,tickets:rows.reduce((n,r)=>n+r[side].length,0),hits,hitRate:rows.length?Math.round(hits/rows.length*10000)/100:0,stakeYen:stake,returnYen:ret,profitYen:ret-stake,roi:stake?Math.round(ret/stake*10000)/100:0}}
function build(){
 const cohort=input.buildDefaultCohort(),rows=[],excluded={beforeRegistration:0,missingBase:0,noAddedLinkCandidate:0};
 for(const record of cohort.records){const at=Date.parse(record.selectedAt||record.capturedAt||'');if(!at||at<=START){excluded.beforeRegistration++;continue}
  const c=replay.candidates(record);if(!c.base.length){excluded.missingBase++;continue}
  const added=uniq(c.out.linkPlay||[]);if(!added.length){excluded.noAddedLinkCandidate++;continue}
  const actual=input.actualTicket(record.__officialResult),paid=payout(record.__officialResult);if(!actual||!paid)continue;
  rows.push({raceKey:record.__analysisRaceKey,selectedAt:record.selectedAt||record.capturedAt||'',base:c.base,candidate:uniq([...c.base,...added]),added,actual,payout:paid,baseHit:c.base.includes(actual),candidateHit:uniq([...c.base,...added]).includes(actual)});
 }
 rows.sort((a,b)=>a.selectedAt.localeCompare(b.selectedAt)||a.raceKey.localeCompare(b.raceKey));
 const baseline=summary(rows,'base'),candidate=summary(rows,'candidate');
 return{schemaVersion:1,analysisId:'playful-link-position-forward-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,preregistration:{experimentId:CONFIG.experimentId,registeredAt:CONFIG.registeredAt,discoveryDateExcluded:true},rule:CONFIG.candidate,diagnostics:{...cohort.diagnostics,...excluded,eligibleForwardRows:rows.length},baseline,candidate,delta:{hits:candidate.hits-baseline.hits,hitRatePoint:Math.round((candidate.hitRate-baseline.hitRate)*100)/100,profitYen:candidate.profitYen-baseline.profitYen,roiPoint:Math.round((candidate.roi-baseline.roi)*100)/100,newHits:rows.filter(r=>!r.baseHit&&r.candidateHit).length},rows};
}
function main(){const report=build();fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({diagnostics:report.diagnostics,baseline:report.baseline,candidate:report.candidate,delta:report.delta},null,2));return report}
if(require.main===module)main();module.exports={build,main,summary};
