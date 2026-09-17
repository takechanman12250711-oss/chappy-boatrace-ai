'use strict';
const frozenAudit=require('./audit-frozen-input-replayability.cjs');
const innerAttack=require('./inner-attack-holdout-final-ticket.cjs');
const {buildTheoryValidationReport}=require('./theory-validation-report.cjs');

const REGISTRY=Object.freeze({
  'inner-attack-pr690':{analysis:innerAttack}
});

function stage(status,extra={}){return{status,...extra};}
function run(theoryId='inner-attack-pr690'){
  const entry=REGISTRY[theoryId];
  if(!entry) throw new Error(`unknown theoryId: ${theoryId}`);
  const audit=frozenAudit.build();
  const analysis=entry.analysis.build();
  const validation=buildTheoryValidationReport({theoryId,scope:analysis.scope,diagnostics:analysis.diagnostics,result:analysis.result});
  const auditEligible=Number(audit.eligible||0);
  if(auditEligible!==validation.counts.eligible){
    validation.warnings.push({code:'AUDIT_HOLDOUT_COHORT_MISMATCH',severity:'high',auditEligible,holdoutEligible:validation.counts.eligible,message:'凍結入力監査とholdout評価の対象件数が一致しない'});
    validation.completion.complete=false;
    validation.completion.decisionReady=false;
  }
  const replayStatus=validation.coverage.replayAccountingComplete?'COMPLETED':'INCOMPLETE';
  const resultStatus=validation.coverage.resultMatchComplete?'COMPLETED':'INCOMPLETE';
  return{
    schemaVersion:1,
    pipelineId:'theory-validation-pipeline-v1',
    theoryId,
    sourceAnalysisId:analysis.analysisId,
    stages:{
      audit:stage('COMPLETED',{eligible:auditEligible,strictEntries:Number(audit.strictEntries||0),missing:audit.missing||{}}),
      replay:stage(replayStatus,{replayable:validation.counts.replayable,excluded:validation.counts.excluded}),
      holdout:stage('COMPLETED',{holdoutStart:analysis.scope?.holdoutStart||null}),
      finalTicket:stage('COMPLETED',{ticketsChanged:validation.propagation.ticketsChanged}),
      resultMatch:stage(resultStatus,{races:validation.counts.resultRaces}),
      report:stage(validation.completion.complete?'COMPLETED':'INCOMPLETE',{status:validation.status})
    },
    validation,
    productionChanged:false
  };
}

if(require.main===module){
  try{process.stdout.write(JSON.stringify(run(process.argv[2]||'inner-attack-pr690'),null,2)+'\n');}
  catch(error){process.stderr.write(JSON.stringify({pipelineId:'theory-validation-pipeline-v1',status:'PIPELINE_ERROR',message:String(error?.message||error)})+'\n');process.exitCode=1;}
}
module.exports={REGISTRY,run};
