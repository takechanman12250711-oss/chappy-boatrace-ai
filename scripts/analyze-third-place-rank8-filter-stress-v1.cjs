'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..'); const STAKE=100;
function parts(t){return String(t||'').split('-').map(Number)}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function goodScore(s){return (s>=90)||(s>=80&&s<85)}
function buildRows(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const rows=[];
for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(r);if(pool.length<8)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const prefixes=new Set(base.map(x=>prefix(x.ticket)));const c=pool[7];if(!prefixes.has(prefix(c.ticket)))continue;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;rows.push({score:c.score,source:c.source,hit:c.ticket===actual,payout});}return rows}
function metric(rows,filter){const sel=rows.filter(filter);const hits=sel.filter(r=>r.hit);const payouts=hits.map(r=>r.payout).sort((a,b)=>b-a);const investment=sel.length*STAKE;const ret=payouts.reduce((a,b)=>a+b,0);function stress(drop){const stressRet=payouts.slice(drop).reduce((a,b)=>a+b,0);return {dropTopHits:drop,returnYen:stressRet,profitYen:stressRet-investment,roiPercent:pct(stressRet,investment)}}
return {addedTickets:sel.length,rescueCount:hits.length,manboatRescueCount:hits.filter(r=>r.payout>=10000).length,investmentYen:investment,returnYen:ret,profitYen:ret-investment,roiPercent:pct(ret,investment),topHitPayouts:payouts.slice(0,5),stress:[stress(1),stress(2)]}}
function build(){const rows=buildRows();const strategies={score90plus:metric(rows,r=>r.score>=90),score80to8499:metric(rows,r=>r.score>=80&&r.score<85),scoreGoodUnion:metric(rows,r=>goodScore(r.score)),candidateDecisionOnly:metric(rows,r=>r.source==='candidateDecision'),scoreGoodAndCandidateDecision:metric(rows,r=>goodScore(r.score)&&r.source==='candidateDecision')};return {schemaVersion:1,analysisId:'third-place-rank8-filter-stress-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleRows:rows.length,strategies,policy:'Retrospective stress test only. Do not adopt filters without preregistered forward validation.'}}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
