'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const ROOT=path.resolve(__dirname,'..');
function parts(t){return String(t||'').split('-').map(Number)}
function head(t){const p=parts(t);return p.length===3?p[0]:null}
function prefix(t){const p=parts(t);return p.length===3?`${p[0]}-${p[1]}`:''}
function boatSetKey(t){const p=parts(t);return p.length===3?p.slice().sort((a,b)=>a-b).join('-'):''}
function pct(a,b){return b?Number((100*a/b).toFixed(1)):0}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const out={schemaVersion:1,auditId:'miss-outside24-decomposition-v1',productionChanged:false,automaticApplication:false,usableForPrediction:false,settledRaceCount:0,baseline7MissCount:0,outside24MissCount:0,categories:{headAbsent:0,prefixAbsent:0,thirdPlacementAbsent:0},sameThreeBoatsDifferentOrder:0,actualHeadPresentAny24:0,actualPrefixPresentAny24:0,examples:{headAbsent:[],prefixAbsent:[],thirdPlacementAbsent:[]}};
const ex=(k,r,actual)=>{if(out.examples[k].length<10)out.examples[k].push({raceKey:r.__analysisRaceKey||input.raceKey(r)||'unknown',actual})};
for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;out.settledRaceCount++;const pool=exp.collectTicketPool(r).slice(0,24);const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;out.baseline7MissCount++;if(pool.some(x=>x.ticket===actual))continue;out.outside24MissCount++;const heads=new Set(pool.map(x=>head(x.ticket)).filter(Boolean));const prefixes=new Set(pool.map(x=>prefix(x.ticket)).filter(Boolean));const ah=head(actual),ap=prefix(actual);if(heads.has(ah))out.actualHeadPresentAny24++;if(prefixes.has(ap))out.actualPrefixPresentAny24++;if(pool.some(x=>boatSetKey(x.ticket)===boatSetKey(actual)))out.sameThreeBoatsDifferentOrder++;
if(!heads.has(ah)){out.categories.headAbsent++;ex('headAbsent',r,actual)}else if(!prefixes.has(ap)){out.categories.prefixAbsent++;ex('prefixAbsent',r,actual)}else{out.categories.thirdPlacementAbsent++;ex('thirdPlacementAbsent',r,actual)}}
out.categoryRates={headAbsentPercent:pct(out.categories.headAbsent,out.outside24MissCount),prefixAbsentPercent:pct(out.categories.prefixAbsent,out.outside24MissCount),thirdPlacementAbsentPercent:pct(out.categories.thirdPlacementAbsent,out.outside24MissCount),sameThreeBoatsDifferentOrderPercent:pct(out.sameThreeBoatsDifferentOrder,out.outside24MissCount)};out.invariants={exclusiveCategorySum:out.categories.headAbsent+out.categories.prefixAbsent+out.categories.thirdPlacementAbsent};out.policy='Retrospective diagnosis only. Categories are exclusive and describe where the correct trifecta first disappears from the saved pre-result top-24 candidate structure; no production rule is changed.';return out;}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
