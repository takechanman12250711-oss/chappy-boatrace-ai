'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..'); const STAKE=100;
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function metric(){return {addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0}}
function finish(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);return m}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const byRank={};for(let r=8;r<=12;r++)byRank[r]=metric();let eligibleMisses=0;
for(const rec of cohort.records){const actual=input.actualTicket(rec.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(rec);if(pool.length<8)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const actualParts=parts(actual);if(actualParts.length!==3)continue;const baseHeads=new Set(base.map(x=>head(x.ticket)));const basePrefixes=new Set(base.map(x=>prefix(x.ticket)));if(!baseHeads.has(actualParts[0]))continue;if(basePrefixes.has(`${actualParts[0]}-${actualParts[1]}`))continue;eligibleMisses++;const payout=payouts.get(rec.__analysisRaceKey||input.raceKey(rec))||0;
for(let rank=8;rank<=12;rank++){const c=pool[rank-1];if(!c)continue;if(!baseHeads.has(head(c.ticket)))continue;if(basePrefixes.has(prefix(c.ticket)))continue;const m=byRank[rank];m.addedTickets++;m.investmentYen+=STAKE;if(c.ticket===actual){m.rescueCount++;m.returnYen+=payout;if(payout>=10000)m.manboatRescueCount++;}}}
for(const m of Object.values(byRank))finish(m);
return {schemaVersion:1,analysisId:'second-place-rank-efficiency-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSecondPlaceMisses:eligibleMisses,byRank,policy:'Retrospective research only. Baseline seven unchanged; evaluates only new second-place prefixes with an already represented first-place boat.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
