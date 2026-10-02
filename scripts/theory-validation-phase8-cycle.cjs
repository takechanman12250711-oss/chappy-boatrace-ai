'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const phase7=require('./theory-validation-phase7-lifecycle.cjs');
const ROOT=path.resolve(__dirname,'..');
const readJson=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const ELIGIBILITY_STATES=new Set(['NO_CANDIDATE','INSUFFICIENT_EVIDENCE','CONFOUNDED','DUPLICATE_REJECTED','ELIGIBLE_FOR_VALIDATION']);
const COVERAGE_KEYS=Object.freeze({
  flow:'race-flow',course:'course',stSlit:'start',exhibition:'exhibition',holdPickup:'remain-pickup',local:'local-water',waterWeather:'local-water',racerSkill:'skill',motorMaintenance:'motor',wall:'wall-boat',attack:null,raceTrend:null,newEnvironment:'new-engine'
});
const DIRECT_ROUTES=Object.freeze({
  attack:{route:'saved pre-deadline predictions -> frozen AI Core replay -> official result matching',source:['data/predictions/index.json','scripts/inner-attack-holdout-final-ticket.cjs'],status:'DERIVED_FROM_SAVED_PREDICTIONS'},
  raceTrend:{route:'saved prediction raceTrend readiness/input -> official result matching',source:['data/predictions/index.json','PR #671'],status:'OBSERVATION_ROUTE_PRESENT_NO_PHASE7_COVERAGE_KEY'}
});
const FIXED_CANDIDATES=Object.freeze({
  flow:{candidateId:'existing-flow-standalone-signal-v1',sourceEvidence:['data/stats/flow-suppression-report.json','PR #692'],fixedDefinition:'Existing standalone raceFlow signal reviewed in phase 4; definition is frozen to its historical report and is not re-optimized.',discoveryPeriod:{sourceCohort:'data/stats/flow-suppression-report.json',calendarRangeKnown:false},validationCount:null,standaloneCounterfactual:true,runnerAdapter:null},
  holdPickup:{candidateId:'existing-remain-pickup-same-stake-v1',sourceEvidence:['data/stats/remain-pickup-same-stake-shadow-report.json','PR #863'],fixedDefinition:'Existing seven-ticket same-stake one-ticket replacement hold/pickup shadow candidate; no threshold or ticket rule changes are permitted.',discoveryPeriod:{sourceCohort:'102R frozen holdout',calendarRangeKnown:false},validationCount:102,standaloneCounterfactual:true,runnerAdapter:null},
  course:{candidateId:'existing-frame-rise-fall-fixed100-v1',sourceEvidence:['data/stats/frame-rise-fall-shadow-result-report.json','data/stats/theory-ab-phase10.json','PR #351'],fixedDefinition:'Existing frame-rise-fall fixed100 shadow candidate exactly as evaluated in phase 5.',discoveryPeriod:{sourceCohort:'frame-rise-fall fixed100',calendarRangeKnown:false},validationCount:100,standaloneCounterfactual:true,runnerAdapter:null},
  wall:{candidateId:'wall-established-attacker2-skip-b-v1',sourceEvidence:['data/experiments/wall-established-attacker2-skip-preregistration.json','data/stats/wall-established-attacker2-skip-ab-report.json','PR #733','PR #734'],fixedDefinition:'Pre-registered candidate: when wall is established and attacker is boat 2, candidate B skips the target purchase under the existing frozen protocol.',discoveryPeriod:{sourceCohort:'prospective post-preregistration cohort',calendarRangeKnown:false},validationCount:null,standaloneCounterfactual:true,runnerAdapter:'scripts/theory-validation-phase6-prospective-integration.cjs'},
  attack:{candidateId:'PR-690-inner-attack-fixed-candidate',sourceEvidence:['PR #690','PR #981','scripts/inner-attack-holdout-final-ticket.cjs'],fixedDefinition:'PR #690 fixed inner-attack condition replayed without changing its feature definition or thresholds.',discoveryPeriod:{sourceCohort:'2026-08-19+ pre-deadline official-result holdout',calendarRangeKnown:true},validationCount:413,eligibleCount:784,standaloneCounterfactual:true,runnerAdapter:'scripts/inner-attack-holdout-final-ticket.cjs'}
});
function stableFingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function coverageMap(){const coverage=readJson('data/stats/theory-evidence-coverage-phase7.json');return{coverage,byKey:new Map((coverage.theories||[]).map(row=>[row.theoryKey,row]))};}
function evidenceFor(theoryId,byKey){const key=COVERAGE_KEYS[theoryId];if(key){const row=byKey.get(key)||null;return{route:'existing automatic predictions -> formal theory evidence tagging -> official result matching -> theory evidence coverage/growth pipeline',coverageKey:key,source:['data/stats/theory-evidence-coverage-phase7.json','data/stats/theory-evidence-growth-monitor.json'],routeStatus:row?'ACTIVE':'COVERAGE_KEY_MISSING',raceCount:row?.raceCount??null,useCount:row?.useCount??null,evaluatedCount:row?.evaluatedCount??null,formalEvidenceAvailable:row?.formalEvidenceAvailable===true,status:row?.status??null};}
  const direct=DIRECT_ROUTES[theoryId];return{route:direct?.route||null,coverageKey:null,source:direct?.source||[],routeStatus:direct?.status||'NO_VERIFIED_ACCUMULATION_ROUTE',raceCount:null,useCount:null,evaluatedCount:null,formalEvidenceAvailable:null,status:null};
}
function blockerEligibility(row){
  if(row.decisionStatus!=='PERMANENT_BLOCKER')return null;
  const code=String(row.blockerCode||'');
  if(code.includes('NOT_IDENTIFIABLE')||code.includes('UNSPECIFIED'))return 'CONFOUNDED';
  if(code==='NO_FIXED_CANDIDATE_FROM_DISCOVERY'||code.includes('NOT_PREREGISTERED'))return 'NO_CANDIDATE';
  return 'NO_CANDIDATE';
}
function candidateContract(theoryId,lifecycleRow,evidence){
  const fixed=FIXED_CANDIDATES[theoryId];
  if(!fixed)return null;
  const candidateId=lifecycleRow?.candidate?.id||fixed.candidateId;
  const contract={theoryId,candidateId,sourceEvidence:fixed.sourceEvidence,fixedDefinition:fixed.fixedDefinition,cohortFingerprint:lifecycleRow?.lastEvaluation?.fingerprint||null,discoveryPeriod:fixed.discoveryPeriod,dataCount:{formalEvidence:evidence.evaluatedCount,validation:theoryId==='wall'?(lifecycleRow?.prospectiveGate?.current??null):fixed.validationCount??null,eligible:fixed.eligibleCount??null},antiPosthoc:{definitionFrozen:true,newThresholdInvented:false,mayRetestRejectedFingerprint:false,requiresChangedEvidenceBasisToReopen:true},standaloneCounterfactual:fixed.standaloneCounterfactual===true,runnerAdapter:fixed.runnerAdapter};
  contract.candidateFingerprint=stableFingerprint({theoryId,candidateId,sourceEvidence:contract.sourceEvidence,fixedDefinition:contract.fixedDefinition,cohortFingerprint:contract.cohortFingerprint});
  return contract;
}
function classifyEligibility(lifecycleRow,candidate,evidence){
  if(lifecycleRow.candidateAdoptionStatus==='APPROVED_IMPLEMENTED')return{state:'ELIGIBLE_FOR_VALIDATION',reason:'OWNER_APPROVED_PURCHASE_POLICY_ACTIVE',nextAction:'MONITOR_APPROVED_PURCHASE_POLICY'};
  if(lifecycleRow.decisionStatus==='REJECTED')return{state:'DUPLICATE_REJECTED',reason:lifecycleRow.blockerCode||'PREVIOUSLY_REJECTED',nextAction:'NONE_REJECTED_FINGERPRINT_LOCKED'};
  if(lifecycleRow.decisionStatus==='PERMANENT_BLOCKER')return{state:blockerEligibility(lifecycleRow),reason:lifecycleRow.blockerCode,nextAction:'WAIT_FOR_MATERIAL_EVIDENCE_BASIS_CHANGE_OR_APPROVED_FIXED_CANDIDATE'};
  if(lifecycleRow.decisionStatus==='PENDING_GATE'&&candidate?.standaloneCounterfactual)return{state:'ELIGIBLE_FOR_VALIDATION',reason:lifecycleRow.blockerCode||'PROSPECTIVE_GATE_ACTIVE',nextAction:'CONTINUE_EXISTING_VALIDATION_HANDOFF'};
  if(lifecycleRow.decisionStatus==='CANDIDATE_FOR_USER_APPROVAL')return{state:'ELIGIBLE_FOR_VALIDATION',reason:'VALIDATION_COMPLETE_USER_APPROVAL_REQUIRED',nextAction:'REQUEST_USER_APPROVAL'};
  if(!candidate)return{state:'NO_CANDIDATE',reason:'NO_REPRODUCIBLE_FIXED_CANDIDATE',nextAction:'CONTINUE_EVIDENCE_ACCUMULATION'};
  if(evidence.formalEvidenceAvailable===false)return{state:'INSUFFICIENT_EVIDENCE',reason:'FORMAL_EVIDENCE_NOT_AVAILABLE',nextAction:'CONTINUE_EXISTING_EVIDENCE_COLLECTION'};
  return{state:'ELIGIBLE_FOR_VALIDATION',reason:'FIXED_REPRODUCIBLE_CANDIDATE_AVAILABLE',nextAction:'HANDOFF_TO_COMMON_VALIDATION'};
}
function validationHandoff(row,candidate,eligibility){
  if(eligibility.state!=='ELIGIBLE_FOR_VALIDATION')return null;
  const gate=row.prospectiveGate||null;
  return{theoryId:row.theoryId,candidateId:candidate.candidateId,candidateFingerprint:candidate.candidateFingerprint,targetRunner:'scripts/theory-validation-runner.cjs',existingAdapter:candidate.runnerAdapter||null,mode:gate?'PROSPECTIVE_PREREGISTERED':'FROZEN_HOLDOUT',gate:gate?{current:Number(gate.current||0),required:Number(gate.required||0),automaticAtGate:gate.automaticAtGate===true}:null,evaluationContract:['triggered','rankingChanged','scenarioChanged','attackerChanged','finalTicketsChanged','addedHits','lostHits','netHits','ticketDelta','roiDelta','dataQuality'],productionAdoption:'STOP_AT_CANDIDATE_FOR_USER_APPROVAL',automaticProductionChange:false};
}
function build(){
  const lifecycle=phase7.build();
  const {coverage,byKey}=coverageMap();
  const rows=lifecycle.rows.map(lifecycleRow=>{
    const evidence=evidenceFor(lifecycleRow.theoryId,byKey);
    const candidate=candidateContract(lifecycleRow.theoryId,lifecycleRow,evidence);
    const eligibility=classifyEligibility(lifecycleRow,candidate,evidence);
    const handoff=validationHandoff(lifecycleRow,candidate,eligibility);
    return{theoryId:lifecycleRow.theoryId,builder:lifecycleRow.builder,evidenceAccumulation:evidence,candidateDiscovery:{candidatePresent:Boolean(candidate),candidate,sourcePolicy:'EXISTING_IMPLEMENTATION_OR_FORMAL_VALIDATION_OR_EXISTING_DISCOVERY_OR_USER_APPROVED_ONLY',newThresholdInvented:false},eligibility,validationHandoff:handoff,decisionStatus:lifecycleRow.decisionStatus,blockerCode:lifecycleRow.blockerCode,productionAdoptionStatus:lifecycleRow.productionAdoptionStatus,nextAction:eligibility.nextAction,productionChanged:false};
  });
  const ids=rows.map(r=>r.theoryId);const uniqueIds=new Set(ids);
  const fingerprints=rows.map(r=>r.candidateDiscovery.candidate?.candidateFingerprint).filter(Boolean);const uniqueFingerprints=new Set(fingerprints);
  const rejectedRetest=rows.filter(r=>r.decisionStatus==='REJECTED'&&r.eligibility.state!=='DUPLICATE_REJECTED').map(r=>r.theoryId);
  const ambiguous=rows.filter(r=>!ELIGIBILITY_STATES.has(r.eligibility.state)||!r.nextAction||!r.evidenceAccumulation.route).map(r=>r.theoryId);
  const brokenHandoff=rows.filter(r=>r.eligibility.state==='ELIGIBLE_FOR_VALIDATION'&&!r.validationHandoff).map(r=>r.theoryId);
  const illegalProduction=rows.filter(r=>r.productionChanged===true||r.validationHandoff?.automaticProductionChange===true).map(r=>r.theoryId);
  const wall=rows.find(r=>r.theoryId==='wall');
  const wallHandoffValid=Boolean(wall?.validationHandoff?.existingAdapter)&&wall?.validationHandoff?.gate?.automaticAtGate===true;
  const lifecycleContradictions=rows.filter(r=>r.decisionStatus==='PERMANENT_BLOCKER'&&r.eligibility.state==='ELIGIBLE_FOR_VALIDATION').map(r=>r.theoryId);
  const noCandidateForced=rows.filter(r=>!r.candidateDiscovery.candidatePresent&&r.validationHandoff).map(r=>r.theoryId);
  const phaseComplete=rows.length===13&&uniqueIds.size===13&&fingerprints.length===uniqueFingerprints.size&&rejectedRetest.length===0&&ambiguous.length===0&&brokenHandoff.length===0&&illegalProduction.length===0&&lifecycleContradictions.length===0&&noCandidateForced.length===0&&wallHandoffValid&&lifecycle.phaseComplete===true;
  return{schemaVersion:1,analysisId:'theory-validation-phase8-cycle-v1',generatedAt:new Date().toISOString(),sourceCoverageGeneratedAt:coverage.generatedAt||null,coreVersion:lifecycle.coreVersion||null,productionChanged:false,phaseComplete,policy:{automaticProductionAdoption:false,newThresholdInvention:false,retestRejectedFingerprint:false,reopenPermanentBlockerOnlyOnMaterialEvidenceBasisChange:true},candidateDiscoveryContract:{requiredFields:['theoryId','candidateId','sourceEvidence','fixedDefinition','cohortFingerprint','discoveryPeriod','dataCount','antiPosthoc','standaloneCounterfactual','candidateFingerprint'],eligibilityStates:[...ELIGIBILITY_STATES],handoffOnlyWhen:'ELIGIBLE_FOR_VALIDATION',approvalStop:'CANDIDATE_FOR_USER_APPROVAL'},summary:{theories:rows.length,activeEvidenceRoutes:rows.filter(r=>r.evidenceAccumulation.routeStatus!=='NO_VERIFIED_ACCUMULATION_ROUTE').length,candidates:rows.filter(r=>r.candidateDiscovery.candidatePresent).length,eligibleForValidation:rows.filter(r=>r.eligibility.state==='ELIGIBLE_FOR_VALIDATION').length,duplicateRejected:rows.filter(r=>r.eligibility.state==='DUPLICATE_REJECTED').length,noCandidate:rows.filter(r=>r.eligibility.state==='NO_CANDIDATE').length,confounded:rows.filter(r=>r.eligibility.state==='CONFOUNDED').length,insufficientEvidence:rows.filter(r=>r.eligibility.state==='INSUFFICIENT_EVIDENCE').length,userApproval:rows.filter(r=>r.decisionStatus==='CANDIDATE_FOR_USER_APPROVAL').length},audit:{uniqueTheories:uniqueIds.size===13,uniqueCandidateFingerprints:fingerprints.length===uniqueFingerprints.size,rejectedCandidateRetest:rejectedRetest.length,ambiguousState:ambiguous.length,brokenValidationHandoff:brokenHandoff.length,illegalProductionChange:illegalProduction.length,lifecycleContradictions:lifecycleContradictions.length,forcedCandidateWithoutContract:noCandidateForced.length,wallExistingProspectiveHandoff:wallHandoffValid,duplicateCollectorAdded:false,historicalLifecycleComplete:lifecycle.phaseComplete===true,details:{rejectedRetest,ambiguous,brokenHandoff,illegalProduction,lifecycleContradictions,noCandidateForced}},rows};
}
function main(){const out=build();const arg=process.argv.find(x=>x.startsWith('--output='));if(arg){const dest=path.resolve(ROOT,arg.slice(9));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
if(require.main===module)main();
module.exports={ELIGIBILITY_STATES,COVERAGE_KEYS,FIXED_CANDIDATES,stableFingerprint,evidenceFor,classifyEligibility,validationHandoff,build};
