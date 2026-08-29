'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const suppression=require('./analyze-raceflow-attack-suppression.cjs');
const ROOT=path.resolve(__dirname,'..');
const PRED=path.join(ROOT,'data','predictions');
const FIXED={st:0,roleAttack:0.25,exhibition:0.5};
function matches(p){return p.attackSignal&&p.flowSuppressed&&p.st>=FIXED.st&&p.roleAttack>=FIXED.roleAttack&&p.exhibition>=FIXED.exhibition;}
function isTicketString(v){return typeof v==='string'&&/^[1-6]\s*[-=]\s*[1-6]\s*[-=]\s*[1-6]$/.test(v.trim())&&new Set(v.match(/[1-6]/g)).size===3;}
function walk(value,pathName='',out=[]){
 if(value==null)return out;
 if(isTicketString(value))out.push({path:pathName,type:'ticket-string',value:String(value)});
 if(Array.isArray(value)){
   const ticketStrings=value.filter(isTicketString);
   if(ticketStrings.length)out.push({path:pathName,type:'ticket-array',count:ticketStrings.length,sample:ticketStrings.slice(0,7)});
   value.forEach((v,i)=>walk(v,`${pathName}[${i}]`,out)); return out;
 }
 if(typeof value==='object')for(const [k,v] of Object.entries(value)){
   const p=pathName?`${pathName}.${k}`:k;
   if(/ticket|formation|bet|buy|purchase|pick|recommend|candidate|scenario|honmei|safety|main|osae|nagashi|man(?:shu|bune)/i.test(k)){
     const summary=Array.isArray(v)?{kind:'array',length:v.length}:v&&typeof v==='object'?{kind:'object',keys:Object.keys(v).slice(0,20)}:{kind:typeof v,value:v};
     out.push({path:p,type:'key-hit',summary});
   }
   walk(v,p,out);
 }
 return out;
}
function build(){
 const all=input.collectCanonicalPredictions(PRED);
 const byKey=new Map(all.map(r=>[input.raceKey(r),r]));
 const base=suppression.build();
 const targets=[...new Set(base.pairs.filter(matches).map(p=>p.raceKey))].sort();
 const rows=targets.map(raceKey=>{const r=byKey.get(raceKey);const hits=walk(r||{}).filter((x,i,a)=>a.findIndex(y=>y.path===x.path&&y.type===x.type)===i);return{raceKey,recordFound:!!r,topLevelKeys:r?Object.keys(r):[],hits};});
 const pathCounts={};for(const row of rows)for(const h of row.hits){const key=`${h.type}:${h.path.replace(/\[\d+\]/g,'[]')}`;pathCounts[key]=(pathCounts[key]||0)+1;}
 return{schemaVersion:1,analysisId:'outer-attack-ticket-source-audit-v2',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,fixedSignal:FIXED},targetRaceCount:targets.length,recordFoundCount:rows.filter(r=>r.recordFound).length,pathCounts:Object.fromEntries(Object.entries(pathCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),rows};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
