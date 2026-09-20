'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const p9=require('./phase9-live-improvement-cycle.cjs');
const reviewEngine=require('../js/improvement-review.js');
const reviewBuilder=require('./build-improvement-review.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function formalActiveRecords(){
 const p='data/stats/improvement-review.json';if(!fs.existsSync(path.join(ROOT,p)))return[];
 const review=read(p),key=String(review.activeGenerationKey||'');
 const source=reviewBuilder.collectPredictionRecords(path.join(ROOT,'data','predictions')).records||[];
 const seen=new Set(),out=[];
 for(const r of source){const assessed=reviewEngine.assessReviewRecord?.(r),sample=assessed?.eligible===true?assessed.sample:null;if(sample?.cohort!=='selected'||String(sample?.generationKey||'')!==key)continue;const rk=String(sample?.raceKey||'');if(!rk||seen.has(rk))continue;seen.add(rk);out.push(r);}
 return out;
}
function build(){
 const review=read('data/stats/improvement-review.json'),scoped=formalActiveRecords(),settled=p9.attachOfficialResults(scoped);
 const x=p9.build(settled,{phase8Report:{phaseComplete:true}});
 const counts={};for(const r of x.rows)counts[r.missReason]=(counts[r.missReason]||0)+1;
 return{schemaVersion:1,analysisId:'active-100r-early-monitor-v4',generatedAt:new Date().toISOString(),productionChanged:false,reviewProgress:review.progress,activeGenerationKey:review.activeGenerationKey,scopedRaceCount:scoped.length,matchedRows:x.summary.matchedRows,hits:x.summary.hits,misses:x.summary.misses,duplicates:x.summary.duplicates,missReasonCounts:counts,patterns:x.patterns.map(p=>({key:p.key,count:p.count,status:p.status})),eligibleCandidates:x.summary.eligibleCandidates,automaticProductionChange:false};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,formalActiveRecords};