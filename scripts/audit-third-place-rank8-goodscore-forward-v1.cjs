'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-02T03:11:00Z'); // #778 merged; criteria frozen before forward data
const STAKE=100;
const GATES=[50,100,250];
function parts(t){return String(t||'').split('-').map(Number)}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function goodScore(s){return Number.isFinite(s)&&((s>=90)||(s>=80&&s<85))}
function timeOf(r){const vals=[r?.selectedAt,r?.capturedAt,r?.savedAt,r?.createdAt,r?.generatedAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.savedAt,r?.prediction?.createdAt];for(const v of vals){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return null}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();let settledAfterActivation=0,eligible=0,added=0,rescues=0,manboat=0,ret=0;const payoutList=[];
for(const r of cohort.records){const t=timeOf(r);if(t===null||t<ACTIVATED_AT)continue;const actual=input.actualTicket(r.__officialResult);if(!actual)continue;settledAfterActivation++;const pool=exp.collectTicketPool(r);if(pool.length<8)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const prefixes=new Set(base.map(x=>prefix(x.ticket)));const c=pool[7];if(!prefixes.has(prefix(c.ticket))||!goodScore(c.score))continue;eligible++;added++;const hit=c.ticket===actual;if(hit){rescues++;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;ret+=payout;payoutList.push(payout);if(payout>=10000)manboat++;}}
const investment=added*STAKE;const profit=ret-investment;return {schemaVersion:1,auditId:'third-place-rank8-goodscore-forward-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),frozenRule:{rank:8,prefixMustExistInBaseline7:true,scoreBands:['80-84.99','90+'],stakeYen:STAKE},productionChanged:false,automaticApplication:false,usableForPrediction:false,settledRaceCountAfterActivation:settledAfterActivation,eligibleAddedTickets:eligible,rescueCount:rescues,manboatRescueCount:manboat,investmentYen:investment,returnYen:ret,profitYen:profit,roiPercent:pct(ret,investment),hitPayouts:payoutList.sort((a,b)=>b-a),gates:GATES.map(n=>({n,reached:settledAfterActivation>=n,status:settledAfterActivation>=n?'ready_for_review':'collecting'})),policy:'Preregistered forward shadow only. No production adoption before fixed-gate review.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
