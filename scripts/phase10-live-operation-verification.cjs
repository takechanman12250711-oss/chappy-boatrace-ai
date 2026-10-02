'use strict';
const fs=require('node:fs');
const path=require('node:path');
const phase9=require('./phase9-live-improvement-cycle.cjs');
const ROOT=path.resolve(__dirname,'..');
function load(){return phase9.load();}
function build(records=load()){
 const p9=phase9.build(records);
 const counts={}; for(const r of p9.rows)counts[r.missReason]=(counts[r.missReason]||0)+1;
 const liveVerified=p9.summary.matchedRows>0;
 return{schemaVersion:1,analysisId:'phase10-live-operation-verification-v1',generatedAt:new Date().toISOString(),productionChanged:false,liveVerified,summary:{sourceRecords:records.length,matchedRows:p9.summary.matchedRows,hits:p9.summary.hits,misses:p9.summary.misses,duplicates:p9.summary.duplicates,patterns:p9.summary.patterns,eligibleCandidates:p9.summary.eligibleCandidates,missReasonCounts:counts},cycle:{predictionSaved:records.length>0,officialResultMatched:p9.summary.matchedRows>0,taxonomyApplied:p9.summary.matchedRows>0,patternAggregation:p9.summary.patterns>=0,phase8HandoffContract:p9.handoff?.target==='scripts/theory-validation-phase8-cycle.cjs',automaticProductionChange:p9.handoff?.automaticProductionChange===true},audit:{phase9Complete:p9.phaseComplete===true,matchedOnly:p9.audit.matchedOnly===true,duplicateRaceRecords:p9.audit.duplicateRaceRecords,ambiguousMissReasons:p9.audit.ambiguousMissReasons,productionPredictionChanged:false},phaseComplete:p9.phaseComplete===true&&p9.audit.duplicateRaceRecords===0&&p9.audit.ambiguousMissReasons===0&&p9.handoff?.automaticProductionChange===false};
}
if(require.main===module){const out=build();const a=process.argv.find(x=>x.startsWith('--output='));if(a){const d=path.resolve(ROOT,a.slice(9));fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={build,load};
