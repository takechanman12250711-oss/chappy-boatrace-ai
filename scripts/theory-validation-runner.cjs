'use strict';
const {buildTheoryValidationReport}=require('./theory-validation-report.cjs');

const REGISTRY=Object.freeze({
  'inner-attack-pr690':{module:'./inner-attack-holdout-final-ticket.cjs',builder:'build'},
});
function loadTheory(theoryId){const cfg=REGISTRY[theoryId];if(!cfg)throw new Error(`unknown theory: ${theoryId}`);const mod=require(cfg.module);if(typeof mod[cfg.builder]!=='function')throw new Error(`builder missing: ${theoryId}`);return{cfg,mod};}
function runTheory(theoryId){const {mod}=loadTheory(theoryId);const raw=mod.build();return buildTheoryValidationReport({theoryId,scope:raw.scope,diagnostics:raw.diagnostics,result:raw.result});}
function runAll(ids=Object.keys(REGISTRY)){const reports=ids.map(runTheory);return{schemaVersion:1,analysisId:'theory-validation-runner-v1',productionChanged:false,summary:{theories:reports.length,evaluated:reports.filter(x=>x.status==='EVALUATED').length,noTrigger:reports.filter(x=>x.status==='NO_TRIGGER').length,propagationBlocked:reports.filter(x=>x.status==='PROPAGATION_BLOCKED').length,warnings:reports.reduce((n,x)=>n+x.warnings.length,0)},reports};}
if(require.main===module){const ids=process.argv.slice(2);process.stdout.write(JSON.stringify(runAll(ids.length?ids:undefined),null,2)+'\n');}
module.exports={REGISTRY,loadTheory,runTheory,runAll};
