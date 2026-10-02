'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..'); const STAKE=100; const RANKS=[8,11,12];
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function summarize(tickets,hits){const investment=tickets*STAKE;const sorted=[...hits].sort((a,b)=>b-a);const total=sorted.reduce((a,b)=>a+b,0);function stress(remove){const ret=sorted.slice(remove).reduce((a,b)=>a+b,0);return {returnYen:ret,profitYen:ret-investment,roiPercent:pct(ret,investment)}}return {addedTickets:tickets,rescueCount:hits.length,manboatRescueCount:hits.filter(x=>x>=10000).length,investmentYen:investment,returnYen:total,profitYen:total-investment,roiPercent:pct(total,investment),topHitPayouts:sorted.slice(0,5),removeTop1:stress(1),removeTop2:stress(2)}}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const buckets={};for(const r of RANKS)buckets[r]={tickets:0,hits:[]};buckets.union={tickets:0,hits:[]};let eligibleHeadMisses=0;
for(const rec of cohort.records){const actual=input.actualTicket(rec.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(rec);if(pool.length<8)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const actualHead=head(actual);if(actualHead===null)continue;const baseHeads=new Set(base.map(x=>head(x.ticket)));if(baseHeads.has(actualHead))continue;eligibleHeadMisses++;const payout=payouts.get(rec.__analysisRaceKey||input.raceKey(rec))||0;let unionAdded=false,unionHit=false;
for(const rank of RANKS){const c=pool[rank-1];if(!c)continue;const cHead=head(c.ticket);if(cHead===null||baseHeads.has(cHead))continue;const b=buckets[rank];b.tickets++;unionAdded=true;if(c.ticket===actual){b.hits.push(payout);unionHit=true;}}
if(unionAdded){buckets.union.tickets++;if(unionHit)buckets.union.hits.push(payout);}}
const results={};for(const [k,b] of Object.entries(buckets))results[k]=summarize(b.tickets,b.hits);
return {schemaVersion:1,analysisId:'head-miss-rank-stress-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleHeadMisses,results,policy:'Retrospective stress test only. Baseline seven unchanged. Tests ranks 8, 11, 12 individually and their union; reports ROI after removing the top one and top two rescue payouts.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
