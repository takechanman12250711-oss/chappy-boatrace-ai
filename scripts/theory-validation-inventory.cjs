'use strict';
const path=require('node:path');
global.window=global;global.document={};
require(path.join('..','js','ai-core.js'));
const core=global.ChappyAICore;
const THEORY_BUILDERS=Object.freeze({
  flow:'buildFlowTheory',course:'buildCourseStructureEvaluation',stSlit:'buildStFoundationEvaluation',exhibition:'buildExhibitionPerformanceEvaluation',holdPickup:'buildHoldPickupTheory',local:'buildLocalTheory',waterWeather:'buildWaterWeatherTheory',racerSkill:'buildRacerSkillTheory',motorMaintenance:'buildMotorMaintenanceTheory',wall:'buildWallTheory',attack:'buildAttackTheory',raceTrend:'buildRaceTrendEvaluation',newEnvironment:'buildNewEnvironmentTheory'
});
function build(){const rows=Object.entries(THEORY_BUILDERS).map(([theoryId,fn])=>({theoryId,builder:fn,available:typeof core?.[fn]==='function',validationStatus:theoryId==='attack'?'PARTIAL_CONNECTED':'PENDING_ADAPTER'}));return{schemaVersion:1,analysisId:'theory-validation-inventory-v1',coreVersion:core?.version||null,productionChanged:false,summary:{theories:rows.length,buildersAvailable:rows.filter(x=>x.available).length,connected:rows.filter(x=>x.validationStatus==='CONNECTED'||x.validationStatus==='PARTIAL_CONNECTED').length,pending:rows.filter(x=>x.validationStatus==='PENDING_ADAPTER').length},rows};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={THEORY_BUILDERS,build};
