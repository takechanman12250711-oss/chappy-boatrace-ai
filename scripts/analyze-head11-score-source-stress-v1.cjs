'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..'); const STAKE=100;
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function metric(){return {addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0,hitPayouts:[]}}
function scoreBucket(s){if(!Number.isFinite(s))return 'missing';if(s>=90)return '90+';if(s>=85)return '85-89.99';if(s>=80)return '80-84.99';if(s>=70)return '70-79.99';if(s>=0)return '0-69.99';return 'fallback-negative'}
function add(m,payout,hit){m.addedTickets++;m.investmentYen+=STAKE;if(hit){m.rescueCount++;m.returnYen+=payout;m.hitPayouts.push(payout);if(payout>=10000)m.manboatRescueCount++}}
function finish(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);const p=[...m.hitPayouts].sort((a,b)=>b-a);m.topHitPayouts=p.slice(0,5);for(const n of [1,2]){const ret=Math.max(0,m.returnYen-p.slice(0,n).reduce((a,b)=>a+b,0));m[`removeTop${n}`]={returnYen:ret,profitYen:ret-m.investmentYen,roiPercent:pct(ret,m.investmentYen)}}delete m.hitPayouts;return m}
function ensure(obj,key){if(!obj[key])obj[key]=metric();return obj[key]}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const byScore={},bySource={},byScoreSource={};let eligible=0;
for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(r);if(pool.length<11)continue;const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;const actualHead=head(actual);if(actualHead===null)continue;const baseHeads=new Set(base.map(x=>head(x.ticket)));if(baseHeads.has(actualHead))continue;const c=pool[10];if(!c)continue;const cHead=head(c.ticket);if(cHead===null||baseHeads.has(cHead))continue;eligible++;const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;const hit=c.ticket===actual;const sb=scoreBucket(c.score),src=String(c.source||'missing'),combo=`${sb}__${src}`;add(ensure(byScore,sb),payout,hit);add(ensure(bySource,src),payout,hit);add(ensure(byScoreSource,combo),payout,hit)}
for(const group of [byScore,bySource,byScoreSource])for(const m of Object.values(group))finish(m);
return {schemaVersion:1,analysisId:'head11-score-source-stress-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleRank11HeadCandidates:eligible,byScore,bySource,byScoreSource,policy:'Retrospective research only. Rank 11 only; baseline seven unchanged. Uses only candidate score/source fields already stored before result. Do not adopt filters without preregistered forward validation.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
