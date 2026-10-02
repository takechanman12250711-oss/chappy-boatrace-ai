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
function rows(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const out=[];
for(const rec of cohort.records){const actual=input.actualTicket(rec.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(rec);if(pool.length<12)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const ap=parts(actual);if(ap.length!==3)continue;const heads=new Set(base.map(x=>head(x.ticket)));const prefixes=new Set(base.map(x=>prefix(x.ticket)));if(!heads.has(ap[0])||prefixes.has(`${ap[0]}-${ap[1]}`))continue;const payout=payouts.get(rec.__analysisRaceKey||input.raceKey(rec))||0;for(const rank of [9,12]){const c=pool[rank-1];if(!c||!heads.has(head(c.ticket))||prefixes.has(prefix(c.ticket)))continue;out.push({rank,score:c.score,source:c.source,hit:c.ticket===actual,payout});}}return out}
function metric(rs,filter){const sel=rs.filter(filter);const hits=sel.filter(r=>r.hit);const pays=hits.map(r=>r.payout).sort((a,b)=>b-a);const inv=sel.length*STAKE,ret=pays.reduce((a,b)=>a+b,0);const stress=(drop)=>{const r=pays.slice(drop).reduce((a,b)=>a+b,0);return {dropTopHits:drop,returnYen:r,profitYen:r-inv,roiPercent:pct(r,inv)}};return {addedTickets:sel.length,rescueCount:hits.length,manboatRescueCount:hits.filter(r=>r.payout>=10000).length,investmentYen:inv,returnYen:ret,profitYen:ret-inv,roiPercent:pct(ret,inv),topHitPayouts:pays.slice(0,5),stress:[stress(1),stress(2)]}}
function build(){const rs=rows();const strategies={rank9:metric(rs,r=>r.rank===9),rank12:metric(rs,r=>r.rank===12),rank9or12:metric(rs,r=>r.rank===9||r.rank===12)};return {schemaVersion:1,analysisId:'second-place-rank9-rank12-stress-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,strategies,policy:'Retrospective stress test only. Do not adopt without forward validation.'}}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
