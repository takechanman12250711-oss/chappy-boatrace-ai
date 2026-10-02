'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payout = require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;

function pct(a, b) { return b ? Number((100 * a / b).toFixed(1)) : 0; }
function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }

function pool(record) { return base.collectTicketPool(record).slice(0, 24); }
function baseline(record) { return pool(record).slice(0, 7); }

function eligibleNewHeads(record) {
  const p = pool(record);
  const b = p.slice(0, 7);
  const heads = new Set(b.map(x => x.head));
  return p.slice(7).map((x, i) => ({ ...x, poolRank: i + 8 }))
    .filter(x => !heads.has(x.head) && [1,2,3].includes(x.head) && n(x.score) >= 85);
}

function signal(record) {
  const p = pool(record);
  const b = p.slice(0, 7);
  const extras = eligibleNewHeads(record);
  const distinctBaseHeads = new Set(b.map(x => x.head)).size;
  const distinctExtraHeads = new Set(extras.map(x => x.head)).size;
  const topExtraScore = extras.length ? Math.max(...extras.map(x => n(x.score))) : 0;
  const score7 = n(b[6]?.score, -Infinity);
  const score8 = n(p[7]?.score, -Infinity);
  const boundaryGap = Number.isFinite(score7) && Number.isFinite(score8) ? Number((score7 - score8).toFixed(2)) : null;
  return { extras, distinctBaseHeads, distinctExtraHeads, topExtraScore, boundaryGap };
}

function select(record, rule) {
  const b = baseline(record);
  const seen = new Set(b.map(x => x.ticket));
  const s = signal(record);
  let limit = 7;
  if (rule === 'fixed12') limit = 12;
  if (rule === 'dynamic-7-10-12') {
    if (s.extras.length === 0) limit = 7;
    else if (s.distinctExtraHeads === 1 && s.extras.length <= 2) limit = 10;
    else limit = 12;
  }
  if (rule === 'dynamic-score-7-9-12') {
    if (s.extras.length === 0) limit = 7;
    else if (s.topExtraScore >= 95 || s.distinctExtraHeads >= 2) limit = 12;
    else limit = 9;
  }
  if (rule === 'dynamic-boundary-7-10-12') {
    if (s.extras.length === 0) limit = 7;
    else if (s.boundaryGap !== null && s.boundaryGap >= 8) limit = 7;
    else if (s.distinctExtraHeads >= 2 || s.extras.length >= 3) limit = 12;
    else limit = 10;
  }
  const out = [...b];
  const extras = [...s.extras].sort((a,b) => n(b.score)-n(a.score) || a.poolRank-b.poolRank || a.ticket.localeCompare(b.ticket));
  for (const x of extras) {
    if (out.length >= limit) break;
    if (!seen.has(x.ticket)) { out.push(x); seen.add(x.ticket); }
  }
  return { selected: out, limit, signal: s };
}

function metric(rows, rule, payouts) {
  let hits=0, tickets=0, ret=0, rescued=0;
  const limitCounts={};
  for (const r of rows) {
    const actual=input.actualTicket(r.__officialResult); if(!actual) continue;
    const b=baseline(r); const bset=new Set(b.map(x=>x.ticket));
    const {selected,limit}=select(r,rule); tickets += selected.length; limitCounts[limit]=(limitCounts[limit]||0)+1;
    if(selected.some(x=>x.ticket===actual)) { hits++; ret += payouts.get(r.__analysisRaceKey || input.raceKey(r)) || 0; if(!bset.has(actual)) rescued++; }
  }
  const races=rows.length, invest=tickets*STAKE;
  return { raceCount:races, hitCount:hits, hitRatePercent:pct(hits,races), rescuedVs7:rescued, averageTicketCount:races?Number((tickets/races).toFixed(2)):0, investmentYen:invest, returnYen:ret, profitYen:ret-invest, roiPercent:pct(ret,invest), limitCounts };
}

function build() {
  const cohort=input.buildDefaultCohort({root:ROOT});
  const payouts=payout.payoutMap();
  const rules=['baseline7','fixed12','dynamic-7-10-12','dynamic-score-7-9-12','dynamic-boundary-7-10-12'];
  const results={};
  for(const rule of rules) {
    if(rule==='baseline7') {
      let hits=0,tickets=0,ret=0; for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult); if(!actual) continue; const sel=baseline(r); tickets+=sel.length; if(sel.some(x=>x.ticket===actual)){hits++; ret+=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;}}
      const inv=tickets*STAKE; results[rule]={raceCount:cohort.records.length,hitCount:hits,hitRatePercent:pct(hits,cohort.records.length),rescuedVs7:0,averageTicketCount:cohort.records.length?Number((tickets/cohort.records.length).toFixed(2)):0,investmentYen:inv,returnYen:ret,profitYen:ret-inv,roiPercent:pct(ret,inv),limitCounts:{7:cohort.records.length}};
    } else results[rule]=metric(cohort.records,rule,payouts);
  }
  const b=results.baseline7;
  for(const [k,v] of Object.entries(results)) if(k!=='baseline7') v.deltaVs7={hitRatePoints:Number((v.hitRatePercent-b.hitRatePercent).toFixed(1)),roiPoints:Number((v.roiPercent-b.roiPercent).toFixed(1)),profitYen:v.profitYen-b.profitYen,averageTicketCount:Number((v.averageTicketCount-b.averageTicketCount).toFixed(2))};
  return {schemaVersion:1,analysisId:'variable-formation-v1',generatedAt:new Date().toISOString(),productionChanged:false,usableForPrediction:false,purpose:'Compare fixed 7/12 with pre-race-only variable ticket limits using restored 1-3 head scenarios.',methodology:{cohort:'official pre-deadline predictions joined to settled results',selection:'saved pre-race ticket pool only; restored heads limited to 1/2/3 with score >=85',evaluation:'official result and payout only',stakeYen:STAKE,warning:'Retrospective hypothesis generation only; no production adoption without forward validation.'},diagnostics:cohort.diagnostics,results};
}

if(require.main===module) process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,select,signal};
