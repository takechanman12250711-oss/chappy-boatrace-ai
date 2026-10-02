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
function cohortSummary(cohort){
 if(!cohort)return null;
 return{method:cohort.method,captured:cohort.captured,settled:cohort.settled,pending:cohort.pending,
  hits:cohort.practical?.hits??0,hitRate:cohort.practical?.hitRate??null,
  recoveryRate:cohort.practical?.recoveryRate??null};
}
function progressVisibility(formal,allRaces){
 const cohorts=Array.isArray(allRaces?.cohorts)?allRaces.cohorts:[];
 const active=cohorts.find(cohort=>cohort.active===true)||null;
 const latestSettled=cohorts.filter(cohort=>cohort.settled>0)
  .sort((a,b)=>Date.parse(b.latestPredictionAt||0)-Date.parse(a.latestPredictionAt||0))[0]||null;
 return{contract:'formal 100R and all-race review have different eligibility; do not add their counts',
  formalInput:{generatedAt:formal.generatedAt,records:formal.source?.recordCount??0,
   eligible:formal.source?.eligibleCount??0,excluded:{...(formal.source?.excluded||{})}},
  allRaceReview:{generatedAt:allRaces?.generatedAt??null,activeCohort:cohortSummary(active),
   latestSettledCohort:cohortSummary(latestSettled)}};
}
function build(){
 const allRacePath='data/stats/race-review-progress.json';
 const allRaces=fs.existsSync(path.join(ROOT,allRacePath))?read(allRacePath):null;
 const review=read('data/stats/improvement-review.json'),scoped=formalActiveRecords(),settled=p9.attachOfficialResults(scoped);
 const x=p9.build(settled,{phase8Report:{phaseComplete:true}});
 const counts={};for(const r of x.rows)counts[r.missReason]=(counts[r.missReason]||0)+1;
 return{schemaVersion:1,analysisId:'active-100r-early-monitor-v4',generatedAt:new Date().toISOString(),productionChanged:false,reviewProgress:review.progress,activeGenerationKey:review.activeGenerationKey,scopedRaceCount:scoped.length,matchedRows:x.summary.matchedRows,hits:x.summary.hits,misses:x.summary.misses,duplicates:x.summary.duplicates,missReasonCounts:counts,patterns:x.patterns.map(p=>({key:p.key,count:p.count,status:p.status})),eligibleCandidates:x.summary.eligibleCandidates,progressVisibility:progressVisibility(review,allRaces),automaticProductionChange:false};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,formalActiveRecords,progressVisibility};