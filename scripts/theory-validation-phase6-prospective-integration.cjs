'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function readJson(rel){return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));}
function newEngineCount(coverage){const row=(coverage?.theories||[]).find(x=>x.theoryKey==='new-engine');return Number(row?.evaluatedCount||row?.useCount||0);}
function build(){
  const wall=readJson('data/stats/wall-established-attacker2-skip-ab-report.json');
  const effective=readJson('data/stats/effective-score-weight-ab-report.json');
  const coverage=readJson('data/stats/theory-evidence-coverage-phase7.json');
  const prereg=readJson('data/experiments/wall-established-attacker2-skip-preregistration.json');
  const current=Number(wall?.diagnostics?.targetSettledRaceCount||0);
  const required=Number(wall?.interpretation?.minimumFormalDecisionRaceCount||100);
  const checkpoint=(wall?.checkpoints||[]).find(x=>Number(x?.targetSettledRaceCount)===required)||null;
  const reached=current>=required && checkpoint?.reached===true;
  const decisionReady=reached;
  const candidateConditionsMet=decisionReady && checkpoint?.conditionsMet===true;
  const a=wall?.a||{}; const b=wall?.b||{}; const delta=wall?.delta||{};
  const stakePerTicket=Number(prereg?.accounting?.stakePerTicketYen||100);
  const newEngineFormal=newEngineCount(coverage);
  const fixedCandidatePresent=Boolean(effective?.candidateB) && effective?.prospective?.active===true;
  const rows=[
    {
      theoryId:'wall',status:decisionReady?'DECISION_READY':'PROSPECTIVE_GATE',candidateId:String(prereg?.candidate?.id||prereg?.candidateId||'wall-established-attacker2-skip-b-v1'),
      progress:{current,required,remaining:Math.max(0,required-current),unit:'settled qualified races',nextGate:required},
      collection:{workflow:'.github/workflows/collect-wall-established-attacker2-skip-ab.yml',collector:'scripts/build-wall-established-attacker2-skip-ab-report.js',existingRoute:true,duplicateCollection:false,dedupe:'raceKey after prospective cutoff',preDeadlineOnly:true,officialResultRequired:true,generationFrozen:true},
      evaluation:{automaticAtGate:true,checkpointStatus:checkpoint?.status||null,baseline:{hits:Number(a.hitCount||0),tickets:stakePerTicket?Math.round(Number(a.stake||0)/stakePerTicket):null,stake:Number(a.stake||0),return:Number(a.return||0),profit:Number(a.profit||0),roi:a.recoveryRate??null},candidate:{hits:Number(b.hitCount||0),tickets:stakePerTicket?Math.round(Number(b.stake||0)/stakePerTicket):null,stake:Number(b.stake||0),return:Number(b.return||0),profit:Number(b.profit||0),roi:b.recoveryRate??null,noStake:Number(b.stake||0)===0},hits:{added:0,lost:Number(delta.missedHitCount||0),net:-Number(delta.missedHitCount||0)},ticketDelta:stakePerTicket?Math.round((Number(b.stake||0)-Number(a.stake||0))/stakePerTicket):null,profitDelta:Number(delta.profit||0),temporal:{distinctDates:Number(wall?.diagnostics?.distinctSettledDates||0),firstHalfProfitDelta:Number(wall?.robustness?.chronologicalSplit?.firstHalf?.delta?.profit||0),secondHalfProfitDelta:Number(wall?.robustness?.chronologicalSplit?.secondHalf?.delta?.profit||0),leaveOneOutMinimumProfitDelta:wall?.robustness?.leaveOneOut?.minimumRemainingAvoidedLoss??null},decision:decisionReady?(candidateConditionsMet?'CANDIDATE_FOR_USER_APPROVAL':'REJECTED_BY_PREREGISTERED_GATE'):'WAITING_FOR_100R',userApprovalRequired:true},
      blockerCode:decisionReady?null:'WAITING_PREREGISTERED_WALL_100R'
    },
    {
      theoryId:'newEnvironment',status:'PERMANENT_BLOCKER',candidateId:null,
      evidence:{formalRaces:newEngineFormal,source:'data/stats/theory-evidence-coverage-phase7.json',collectionContinues:true},
      collection:{existingRoute:true,duplicateCollection:false,route:'existing theory evidence tagging / performance evidence pipeline'},
      blockerCode:'NO_FIXED_CANDIDATE_FROM_DISCOVERY',
      reason:'Formal new-engine evidence may continue to accumulate, but the fixed effective-score A/B discovery produced no accepted candidate; candidateB is null and prospective A/B is inactive. Evidence count alone cannot create a new candidate without inventing a post-hoc rule.',
      evaluation:{automaticAt100:false,decisionReady:false,discoveryCandidateFrozen:fixedCandidatePresent,productionChangeRequired:false}
    }
  ];
  return {schemaVersion:1,analysisId:'theory-validation-phase6-prospective-integration-v1',generatedAt:new Date().toISOString(),productionChanged:false,phaseComplete:rows.every(x=>['PROSPECTIVE_GATE','DECISION_READY','PERMANENT_BLOCKER'].includes(x.status)),summary:{prospective:rows.filter(x=>x.status==='PROSPECTIVE_GATE').length,decisionReady:rows.filter(x=>x.status==='DECISION_READY').length,permanentBlocker:rows.filter(x=>x.status==='PERMANENT_BLOCKER').length,duplicateCollection:rows.filter(x=>x.collection?.duplicateCollection).length,missing:rows.filter(x=>!x.status).length},rows};
}
function main(){const out=build();const arg=process.argv.find(x=>x.startsWith('--output='));if(arg){const dest=path.resolve(ROOT,arg.slice(9));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete||out.summary.duplicateCollection||out.summary.missing)process.exitCode=1;}
if(require.main===module)main();
module.exports={build,newEngineCount};
