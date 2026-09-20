'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const p9=require('./phase9-live-improvement-cycle.cjs');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function activeRaceKeys(){
 const p='data/stats/improvement-review.json';if(!fs.existsSync(path.join(ROOT,p)))return new Set();
 const review=read(p), key=String(review.activeGenerationKey||'');
 const records=p9.load(), out=new Set();
 for(const r of records){
  const ev=r?.prediction?.verificationEvidence||r?.prediction?.practicalSelection?.verificationEvidence||{};
  const gen=ev?.generation||{};
  const predKey=JSON.stringify([String(gen.logicFingerprint||''),String(gen.confidenceDefinitionVersion||''),String(gen.ticketPolicyVersion||'')]);
  const cohort=String(r?.shadowV2?.cohortKey||r?.shadowV2Reference?.cohortKey||'');
  const theory=String(ev.theorySetFingerprint||'');
  const threshold=Number(r?.selection?.threshold);
  const combined=Number.isFinite(threshold)?JSON.stringify([predKey,cohort,theory,String(threshold)]):'';
  if(combined===key)out.add(String(r.raceKey||r.recordKey||''));
 }
 return out;
}
function build(){
 const review=read('data/stats/improvement-review.json'), keys=activeRaceKeys(), all=p9.load();
 const scoped=all.filter(r=>keys.has(String(r.raceKey||r.recordKey||'')));
 const x=p9.build(scoped,{phase8Report:{phaseComplete:true}});
 const counts={};for(const r of x.rows)counts[r.missReason]=(counts[r.missReason]||0)+1;
 return{schemaVersion:1,analysisId:'active-100r-early-monitor-v1',generatedAt:new Date().toISOString(),productionChanged:false,reviewProgress:review.progress,activeGenerationKey:review.activeGenerationKey,matchedRows:x.summary.matchedRows,hits:x.summary.hits,misses:x.summary.misses,duplicates:x.summary.duplicates,missReasonCounts:counts,patterns:x.patterns.map(p=>({key:p.key,count:p.count,status:p.status})),eligibleCandidates:x.summary.eligibleCandidates,automaticProductionChange:false};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
