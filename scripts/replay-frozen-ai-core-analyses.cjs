'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
global.window=global; global.document={};
require(path.join('..','js','ai-core.js'));
const core=global.ChappyAICore;
const HOLDOUT_START='20260819';
function dateOf(r){return String(r.__analysisRaceKey||input.raceKey(r)||'').slice(0,8)}
function hasExhibition(snapshot){return Array.isArray(snapshot?.entries)&&snapshot.entries.length===6&&snapshot.entries.every(b=>Number.isFinite(Number(b?.exhibition??b?.exhibitionTime??b?.tenjiTime)));}
function replay(record){const snapshot=input.referenceTagInput(record,{strictFrozenInputs:true}); if(!hasExhibition(snapshot))return{ok:false,reason:'exhibition-missing'}; try{const analyses=core.buildBoatAnalyses(snapshot); if(!Array.isArray(analyses)||analyses.length!==6)return{ok:false,reason:'analyses-not-six'}; const attackComplete=analyses.every(a=>Number.isFinite(Number(a?.roleScores?.attack))); return{ok:attackComplete,reason:attackComplete?'ok':'role-attack-missing',analyses};}catch(error){return{ok:false,reason:'ai-core-error',error:error.message};}}
function build(){const cohort=input.buildDefaultCohort();const records=cohort.records.filter(r=>dateOf(r)>=HOLDOUT_START);const counts={eligible:records.length,exhibitionReady:0,replayed:0,roleAttackReady:0};const reasons={};let sample=null;for(const record of records){const snapshot=input.referenceTagInput(record,{strictFrozenInputs:true});if(hasExhibition(snapshot))counts.exhibitionReady++;const result=replay(record);if(Array.isArray(result.analyses)&&result.analyses.length===6)counts.replayed++;if(result.ok){counts.roleAttackReady++;if(!sample)sample=result.analyses.map(a=>({boatNo:a.boatNo,st:a?.indexes?.st,exhibition:a?.indexes?.exhibition,attack:a?.roleScores?.attack,total:a?.indexes?.total}));}else reasons[result.reason]=(reasons[result.reason]||0)+1;}return{schemaVersion:1,analysisId:'frozen-ai-core-replay-v1',holdoutStart:HOLDOUT_START,coreVersion:core.version,counts,reasons,sample,productionChanged:false};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={replay,build};
