'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const exp=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const ROOT=path.resolve(__dirname,'..');
function parts(t){return String(t||'').split('-').map(Number)}
function metric(){return {races:0,promotedBoats:0,caught:0}}
function pct(n,d){return d?Number((100*n/d).toFixed(1)):0}
function build(){const cohort=input.buildDefaultCohort({root:ROOT});const rules={score90:metric(),score85:metric(),score80:metric(),top1:metric(),top2:metric()};let target=0;for(const r of cohort.records){const actual=input.actualTicket(r.__officialResult);if(!actual)continue;const pool=exp.collectTicketPool(r).slice(0,24);if(pool.length<7||pool.some(x=>x.ticket===actual))continue;const a=parts(actual);if(a.length!==3)continue;const heads=new Set(pool.map(x=>parts(x.ticket)[0]));if(heads.has(a[0]))continue;target++;const byBoat=new Map();for(const x of pool){const p=parts(x.ticket);if(p.length!==3)continue;for(const pos of [1,2]){const boat=p[pos];const score=Number(x.score);if(!Number.isFinite(score))continue;const cur=byBoat.get(boat);if(!cur||score>cur.score)byBoat.set(boat,{boat,score});}}
const ranked=[...byBoat.values()].sort((x,y)=>y.score-x.score||x.boat-y.boat);const apply=(name,arr)=>{const m=rules[name];m.races++;m.promotedBoats+=arr.length;if(arr.some(x=>x.boat===a[0]))m.caught++;};apply('score90',ranked.filter(x=>x.score>=90));apply('score85',ranked.filter(x=>x.score>=85));apply('score80',ranked.filter(x=>x.score>=80));apply('top1',ranked.slice(0,1));apply('top2',ranked.slice(0,2));}
for(const m of Object.values(rules)){m.catchPercent=pct(m.caught,target);m.avgPromotedBoats=target?Number((m.promotedBoats/target).toFixed(2)):0;}
return {schemaVersion:1,auditId:'head-promotion-efficiency-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,targetHeadAbsentCount:target,rules,policy:'Retrospective coverage/expansion efficiency only. No ticket ROI or production adoption.'};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
