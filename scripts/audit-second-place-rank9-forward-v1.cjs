'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-02T05:49:02Z'); // #781 merged; rule frozen before forward evaluation
const STAKE=100;
const GATES=[50,100,250];
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function timeOf(r){const vals=[r?.selectedAt,r?.capturedAt,r?.savedAt,r?.createdAt,r?.generatedAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.savedAt,r?.prediction?.createdAt];for(const v of vals){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return null}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();let settled=0,eligibleMisses=0,eligibleAdded=0,rescues=0,manboat=0,ret=0;const hitPayouts=[];
for(const r of cohort.records){const t=timeOf(r);if(t===null||t<ACTIVATED_AT)continue;const actual=input.actualTicket(r.__officialResult);if(!actual)continue;settled++;const pool=exp.collectTicketPool(r);if(pool.length<9)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const actualParts=parts(actual);if(actualParts.length!==3)continue;const baseHeads=new Set(base.map(x=>head(x.ticket)));const basePrefixes=new Set(base.map(x=>prefix(x.ticket)));if(!baseHeads.has(actualParts[0]))continue;if(basePrefixes.has(`${actualParts[0]}-${actualParts[1]}`))continue;eligibleMisses++;const c=pool[8];if(!c)continue;if(!baseHeads.has(head(c.ticket)))continue;if(basePrefixes.has(prefix(c.ticket)))continue;eligibleAdded++;if(c.ticket===actual){rescues++;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;ret+=payout;hitPayouts.push(payout);if(payout>=10000)manboat++;}}
const investment=eligibleAdded*STAKE;return {schemaVersion:1,auditId:'second-place-rank9-forward-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),frozenRule:{rank:9,winningBoatMustExistInBaseline7:true,actualPrefixMustBeMissingFromBaseline7:true,candidateMustKeepBaselineWinningBoat:true,candidatePrefixMustBeNew:true,stakeYen:STAKE},productionChanged:false,automaticApplication:false,usableForPrediction:false,settledRaceCountAfterActivation:settled,eligibleSecondPlaceMisses:eligibleMisses,eligibleAddedTickets:eligibleAdded,rescueCount:rescues,manboatRescueCount:manboat,investmentYen:investment,returnYen:ret,profitYen:ret-investment,roiPercent:pct(ret,investment),hitPayouts:hitPayouts.sort((a,b)=>b-a),gates:GATES.map(n=>({n,reached:settled>=n,status:settled>=n?'ready_for_review':'collecting'})),policy:'Preregistered forward shadow only. Exact rank 9 second-place rescue rule frozen after #781; no production adoption before fixed-gate review.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};