'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix=require('./analyze-ticket-expansion-payout-v2.cjs');
const ROOT=path.resolve(__dirname,'..');
function parts(t){return String(t||'').split('-').map(Number)}
function pct(n,d){return d?Number((100*n/d).toFixed(1)):0}
function stat(){return {tickets:0,hits:0,investmentYen:0,returnYen:0,payoutHits:[]}}
function finalize(s){s.profitYen=s.returnYen-s.investmentYen;s.roiPercent=s.investmentYen?Number((100*s.returnYen/s.investmentYen).toFixed(1)):0;const ps=[...s.payoutHits].sort((a,b)=>b-a);for(const n of [1,2]){const ret=Math.max(0,s.returnYen-ps.slice(0,n).reduce((a,b)=>a+b,0));s[`max${n}Removed`]={returnYen:ret,profitYen:ret-s.investmentYen,roiPercent:s.investmentYen?Number((100*ret/s.investmentYen).toFixed(1)):0};}delete s.payoutHits;return s}
function bestByPos(pool,pos,exclude){const m=new Map();for(const x of pool){const p=parts(x.ticket);if(p.length!==3)continue;const boat=p[pos];if(exclude.has(boat))continue;const score=Number(x.score);if(!Number.isFinite(score))continue;const cur=m.get(boat);if(!cur||score>cur.score)m.set(boat,{boat,score});}return [...m.values()].sort((a,b)=>b.score-a.score||a.boat-b.boat)}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const payouts=payoutFix.payoutMap();const configs=[
{name:'any90_s1_t1',lanes:null,minHead:90,sN:1,tN:1},
{name:'lane34_90_s1_t1',lanes:new Set([3,4]),minHead:90,sN:1,tN:1},
{name:'lane34_85_s1_t1',lanes:new Set([3,4]),minHead:85,sN:1,tN:1},
{name:'lane34_90_s1_t2',lanes:new Set([3,4]),minHead:90,sN:1,tN:2},
{name:'lane34_90_s2_t1',lanes:new Set([3,4]),minHead:90,sN:2,tN:1}
];const out=Object.fromEntries(configs.map(c=>[c.name,stat()]));let eligibleRaces=0;for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;const key=r.__analysisRaceKey||input.raceKey(r);const payout=payouts.get(key);if(!Number.isFinite(payout))continue;const pool=exp.collectTicketPool(r).slice(0,24);if(pool.length<7)continue;const base=new Set(pool.slice(0,7).map(x=>x.ticket));if(base.has(actual))continue;eligibleRaces++;const headsPresent=new Set(pool.map(x=>parts(x.ticket)[0]));const under=new Map();for(const x of pool){const p=parts(x.ticket);if(p.length!==3)continue;for(const pos of [1,2]){const boat=p[pos];if(headsPresent.has(boat))continue;const score=Number(x.score);if(!Number.isFinite(score))continue;const cur=under.get(boat);if(!cur||score>cur.score)under.set(boat,{boat,score});}}
for(const c of configs){const generated=new Set();for(const h of [...under.values()].filter(x=>x.score>=c.minHead&&(!c.lanes||c.lanes.has(x.boat)))){const seconds=bestByPos(pool,1,new Set([h.boat])).slice(0,c.sN);for(const s of seconds){const thirds=bestByPos(pool,2,new Set([h.boat,s.boat])).slice(0,c.tN);for(const t of thirds)generated.add(`${h.boat}-${s.boat}-${t.boat}`);}}for(const ticket of generated){if(base.has(ticket))continue;const st=out[c.name];st.tickets++;st.investmentYen+=100;if(ticket===actual){st.hits++;st.returnYen+=payout;st.payoutHits.push(payout);}}}}
for(const s of Object.values(out))finalize(s);return {schemaVersion:1,auditId:'head-promotion-roi-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleRaces,configs:out,policy:'Retrospective ROI screen for pre-result head-promotion variants only. No production adoption.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
