'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
function decide(c){
 const gate=c.preregisteredGate||c.gate||null;
 if(!gate)return{decision:'INSUFFICIENT_EVIDENCE',reason:'NO_FORMAL_DECISION_GATE',nextAction:'CONTINUE_EVIDENCE_ACCUMULATION'};
 const n=Number(c.evaluatedCount??c.races??0), required=Number(gate.requiredCount??gate.required??0);
 if(required>0&&n<required)return{decision:'INSUFFICIENT_EVIDENCE',reason:'FORMAL_GATE_COUNT_NOT_REACHED',nextAction:'CONTINUE_EXISTING_COLLECTION'};
 const net=Number(c.netHits??0),roi=Number(c.roiDelta??0);
 const hitRule=gate.minNetHits==null?true:net>=Number(gate.minNetHits);
 const roiRule=gate.minRoiDelta==null?true:roi>=Number(gate.minRoiDelta);
 if(hitRule&&roiRule)return{decision:'CANDIDATE_FOR_USER_APPROVAL',reason:'PREREGISTERED_GATE_PASSED',nextAction:'REQUEST_USER_APPROVAL'};
 return{decision:'REJECTED_BY_PREREGISTERED_GATE',reason:'PREREGISTERED_GATE_FAILED',nextAction:'LOCK_FINGERPRINT_NO_RETEST'};
}
function build(candidates=[]){
 const rows=candidates.map(c=>({...c,decisionGate:decide(c),automaticProductionChange:false}));
 return{schemaVersion:1,analysisId:'phase11-improvement-decision-gate-v1',generatedAt:new Date().toISOString(),productionChanged:false,rows,summary:{candidates:rows.length,userApproval:rows.filter(x=>x.decisionGate.decision==='CANDIDATE_FOR_USER_APPROVAL').length,rejected:rows.filter(x=>x.decisionGate.decision==='REJECTED_BY_PREREGISTERED_GATE').length,insufficient:rows.filter(x=>x.decisionGate.decision==='INSUFFICIENT_EVIDENCE').length},audit:{automaticProductionChanges:rows.filter(x=>x.automaticProductionChange).length,ambiguousDecisions:rows.filter(x=>!x.decisionGate?.decision).length},phaseComplete:rows.every(x=>x.decisionGate?.decision)&&rows.every(x=>!x.automaticProductionChange)};
}
function load(){
 const p=path.join(ROOT,'data/stats/theory-validation-phase8-cycle.json');if(!fs.existsSync(p))return[];
 const x=read('data/stats/theory-validation-phase8-cycle.json');
 return (x.rows||[]).filter(r=>r.validationHandoff).map(r=>({candidateId:r.candidateDiscovery?.candidate?.candidateId,theoryId:r.theoryId,evaluatedCount:r.validationHandoff?.gate?.current??r.candidateDiscovery?.candidate?.dataCount?.validation??0,preregisteredGate:r.validationHandoff?.gate?{requiredCount:r.validationHandoff.gate.required}:null,sourceDecision:r.decisionStatus}));
}
if(require.main===module){const out=build(load());process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={decide,build};
