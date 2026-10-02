'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payouts = require('./analyze-ticket-expansion-payout-v2.cjs').payoutMap();

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const RANKS = [8,9,10,11,12];

function parts(ticket){ return String(ticket||'').split('-').map(Number); }
function prefix(ticket){ const p=parts(ticket); return p.length===3?`${p[0]}-${p[1]}`:''; }
function pct(a,b){ return b?Number((100*a/b).toFixed(1)):0; }
function blank(label){ return {label,raceCount:0,addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0,totalHitCount:0,totalHitRatePercent:0}; }
function eligibleAt(pool, rank){
  const base=pool.slice(0,7);
  const prefixes=new Set(base.map(x=>prefix(x.ticket)).filter(Boolean));
  const item=pool[rank-1];
  return item && prefixes.has(prefix(item.ticket)) ? item : null;
}
function evaluateRank(records, rank){
  const out=blank(`rank-${rank}`);
  for(const r of records){
    const actual=input.actualTicket(r.__officialResult); if(!actual) continue;
    const pool=expansion.collectTicketPool(r); if(pool.length<7) continue;
    const base=pool.slice(0,7); const item=eligibleAt(pool,rank);
    const baseHit=base.some(x=>x.ticket===actual);
    const addHit=!!item && item.ticket===actual;
    out.raceCount++;
    if(item){ out.addedTickets++; out.investmentYen+=STAKE; }
    if(baseHit||addHit) out.totalHitCount++;
    if(!baseHit&&addHit){
      out.rescueCount++;
      const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;
      out.returnYen+=payout;
      if(payout>=10000) out.manboatRescueCount++;
    }
  }
  out.profitYen=out.returnYen-out.investmentYen;
  out.roiPercent=pct(out.returnYen,out.investmentYen);
  out.totalHitRatePercent=pct(out.totalHitCount,out.raceCount);
  return out;
}
function evaluateCumulative(records,maxRank){
  const out=blank(`through-${maxRank}`);
  for(const r of records){
    const actual=input.actualTicket(r.__officialResult); if(!actual) continue;
    const pool=expansion.collectTicketPool(r); if(pool.length<7) continue;
    const base=pool.slice(0,7);
    const prefixes=new Set(base.map(x=>prefix(x.ticket)).filter(Boolean));
    const added=pool.slice(7,maxRank).filter(x=>prefixes.has(prefix(x.ticket)));
    const baseHit=base.some(x=>x.ticket===actual);
    const addHit=added.some(x=>x.ticket===actual);
    out.raceCount++; out.addedTickets+=added.length; out.investmentYen+=added.length*STAKE;
    if(baseHit||addHit) out.totalHitCount++;
    if(!baseHit&&addHit){
      out.rescueCount++;
      const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;
      out.returnYen+=payout;
      if(payout>=10000) out.manboatRescueCount++;
    }
  }
  out.profitYen=out.returnYen-out.investmentYen;
  out.roiPercent=pct(out.returnYen,out.investmentYen);
  out.totalHitRatePercent=pct(out.totalHitCount,out.raceCount);
  return out;
}
function build(){
  const cohort=input.buildDefaultCohort({root:ROOT});
  const byRank=Object.fromEntries(RANKS.map(r=>[String(r),evaluateRank(cohort.records,r)]));
  const cumulative=Object.fromEntries(RANKS.map(r=>[String(r),evaluateCumulative(cohort.records,r)]));
  return {schemaVersion:1,analysisId:'third-place-prefix-rank-efficiency-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,purpose:'Measure which exact ranks 8-12 carry efficient third-place rescue value when the 1st-2nd prefix already exists in the current first seven.',methodology:{baseline:'first 7 saved pre-race candidates',eligibility:'same exact 1st-2nd prefix as any baseline ticket',byRank:'evaluate each rank independently',cumulative:'evaluate all eligible tickets from rank 8 through the stated rank',candidateOrder:'unchanged saved pre-race order',stake:`${STAKE} yen flat per added ticket`,resultUse:'evaluation only'},diagnostics:cohort.diagnostics,byRank,cumulative};
}
if(require.main===module) process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,evaluateRank,evaluateCumulative};
