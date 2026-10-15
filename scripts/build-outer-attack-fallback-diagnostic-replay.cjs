'use strict';
const fs=require('node:fs'),path=require('node:path');
const input=require('./analysis-input-contract');
const shadow=require('../js/outer-attack-ticket-shadow.js');
const evaluator=require('./final-ticket-candidate-evaluator.cjs');
const ROOT=path.resolve(__dirname,'..');
const loss=JSON.parse(fs.readFileSync(path.join(ROOT,'data/stats/outer-attack-pipeline-loss-v1.json'),'utf8'));
const target=new Set((loss.rows||[]).filter(r=>r.stage==='not-comparable').map(r=>r.raceKey));
function metric(rows,key){let stake=0,ret=0,hits=0;for(const r of rows){const entries=key==='a'?r.a:r[key];stake+=entries.reduce((n,x)=>n+Number(x.amountYen||100),0);const hit=entries.find(x=>x.ticket===r.actual);if(hit){hits++;ret+=r.payout*(Number(hit.amountYen||100)/100)}}return{races:rows.length,hits,hitRate:rows.length?Math.round(hits/rows.length*10000)/100:0,stakeYen:stake,returnYen:ret,profitYen:ret-stake,roi:stake?Math.round(ret/stake*10000)/100:0}}
function build(){
 const cohort=input.buildDefaultCohort(),rows=[];
 for(const rec of cohort.records){const key=rec.__analysisRaceKey;if(!target.has(key))continue;const snap=shadow.buildSnapshot(rec,{now:rec.selectedAt||rec.capturedAt||new Date().toISOString()});const ready=Object.fromEntries(Object.entries(snap.variants||{}).filter(([,v])=>v.status==='ready'));if(!Object.keys(ready).length)continue;const actual=input.actualTicket(rec.__officialResult),payout=evaluator.payout(rec.__officialResult);if(!actual||!payout)continue;rows.push({raceKey:key,actual,payout,a:snap.a.entries,cover:ready.cover?.b?.entries||snap.a.entries,flow:ready.flow?.b?.entries||snap.a.entries,hole:ready.hole?.b?.entries||snap.a.entries,readyVariants:Object.keys(ready),replacements:Object.fromEntries(Object.entries(ready).map(([k,v])=>[k,v.replacement]))})}
 const by=k=>rows.filter(r=>r.readyVariants.includes(k));return{schemaVersion:1,analysisId:'outer-attack-fallback-diagnostic-replay-v1',generatedAt:new Date().toISOString(),diagnosticOnly:true,productionChanged:false,automaticApplication:false,sourceNotComparableRaceCount:target.size,replayComparableRaceCount:rows.length,variants:Object.fromEntries(['cover','flow','hole'].map(k=>{const rr=by(k),a=metric(rr,'a'),b=metric(rr,k);return[k,{eligibleCount:rr.length,a,b,delta:{hits:b.hits-a.hits,profitYen:b.profitYen-a.profitYen,roiPoint:Math.round((b.roi-a.roi)*100)/100}}]})),rows};
}
function main(){const r=build(),out=path.join(ROOT,'data/stats/outer-attack-fallback-diagnostic-replay-v1.json');fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({source:r.sourceNotComparableRaceCount,comparable:r.replayComparableRaceCount,variants:r.variants},null,2));return r}
if(require.main===module)main();module.exports={build,main};
