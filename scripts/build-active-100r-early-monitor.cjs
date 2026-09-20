'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const p9=require('./phase9-live-improvement-cycle.cjs');
const reviewEngine=require('../js/improvement-review.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function raceKeyOf(r){
 const direct=String(r?.raceKey||r?.recordKey||'');if(direct)return direct;
 const date=String(r?.date||'').replace(/\D/g,''),jcd=String(r?.jcd||'').padStart(2,'0'),raceNo=Number(r?.raceNo||0);
 return date.length===8&&/^\d{2}$/.test(jcd)&&raceNo>=1&&raceNo<=12?`${date}-${jcd}-${raceNo}`:'';
}
function activeRaceKeys(){
 const p='data/stats/improvement-review.json';if(!fs.existsSync(path.join(ROOT,p)))return new Set();
 const review=read(p), key=String(review.activeGenerationKey||'');
 const records=p9.load(), out=new Set();
 for(const r of records){
  const assessed=reviewEngine.assessReviewRecord?.(r);
  const sample=assessed?.eligible===true?assessed.sample:null;
  if(sample?.cohort==='selected'&&String(sample?.generationKey||'')===key){const rk=String(sample?.raceKey||raceKeyOf(r));if(rk)out.add(rk);}
 }
 return out;
}
function build(){
 const review=read('data/stats/improvement-review.json'), keys=activeRaceKeys(), all=p9.load();
 const scoped=all.filter(r=>keys.has(raceKeyOf(r)));
 const x=p9.build(scoped,{phase8Report:{phaseComplete:true}});
 const counts={};for(const r of x.rows)counts[r.missReason]=(counts[r.missReason]||0)+1;
 return{schemaVersion:1,analysisId:'active-100r-early-monitor-v2',generatedAt:new Date().toISOString(),productionChanged:false,reviewProgress:review.progress,activeGenerationKey:review.activeGenerationKey,scopedRaceCount:keys.size,matchedRows:x.summary.matchedRows,hits:x.summary.hits,misses:x.summary.misses,duplicates:x.summary.duplicates,missReasonCounts:counts,patterns:x.patterns.map(p=>({key:p.key,count:p.count,status:p.status})),eligibleCandidates:x.summary.eligibleCandidates,automaticProductionChange:false};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
