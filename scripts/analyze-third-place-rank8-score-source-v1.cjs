'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..'); const STAKE=100;
function parts(t){return String(t||'').split('-').map(Number)} function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function metric(){return {addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0}}
function add(m,payout,hit){m.addedTickets++;m.investmentYen+=STAKE;if(hit){m.rescueCount++;m.returnYen+=payout;if(payout>=10000)m.manboatRescueCount++}}
function finish(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);return m}
function scoreBucket(s){if(!Number.isFinite(s))return 'missing'; if(s>=90)return '90+'; if(s>=85)return '85-89.99'; if(s>=80)return '80-84.99'; if(s>=70)return '70-79.99'; if(s>=0)return '0-69.99'; return 'fallback-negative'}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const byScore={},bySource={};let eligible=0;
for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(r);if(pool.length<8)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const prefixes=new Set(base.map(x=>prefix(x.ticket)));const c=pool[7];if(!prefixes.has(prefix(c.ticket)))continue;eligible++;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;const hit=c.ticket===actual;const sb=scoreBucket(c.score);if(!byScore[sb])byScore[sb]=metric();if(!bySource[c.source])bySource[c.source]=metric();add(byScore[sb],payout,hit);add(bySource[c.source],payout,hit)}
for(const m of Object.values(byScore))finish(m);for(const m of Object.values(bySource))finish(m);
return {schemaVersion:1,analysisId:'third-place-rank8-score-source-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleRank8ThirdPlaceCandidates:eligible,byScore,bySource,policy:'Research only; do not adopt score/source filters from retrospective results without preregistered forward validation.'}}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
