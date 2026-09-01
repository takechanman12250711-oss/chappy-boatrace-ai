'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}
function prefix(ticket) {
  const p = parts(ticket);
  return p.length === 3 ? `${p[0]}-${p[1]}` : '';
}
function pct(a,b) { return b ? Number((100*a/b).toFixed(1)) : 0; }
function empty(name) {
  return {name,raceCount:0,addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0,baselineHitCount:0,totalHitCount:0,totalHitRatePercent:0,thirdMissRescueCount:0};
}
function classifyMiss(actual, base) {
  const a=parts(actual); const bp=base.map(x=>parts(x.ticket));
  if (!bp.some(p=>p[0]===a[0])) return 'head-miss';
  if (!bp.some(p=>p[0]===a[0]&&p[1]===a[1])) return 'second-miss';
  return 'third-miss';
}
function addedCandidates(pool, maxAdd) {
  const base=pool.slice(0,7);
  const prefixes=new Set(base.map(x=>prefix(x.ticket)).filter(Boolean));
  return pool.slice(7,12).filter(x=>prefixes.has(prefix(x.ticket))).slice(0,maxAdd);
}
function evaluate(records,maxAdd) {
  const out=empty(`prefix-third-top${maxAdd}`);
  for (const r of records) {
    const actual=input.actualTicket(r.__officialResult); if(!actual) continue;
    const pool=expansion.collectTicketPool(r); if(!pool.length) continue;
    const base=pool.slice(0,7); if(!base.length) continue;
    const added=addedCandidates(pool,maxAdd);
    const baseHit=base.some(x=>x.ticket===actual);
    const hitAdded=added.some(x=>x.ticket===actual);
    const payout=expansion.payoutOf(r.__officialResult);
    out.raceCount++; out.addedTickets+=added.length; out.investmentYen+=added.length*STAKE;
    if(baseHit) out.baselineHitCount++;
    if(baseHit||hitAdded) out.totalHitCount++;
    if(!baseHit&&hitAdded){
      out.rescueCount++; if(payout>=10000) out.manboatRescueCount++; out.returnYen+=payout;
      if(classifyMiss(actual,base)==='third-miss') out.thirdMissRescueCount++;
    }
  }
  out.profitYen=out.returnYen-out.investmentYen;
  out.roiPercent=pct(out.returnYen,out.investmentYen);
  out.totalHitRatePercent=pct(out.totalHitCount,out.raceCount);
  return out;
}
function build(){
  const cohort=input.buildDefaultCohort({root:ROOT});
  const modes={top1:evaluate(cohort.records,1),top2:evaluate(cohort.records,2)};
  return {schemaVersion:1,analysisId:'third-place-prefix-rescue-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,purpose:'Test a pre-race, outcome-blind third-place extension: keep the existing first seven tickets, then add only ranks 8-12 whose first-two prefix already appears in the first seven.',methodology:{baseline:'first 7 saved pre-race candidates in existing order',candidateWindow:'ranks 8-12 only',eligibility:'candidate shares exact 1st-2nd prefix with any baseline ticket',modes:['top eligible 1','top eligible 2'],ordering:'existing saved pre-race order unchanged',stake:`${STAKE} yen flat per added ticket`,warning:'Retrospective research only; no production adoption.'},diagnostics:cohort.diagnostics,modes};
}
if(require.main===module) process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,evaluate,addedCandidates,classifyMiss};
