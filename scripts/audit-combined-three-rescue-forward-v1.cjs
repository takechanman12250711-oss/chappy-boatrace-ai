'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-02T08:30:25Z'); // #787 merged; all three rules frozen before this common forward window
const STAKE=100;
const GATES=[50,100,250];
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function goodThirdScore(s){return Number.isFinite(s)&&((s>=90)||(s>=80&&s<85))}
function goodHeadScore(s){return Number.isFinite(s)&&s>=90}
function timeOf(r){const vals=[r?.selectedAt,r?.capturedAt,r?.savedAt,r?.createdAt,r?.generatedAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.savedAt,r?.prediction?.createdAt];for(const v of vals){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return null}
function metric(){return {addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0,hitPayouts:[]}}
function addMetric(m,ticket,actual,payout){if(!ticket)return;m.addedTickets++;m.investmentYen+=STAKE;if(ticket===actual){m.rescueCount++;m.returnYen+=payout;m.hitPayouts.push(payout);if(payout>=10000)m.manboatRescueCount++;}}
function finish(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);m.hitPayouts.sort((a,b)=>b-a);return m}
function selectThird(pool,base){const c=pool[7];if(!c)return null;const prefixes=new Set(base.map(x=>prefix(x.ticket)));return prefixes.has(prefix(c.ticket))&&goodThirdScore(c.score)?c.ticket:null}
function selectSecond(pool,base){const c=pool[8];if(!c)return null;const heads=new Set(base.map(x=>head(x.ticket)));const prefixes=new Set(base.map(x=>prefix(x.ticket)));return heads.has(head(c.ticket))&&!prefixes.has(prefix(c.ticket))?c.ticket:null}
function selectHead(pool,base){const c=pool[10];if(!c)return null;const heads=new Set(base.map(x=>head(x.ticket)));return !heads.has(head(c.ticket))&&goodHeadScore(c.score)?c.ticket:null}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const byRule={third:metric(),second:metric(),head:metric()};const combined=metric();let settled=0,baselineHits=0,augmentedHits=0,rescuedRaces=0;
for(const r of cohort.records){const t=timeOf(r);if(t===null||t<ACTIVATED_AT)continue;const actual=input.actualTicket(r.__officialResult);if(!actual)continue;settled++;const pool=exp.collectTicketPool(r);if(pool.length<11)continue;const base=pool.slice(0,7);const baselineHit=base.some(x=>x.ticket===actual);if(baselineHit)baselineHits++;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;const picks={third:selectThird(pool,base),second:selectSecond(pool,base),head:selectHead(pool,base)};for(const [k,ticket] of Object.entries(picks))addMetric(byRule[k],ticket,actual,payout);const unique=[...new Set(Object.values(picks).filter(Boolean).filter(t=>!base.some(x=>x.ticket===t)))];for(const ticket of unique)addMetric(combined,ticket,actual,payout);const rescued=!baselineHit&&unique.includes(actual);if(rescued)rescuedRaces++;if(baselineHit||rescued)augmentedHits++;}
for(const m of Object.values(byRule))finish(m);finish(combined);return {schemaVersion:1,auditId:'combined-three-rescue-forward-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),frozenRules:{third:{rank:8,prefixMustExistInBaseline7:true,scoreBands:['80-84.99','90+']},second:{rank:9,headMustExistInBaseline7:true,prefixMustBeNew:true},head:{rank:11,headMustBeNew:true,minScore:90},stakeYen:STAKE},productionChanged:false,automaticApplication:false,usableForPrediction:false,settledRaceCountAfterActivation:settled,baseline:{hitCount:baselineHits,hitRatePercent:pct(baselineHits,settled)},byRule,combined:{...combined,rescuedRaceCount:rescuedRaces,augmentedHitCount:augmentedHits,augmentedHitRatePercent:pct(augmentedHits,settled),hitRateLiftPoint:Number((pct(augmentedHits,settled)-pct(baselineHits,settled)).toFixed(1))},gates:GATES.map(n=>({n,reached:settled>=n,status:settled>=n?'ready_for_review':'collecting'})),policy:'Preregistered common-window forward shadow. All three additions are selected from pre-result candidate fields only; no result-conditioned ticket selection, no production adoption before fixed-gate review.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
