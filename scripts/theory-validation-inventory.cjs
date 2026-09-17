'use strict';
const path=require('node:path');
global.window=global;global.document={};
require(path.join('..','js','ai-core.js'));
const core=global.ChappyAICore;
const THEORY_BUILDERS=Object.freeze({
  flow:'buildFlowTheory',course:'buildCourseStructureEvaluation',stSlit:'buildStFoundationEvaluation',exhibition:'buildExhibitionPerformanceEvaluation',holdPickup:'buildHoldPickupTheory',local:'buildLocalTheory',waterWeather:'buildWaterWeatherTheory',racerSkill:'buildRacerSkillTheory',motorMaintenance:'buildMotorMaintenanceTheory',wall:'buildWallTheory',attack:'buildAttackTheory',raceTrend:'buildRaceTrendEvaluation',newEnvironment:'buildNewEnvironmentTheory'
});
function statusFor(theoryId){return theoryId==='attack'?'EXECUTABLE_HOLDOUT':'CONNECTED_BLOCKED_CANDIDATE_MUTATOR';}
function build(){const rows=Object.entries(THEORY_BUILDERS).map(([theoryId,fn])=>({theoryId,builder:fn,available:typeof core?.[fn]==='function',validationStatus:statusFor(theoryId),blockerCode:theoryId==='attack'?null:'NO_CANDIDATE_MUTATOR'}));return{schemaVersion:2,analysisId:'theory-validation-inventory-v2-phase3',coreVersion:core?.version||null,productionChanged:false,summary:{theories:rows.length,buildersAvailable:rows.filter(x=>x.available).length,connected:rows.length,executable:rows.filter(x=>x.validationStatus==='EXECUTABLE_HOLDOUT').length,blockedCandidateMutator:rows.filter(x=>x.validationStatus==='CONNECTED_BLOCKED_CANDIDATE_MUTATOR').length,pending:0},rows};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={THEORY_BUILDERS,statusFor,build};
