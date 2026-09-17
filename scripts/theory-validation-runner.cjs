'use strict';
const {buildTheoryValidationReport}=require('./theory-validation-report.cjs');
const inventory=require('./theory-validation-inventory.cjs');

const REGISTRY=Object.freeze({
  flow:{kind:'builder-only',builder:'buildFlowTheory'},
  course:{kind:'builder-only',builder:'buildCourseStructureEvaluation'},
  stSlit:{kind:'builder-only',builder:'buildStFoundationEvaluation'},
  exhibition:{kind:'builder-only',builder:'buildExhibitionPerformanceEvaluation'},
  holdPickup:{kind:'builder-only',builder:'buildHoldPickupTheory'},
  local:{kind:'builder-only',builder:'buildLocalTheory'},
  waterWeather:{kind:'builder-only',builder:'buildWaterWeatherTheory'},
  racerSkill:{kind:'builder-only',builder:'buildRacerSkillTheory'},
  motorMaintenance:{kind:'builder-only',builder:'buildMotorMaintenanceTheory'},
  wall:{kind:'builder-only',builder:'buildWallTheory'},
  attack:{kind:'executable',module:'./inner-attack-holdout-final-ticket.cjs',builder:'build'},
  raceTrend:{kind:'builder-only',builder:'buildRaceTrendEvaluation'},
  newEnvironment:{kind:'builder-only',builder:'buildNewEnvironmentTheory'}
});
function blockedReport(theoryId,cfg){const inv=inventory.build();const row=inv.rows.find(x=>x.theoryId===theoryId);return{schemaVersion:2,reportType:'theory-validation',theoryId,status:'BLOCKED_CANDIDATE_MUTATOR',scope:{builder:cfg.builder,coreVersion:inv.coreVersion},counts:{eligible:0,replayable:0,excluded:0,triggered:0,ticketsChanged:0,resultRaces:0},coverage:{replayPct:0,replayAccountingComplete:false,resultMatchComplete:false},propagation:{rankingChanged:0,scenarioChanged:0,attackerChanged:0,ticketsChanged:0},hits:{baseline:0,candidate:0,added:0,lost:0,net:0},tickets:{baseline:0,candidate:0,delta:0},roi:{baseline:0,candidate:0,delta:0},missingReasons:{NO_CANDIDATE_MUTATOR:1},failureClassification:{triggered:0,notTriggered:0,replayBlocked:0,other:1},warnings:[{code:'NO_CANDIDATE_MUTATOR',severity:'medium',message:'現行builderは理論値を生成するが、凍結baselineへ安全に差分適用するcandidate mutatorが未定義のため最終買い目比較は未検証',builderAvailable:Boolean(row?.available)}],completion:{complete:false,decisionReady:false,validated:false,productionChangeRequired:false,blockerCode:'NO_CANDIDATE_MUTATOR'},productionChanged:false};}
function loadTheory(theoryId){const cfg=REGISTRY[theoryId];if(!cfg)throw new Error(`unknown theory: ${theoryId}`);if(cfg.kind!=='executable')return{cfg,mod:null};const mod=require(cfg.module);if(typeof mod[cfg.builder]!=='function')throw new Error(`builder missing: ${theoryId}`);return{cfg,mod};}
function runTheory(theoryId){const {cfg,mod}=loadTheory(theoryId);if(cfg.kind==='builder-only')return blockedReport(theoryId,cfg);const raw=mod[cfg.builder]();return buildTheoryValidationReport({theoryId,scope:raw.scope,diagnostics:raw.diagnostics,result:raw.result});}
function runAll(ids=Object.keys(REGISTRY)){const reports=ids.map(runTheory);return{schemaVersion:3,analysisId:'theory-validation-runner-v3-phase3-accounting',productionChanged:false,summary:{theories:reports.length,evaluated:reports.filter(x=>x.status==='EVALUATED').length,noTrigger:reports.filter(x=>x.status==='NO_TRIGGER').length,propagationBlocked:reports.filter(x=>x.status==='PROPAGATION_BLOCKED').length,candidateBlocked:reports.filter(x=>x.status==='BLOCKED_CANDIDATE_MUTATOR').length,validated:reports.filter(x=>x.completion?.validated===true).length,decisionReady:reports.filter(x=>x.completion?.decisionReady===true).length,warnings:reports.reduce((n,x)=>n+x.warnings.length,0)},reports};}
if(require.main===module){const ids=process.argv.slice(2);process.stdout.write(JSON.stringify(runAll(ids.length?ids:undefined),null,2)+'\n');}
module.exports={REGISTRY,loadTheory,runTheory,runAll,blockedReport};
