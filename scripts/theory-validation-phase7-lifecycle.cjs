'use strict';
const fs=require('node:fs');
const path=require('node:path');
const inventory=require('./theory-validation-inventory.cjs');
const phase4=require('./theory-validation-phase4-terminal-audit.cjs');
const phase5=require('./theory-validation-phase5-decisionability.cjs');
const phase6=require('./theory-validation-phase6-prospective-integration.cjs');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const WORKFLOW_DIR=path.join(ROOT,'.github','workflows');
const rejectedAction='NONE_CANDIDATE_REJECTED';
const permanentAction='NONE_UNTIL_APPROVED_FIXED_CANDIDATE_EXISTS';
function sourceRef(row){return Array.isArray(row?.evidence)&&row.evidence.length?row.evidence[0]:null;}
function lifecycleRow({theoryId,builder,candidatePresent=false,candidateId=null,validationStatus,decisionStatus,blockerCode=null,prospectiveGate=null,lastEvaluation=null,nextAllowedAction,source=[]}){
  return {theoryId,builder,candidate:{present:candidatePresent,id:candidateId},validationStatus,decisionStatus,blockerCode,prospectiveGate,lastEvaluation,productionAdoptionStatus:'CURRENT_PRODUCTION_UNCHANGED',candidateAdoptionStatus:decisionStatus==='CANDIDATE_FOR_USER_APPROVAL'?'PENDING_USER_APPROVAL':(decisionStatus==='REJECTED'?'NOT_ADOPTED':'NOT_APPLICABLE'),nextAllowedAction,source,productionChanged:false};
}
function countWallCollectors(){
  const names=fs.readdirSync(WORKFLOW_DIR).filter(n=>/\.ya?ml$/.test(n));
  return names.filter(name=>{
    const text=fs.readFileSync(path.join(WORKFLOW_DIR,name),'utf8');
    return text.includes('build-wall-established-attacker2-skip-ab-report.js')&&text.includes('workflow_run:')&&text.includes('Collect official race results');
  });
}
function build(){
  const inv=inventory.build();
  const p4=phase4.build();
  const p5=phase5.build();
  const p6=phase6.build();
  const invBy=new Map(inv.rows.map(r=>[r.theoryId,r]));
  const p4By=new Map(p4.rows.map(r=>[r.theoryId,r]));
  const p5By=new Map(p5.rows.map(r=>[r.theoryId,r]));
  const p6By=new Map(p6.rows.map(r=>[r.theoryId,r]));
  const rows=[];
  for(const theoryId of ['flow','holdPickup']){
    const r=p4By.get(theoryId); rows.push(lifecycleRow({theoryId,builder:invBy.get(theoryId)?.builder||null,candidatePresent:true,validationStatus:r?.metrics?.measurementState==='HOLDOUT_MEASURED'?'HOLDOUT_VALIDATED':'DISCOVERY_REJECTED',decisionStatus:'REJECTED',blockerCode:r?.blockerCode||null,lastEvaluation:{cohort:sourceRef(r),fingerprint:inv.coreVersion||null},nextAllowedAction:rejectedAction,source:r?.evidence||[]}));
  }
  {
    const r=p5By.get('course'); rows.push(lifecycleRow({theoryId:'course',builder:invBy.get('course')?.builder||null,candidatePresent:true,validationStatus:'PROSPECTIVE_FIXED100_VALIDATED',decisionStatus:r?.conclusion==='ADOPTION_CANDIDATE'?'CANDIDATE_FOR_USER_APPROVAL':'REJECTED',blockerCode:r?.conclusion==='ADOPTION_CANDIDATE'?null:'REJECTED_BY_FIXED100_GATE',lastEvaluation:{cohort:'frame-rise-fall fixed100',fingerprint:inv.coreVersion||null},nextAllowedAction:r?.conclusion==='ADOPTION_CANDIDATE'?'REQUEST_USER_APPROVAL':rejectedAction,source:r?.evidence||[]}));
  }
  for(const theoryId of ['stSlit','exhibition','local','waterWeather','racerSkill','motorMaintenance','raceTrend']){
    const r=p5By.get(theoryId); rows.push(lifecycleRow({theoryId,builder:invBy.get(theoryId)?.builder||null,candidatePresent:false,validationStatus:'NOT_VALIDATABLE_WITH_APPROVED_SPEC',decisionStatus:'PERMANENT_BLOCKER',blockerCode:r?.blockerCode||null,lastEvaluation:{cohort:sourceRef(r),fingerprint:inv.coreVersion||null},nextAllowedAction:permanentAction,source:r?.evidence||[]}));
  }
  {
    const r=p6By.get('wall'); const decision=r?.evaluation?.decision||'WAITING_FOR_100R'; const decisionStatus=decision==='CANDIDATE_FOR_USER_APPROVAL'?'CANDIDATE_FOR_USER_APPROVAL':(decision==='REJECTED_BY_PREREGISTERED_GATE'?'REJECTED':'PENDING_GATE');
    const next=decisionStatus==='CANDIDATE_FOR_USER_APPROVAL'?'REQUEST_USER_APPROVAL':(decisionStatus==='REJECTED'?rejectedAction:'CONTINUE_EXISTING_PROSPECTIVE_COLLECTION');
    rows.push(lifecycleRow({theoryId:'wall',builder:invBy.get('wall')?.builder||null,candidatePresent:true,candidateId:r?.candidateId||null,validationStatus:decisionStatus==='PENDING_GATE'?'PROSPECTIVE_COLLECTING':'PROSPECTIVE_GATE_VALIDATED',decisionStatus,blockerCode:decisionStatus==='PENDING_GATE'?(r?.blockerCode||'WAITING_PREREGISTERED_WALL_100R'):null,prospectiveGate:{current:Number(r?.progress?.current||0),required:Number(r?.progress?.required||100),remaining:Number(r?.progress?.remaining||0),collectionWorkflow:r?.collection?.workflow||null,automaticAtGate:r?.evaluation?.automaticAtGate===true},lastEvaluation:{cohort:'wall-established-attacker2-skip prospective',fingerprint:r?.candidateId||null},nextAllowedAction:next,source:['data/stats/theory-validation-phase6-prospective.json','data/stats/wall-established-attacker2-skip-ab-report.json','PR #990']}));
  }
  rows.push(lifecycleRow({theoryId:'attack',builder:invBy.get('attack')?.builder||null,candidatePresent:true,candidateId:'PR-690-inner-attack-fixed-candidate',validationStatus:'FROZEN_HOLDOUT_VALIDATED',decisionStatus:'REJECTED',blockerCode:'REJECTED_NO_TRIGGER_ON_FROZEN_HOLDOUT',lastEvaluation:{cohort:'2026-08-19+ pre-deadline official-result holdout: 784R eligible / 413R replayable',fingerprint:'ai-core-v4.8.5-actual-course-identity'},nextAllowedAction:rejectedAction,source:['PR #981','scripts/inner-attack-holdout-final-ticket.cjs']}));
  {
    const r=p6By.get('newEnvironment'); rows.push(lifecycleRow({theoryId:'newEnvironment',builder:invBy.get('newEnvironment')?.builder||null,candidatePresent:false,validationStatus:'NOT_VALIDATABLE_WITH_APPROVED_SPEC',decisionStatus:'PERMANENT_BLOCKER',blockerCode:r?.blockerCode||'NO_FIXED_CANDIDATE_FROM_DISCOVERY',lastEvaluation:{cohort:r?.evidence?.source||'data/stats/theory-evidence-coverage-phase7.json',fingerprint:inv.coreVersion||null},nextAllowedAction:permanentAction,source:['data/stats/theory-validation-phase6-prospective.json','PR #990']}));
  }
  const collectors=countWallCollectors();
  const approval=require('../config/wall-purchase-approval.json');
  const wallRow=rows.find(r=>r.theoryId==='wall');
  if(approval.status==='OWNER_APPROVED_IMPLEMENTED' && approval.candidateId===wallRow?.candidate.id){
    wallRow.productionAdoptionStatus='OWNER_APPROVED_PURCHASE_SKIP_ACTIVE';
    wallRow.candidateAdoptionStatus='APPROVED_IMPLEMENTED';
    wallRow.decisionStatus='ADOPTED_BY_USER';
    wallRow.approval={source:'config/wall-purchase-approval.json',approvedAt:approval.approvedAt,effectiveFrom:approval.effectiveFrom};
    wallRow.nextAllowedAction='MONITOR_APPROVED_PURCHASE_POLICY';
  }
  const wallWorkflow=read('.github/workflows/collect-wall-established-attacker2-skip-ab.yml');
  const ids=rows.map(r=>r.theoryId); const unique=new Set(ids);
  const inventoryIds=new Set(inv.rows.map(r=>r.theoryId));
  const missingInventory=[...inventoryIds].filter(id=>!unique.has(id));
  const extraLifecycle=[...unique].filter(id=>!inventoryIds.has(id));
  const missingState=rows.filter(r=>!r.validationStatus||!r.decisionStatus||!r.nextAllowedAction).map(r=>r.theoryId);
  const genericState=rows.filter(r=>r.blockerCode==='NO_CANDIDATE_MUTATOR'||r.validationStatus==='BLOCKED_CANDIDATE_MUTATOR').map(r=>r.theoryId);
  const rejectedReexecution=rows.filter(r=>r.decisionStatus==='REJECTED'&&!r.nextAllowedAction.startsWith('NONE_')).map(r=>r.theoryId);
  const prospectiveBroken=rows.filter(r=>r.decisionStatus==='PENDING_GATE'&&(!r.prospectiveGate?.collectionWorkflow||r.prospectiveGate?.automaticAtGate!==true)).map(r=>r.theoryId);
  const historicalContradictions=[];
  if(p4By.get('flow')?.terminalStatus!=='REJECTED')historicalContradictions.push('flow');
  if(p4By.get('holdPickup')?.terminalStatus!=='REJECTED')historicalContradictions.push('holdPickup');
  if(p5By.get('course')?.phase5Class!=='DECISION_READY')historicalContradictions.push('course');
  for(const id of ['stSlit','exhibition','local','waterWeather','racerSkill','motorMaintenance','raceTrend'])if(p5By.get(id)?.phase5Class!=='PERMANENT_BLOCKER')historicalContradictions.push(id);
  if(!['PROSPECTIVE_GATE','DECISION_READY'].includes(p6By.get('wall')?.status))historicalContradictions.push('wall');
  if(p6By.get('newEnvironment')?.status!=='PERMANENT_BLOCKER')historicalContradictions.push('newEnvironment');
  const audit={uniqueTheoryRegistry:rows.length===13&&unique.size===13&&missingInventory.length===0&&extraLifecycle.length===0,missingOrGenericState:missingState.length+genericState.length,duplicateCollectors:Math.max(0,collectors.length-1),rejectedCandidateReexecution:rejectedReexecution.length,prospectiveHandoffBroken:prospectiveBroken.length,productionChanged:rows.some(r=>r.productionChanged===true),historicalContradictions:historicalContradictions.length,wallCollectorIncludesPhase6Handoff:wallWorkflow.includes('theory-validation-phase6-prospective-integration.cjs'),wallCollectorIncludesPhase7Lifecycle:wallWorkflow.includes('theory-validation-phase7-lifecycle.cjs')};
  const phaseComplete=audit.uniqueTheoryRegistry&&audit.missingOrGenericState===0&&audit.duplicateCollectors===0&&audit.rejectedCandidateReexecution===0&&audit.prospectiveHandoffBroken===0&&!audit.productionChanged&&audit.historicalContradictions===0&&audit.wallCollectorIncludesPhase6Handoff&&audit.wallCollectorIncludesPhase7Lifecycle;
  return{schemaVersion:1,analysisId:'theory-validation-phase7-lifecycle-v1',sourceGeneratedAt:p6.generatedAt||null,coreVersion:inv.coreVersion||null,productionChanged:false,phaseComplete,summary:{theories:rows.length,rejected:rows.filter(r=>r.decisionStatus==='REJECTED').length,permanentBlocker:rows.filter(r=>r.decisionStatus==='PERMANENT_BLOCKER').length,prospectiveGate:rows.filter(r=>r.decisionStatus==='PENDING_GATE').length,userApproval:rows.filter(r=>r.decisionStatus==='CANDIDATE_FOR_USER_APPROVAL').length},audit:{...audit,collectorWorkflows:collectors,missingInventoryIds:missingInventory,extraLifecycleIds:extraLifecycle,missingStateIds:missingState,genericStateIds:genericState,rejectedReexecutionIds:rejectedReexecution,prospectiveBrokenIds:prospectiveBroken,historicalContradictionIds:historicalContradictions},rows};
}
function main(){const out=build();const arg=process.argv.find(x=>x.startsWith('--output='));if(arg){const dest=path.resolve(ROOT,arg.slice(9));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
if(require.main===module)main();
module.exports={build,countWallCollectors};
