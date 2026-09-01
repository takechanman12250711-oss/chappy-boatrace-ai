'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const LIMIT = 18;

function parts(ticket) { return String(ticket || '').split('-').map(Number); }
function pct(n,d) { return d ? Number((100*n/d).toFixed(1)) : 0; }
function headCounts(pool) { const m=new Map(); for(const item of pool){const h=parts(item.ticket)[0]; if(h)m.set(h,(m.get(h)||0)+1);} return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]); }
function structure(pool, cap) {
  const selected=pool.slice(0,cap);
  const heads=headCounts(selected);
  const primary=heads[0]?.[0] || 0;
  const secondary=heads[1]?.[0] || 0;
  const tertiary=heads[2]?.[0] || 0;
  const groups={ main:[], counter:[], hole:[] };
  for(const item of selected){const h=parts(item.ticket)[0]; if(h===primary)groups.main.push(item); else if(h===secondary)groups.counter.push(item); else groups.hole.push(item);}
  return { selected, primary, secondary, tertiary, groups };
}
function evaluate(records, cap) {
  const payouts=payoutAudit.payoutMap();
  const out={raceCount:0,hitCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0,hitRatePercent:0,avgTickets:0,mainHits:0,counterHits:0,holeHits:0,multiHeadRaceCount:0,threeHeadRaceCount:0};
  let tickets=0;
  for(const record of records){const actual=input.actualTicket(record.__officialResult); if(!actual)continue; const pool=expansion.collectTicketPool(record).slice(0,LIMIT); if(!pool.length)continue; const s=structure(pool,cap); out.raceCount++; tickets+=s.selected.length; out.investmentYen+=s.selected.length*STAKE; const heads=new Set(s.selected.map(x=>parts(x.ticket)[0])); if(heads.size>=2)out.multiHeadRaceCount++; if(heads.size>=3)out.threeHeadRaceCount++; const hit=s.selected.find(x=>x.ticket===actual); if(hit){out.hitCount++; const payout=payouts.get(record.__analysisRaceKey||input.raceKey(record))||0; out.returnYen+=payout; const h=parts(hit.ticket)[0]; if(h===s.primary)out.mainHits++; else if(h===s.secondary)out.counterHits++; else out.holeHits++;}}
  out.profitYen=out.returnYen-out.investmentYen; out.roiPercent=pct(out.returnYen,out.investmentYen); out.hitRatePercent=pct(out.hitCount,out.raceCount); out.avgTickets=out.raceCount?Number((tickets/out.raceCount).toFixed(2)):0; return out;
}
function build(){const cohort=input.buildDefaultCohort({root:ROOT}); const caps=[7,9,12,18]; const metrics=Object.fromEntries(caps.map(cap=>[String(cap),evaluate(cohort.records,cap)])); return {schemaVersion:1,analysisId:'formation-structure-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,purpose:'Quantify saved pre-race candidates as main/counter/hole head formations at 7, 9, 12, and 18 ticket caps without changing candidate order.',methodology:{main:'most represented head boat inside selected saved candidates',counter:'second most represented head boat',hole:'all remaining head boats',candidateOrder:'unchanged saved pre-race order',stake:`${STAKE} yen flat per selected ticket`,resultAndPayoutUse:'evaluation only',warning:'Descriptive retrospective structure audit only; it does not redefine prediction logic.'},diagnostics:cohort.diagnostics,metrics};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,structure,evaluate};
