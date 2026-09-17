'use strict';
const fs=require('node:fs');
const path=require('node:path');
const phase4=require('./theory-validation-phase4-terminal-audit.cjs');
const ROOT=path.resolve(__dirname,'..');
const readJson=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const BLOCKED_TARGETS=['course','stSlit','exhibition','local','waterWeather','racerSkill','motorMaintenance','wall','raceTrend','newEnvironment'];
const evidenceCount=(coverage,key)=>coverage.theories?.find(row=>row.theoryKey===key)?.evaluatedCount??null;
const permanent=(theoryId,blockerCode,reason,evidence,context={})=>({theoryId,phase5Class:'PERMANENT_BLOCKER',decisionReady:false,validated:false,blockerCode,reason,evidence,metrics:{triggered:null,ticketsChanged:null,hitNet:null,roiDeltaPt:null,measurementState:'NOT_MEASURED'},context,productionChanged:false});
function build(){
 const p4=phase4.build();
 const blockedP4=p4.rows.filter(row=>row.terminalStatus==='BLOCKED');
 const blockedIds=blockedP4.map(row=>row.theoryId);
 const course=readJson('data/stats/frame-rise-fall-shadow-result-report.json');
 const wall=readJson('data/stats/wall-established-attacker2-skip-ab-report.json');
 const coverage=readJson('data/stats/theory-evidence-coverage-phase7.json');
 const growth=readJson('data/stats/theory-evidence-growth-monitor.json');
 const st=readJson('data/stats/st-slit-branch-profit-report.json');
 const exhibition=readJson('data/stats/exhibition-foot-branch-report.json');
 const localWater=readJson('data/stats/local-water-branch-report.json');
 const skill=readJson('data/stats/skill-branch-report.json');
 const motorCourse=readJson('data/stats/motor-course-branch-report.json');
 const courseFixed100=course.adoptionChecks?.fixed100Complete===true&&course.observation?.settledComparableCount===course.protocol?.fixedComparableRaces;
 const wall100=wall.checkpoints?.find(row=>Number(row.targetSettledRaceCount)===100);
 const newEngineCoverage=coverage.theories?.find(row=>row.theoryKey==='new-engine');
 const newEngineGrowth=growth.theories?.find(row=>row.theoryKey==='new-engine');
 const rows=[
  {
   theoryId:'course',phase5Class:'DECISION_READY',decisionReady:courseFixed100,validated:courseFixed100,
   conclusion:course.adoptionCandidate===true?'ADOPTION_CANDIDATE':'REJECT_CANDIDATE',blockerCode:null,
   reason:'既存のframe-rise-fall shadow A/Bが固定100Rを完走済み。Bは両half・的中純増・paired test・回収率条件を満たさず採用候補ではない。',
   evidence:['data/stats/frame-rise-fall-shadow-result-report.json','data/stats/theory-ab-phase10.json','PR #351'],
   metrics:{triggered:course.observation?.fixedPoolCount??null,ticketsChanged:course.observation?.fixedPoolCount??null,hitNet:(course.overall?.bHits??0)-(course.overall?.aHits??0),roiDeltaPt:null,measurementState:'PROSPECTIVE_FIXED100_MEASURED',roiNote:'Bは100Rすべて見送りでstake=0のため回収率差は定義しない'},
   context:{status:course.status,fixedPoolCount:course.observation?.fixedPoolCount,settledComparableCount:course.observation?.settledComparableCount,aHits:course.overall?.aHits,bHits:course.overall?.bHits,aRecoveryRate:course.overall?.aRecoveryRate,bRecoveryRate:course.overall?.bRecoveryRate,pairedOutcomePValue:course.pairedOutcomeExactTest?.pValue,adoptionCandidate:course.adoptionCandidate,automaticApplication:course.automaticApplication},productionChanged:false
  },
  permanent('stSlit','STANDALONE_COUNTERFACTUAL_UNSPECIFIED','正式ST証拠は自動蓄積されているが、既存の固定候補はST・攻め・展示の複合。現行承認済み仕様からSTだけを変える安全な事前登録counterfactualは定義されておらず、追加データだけでは解消しない。',['data/stats/st-slit-branch-profit-report.json','data/stats/st-role-attack-exhibition-holdout-report.json','PR #725'],{formalEvidence:evidenceCount(coverage,'start'),branchFormalSettled:st.summaries?.formal?.settledCount,branchFormalRecoveryRate:st.summaries?.formal?.recoveryRate}),
  permanent('exhibition','EXHIBITION_STANDALONE_COUNTERFACTUAL_UNSPECIFIED','展示正式証拠は十分蓄積されているが、既存未採用候補はST・攻めとの複合で、展示単独の差分ルールは事前登録されていない。観測的branch成績から新閾値を発明しない。',['data/stats/exhibition-foot-branch-report.json','data/stats/st-role-attack-exhibition-holdout-report.json','PR #725','PR #297'],{formalEvidence:evidenceCount(coverage,'exhibition'),branchFormalSettled:exhibition.summaries?.allFormal?.settledCount,branchFormalRecoveryRate:exhibition.summaries?.allFormal?.recoveryRate,retrospectiveInferenceAllowed:exhibition.interpretation?.retrospectiveInferenceAllowed}),
  permanent('local','LOCAL_EFFECT_NOT_IDENTIFIABLE_FROM_COMBINED_AB','既存のLocal/Water V2は合成タイブレークとして実装・評価されており、保存済み観測データからLocalだけをOFF/変更した反実仮想を復元できない。単独候補を新規発明しない限り識別不能。',['data/stats/local-water-branch-report.json','data/stats/local-water-v2-post-adoption-monitor.json','PR #615'],{combinedEvidence:evidenceCount(coverage,'local-water'),formalBranchEvidence:localWater.diagnostics?.formalEvidenceRaceCount,retrospectiveInferenceAllowed:localWater.interpretation?.retrospectiveInferenceAllowed}),
  permanent('waterWeather','WATER_EFFECT_NOT_IDENTIFIABLE_FROM_COMBINED_AB','既存のLocal/Water V2は合成タイブレークとして実装・評価されており、水面・気象だけの反実仮想を保存済み結果から安全に分離できない。単独候補を新規発明しない。',['data/stats/local-water-branch-report.json','data/stats/local-water-v2-post-adoption-monitor.json','PR #615'],{combinedEvidence:evidenceCount(coverage,'local-water'),formalBranchEvidence:localWater.diagnostics?.formalEvidenceRaceCount,retrospectiveInferenceAllowed:localWater.interpretation?.retrospectiveInferenceAllowed}),
  permanent('racerSkill','SKILL_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED','技量正式証拠は大量に存在するが、現行タイブレークを技量単独で変更する事前登録済みA/Bがない。観測branchの良否をそのままcandidateに変換しない。',['data/stats/skill-branch-report.json','PR #298','PR #305'],{formalEvidence:evidenceCount(coverage,'skill'),formalBranchEvidence:skill.diagnostics?.formalEvidenceRaceCount,retrospectiveInferenceAllowed:skill.interpretation?.retrospectiveInferenceAllowed}),
  permanent('motorMaintenance','MOTOR_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED','モーター/整備の正式証拠と本番接続は存在するが、モーター単独の事前登録済み差分候補がない。現行データから閾値を後付けしない。',['data/stats/motor-course-branch-report.json','PR #299','PR #656'],{formalEvidence:evidenceCount(coverage,'motor'),formalBranchEvidence:motorCourse.motor?.formalEvidenceRaceCount,retrospectiveInferenceAllowed:motorCourse.interpretation?.retrospectiveInferenceAllowed}),
  {
   theoryId:'wall',phase5Class:'PROSPECTIVE_GATE',decisionReady:false,validated:false,blockerCode:'WAITING_EXISTING_PROSPECTIVE_100R',
   reason:'事前登録済み「壁成立+攻め艇2号艇を見送り」shadow A/Bは公式結果収集成功後に既存workflowが自動更新する。新規収集は不要。100Rが正式手動判断の最初のgate。',
   evidence:['data/stats/wall-established-attacker2-skip-ab-report.json','.github/workflows/collect-wall-established-attacker2-skip-ab.yml','PR #733','PR #734'],
   metrics:{triggered:wall.diagnostics?.targetSettledRaceCount??null,ticketsChanged:wall.diagnostics?.targetSettledBetRaceCount??null,hitNet:wall.delta?.missedHitCount!=null?-Number(wall.delta.missedHitCount):null,roiDeltaPt:null,measurementState:'PROSPECTIVE_INCOMPLETE',roiNote:'Bは対象レース見送りのため通常のB回収率は定義しない'},
   gate:{current:wall.diagnostics?.targetSettledRaceCount??null,required:100,reached:wall100?.reached===true,collectionPath:'.github/workflows/collect-wall-established-attacker2-skip-ab.yml',collectionTrigger:'Collect official race results workflow_run',duplicateCollectionAdded:false},
   context:{baselineRecoveryRate:wall.a?.recoveryRate,avoidedLossYen:wall.delta?.avoidedLoss,missedHitCount:wall.delta?.missedHitCount,distinctDates:wall.diagnostics?.distinctSettledDates},productionChanged:false
  },
  permanent('raceTrend','RACE_TREND_STANDALONE_COUNTERFACTUAL_NOT_PREREGISTERED','raceTrendは正式入力/readinessとして利用されるが、raceTrend単独で最終3連単を変える事前登録済みcounterfactualが存在しない。既存結果からルールを逆算しない。',['PR #671'],{}),
  {
   theoryId:'newEnvironment',phase5Class:'PROSPECTIVE_GATE',decisionReady:false,validated:false,blockerCode:'WAITING_NEW_ENGINE_FORMAL_100R',
   reason:'新エンジンmodeと専用重みの正式証拠タグは既存自動予想へ実装済み。既存evidence pipelineでformal new-engineが出たレースだけを蓄積し、PR #680で固定された100R prospective gateまで待つ。現在は正式証拠0件で、新規収集workflowは追加しない。',
   evidence:['data/stats/theory-evidence-coverage-phase7.json','data/stats/theory-evidence-growth-monitor.json','PR #234','PR #680'],
   metrics:{triggered:null,ticketsChanged:null,hitNet:null,roiDeltaPt:null,measurementState:'PROSPECTIVE_NO_ELIGIBLE_RACES'},
   gate:{current:newEngineCoverage?.evaluatedCount??0,required:100,reached:(newEngineCoverage?.evaluatedCount??0)>=100,collectionPath:'existing automatic predictions -> theory formal-evidence -> theory evidence coverage/growth pipeline',collectionStatus:newEngineCoverage?.status||newEngineGrowth?.status||null,duplicateCollectionAdded:false},
   context:{coverageRaceCount:newEngineCoverage?.raceCount,formalEvidenceAvailable:newEngineCoverage?.formalEvidenceAvailable,growth:newEngineGrowth?.growth},productionChanged:false
  }
 ];
 const rowIds=rows.map(r=>r.theoryId);
 const missingBlocked=blockedIds.filter(id=>!rowIds.includes(id));
 const unexpected=rows.filter(r=>!BLOCKED_TARGETS.includes(r.theoryId)).map(r=>r.theoryId);
 const invalidClass=rows.filter(r=>!['DECISION_READY','PROSPECTIVE_GATE','PERMANENT_BLOCKER'].includes(r.phase5Class)).map(r=>r.theoryId);
 const generic=rows.filter(r=>!r.blockerCode&&r.phase5Class!=='DECISION_READY').map(r=>r.theoryId);
 const duplicateCollection=rows.filter(r=>r.gate?.duplicateCollectionAdded===true).map(r=>r.theoryId);
 const decisionReady=rows.filter(r=>r.phase5Class==='DECISION_READY');
 const prospective=rows.filter(r=>r.phase5Class==='PROSPECTIVE_GATE');
 const permanentRows=rows.filter(r=>r.phase5Class==='PERMANENT_BLOCKER');
 const complete=blockedIds.length===10&&rows.length===10&&missingBlocked.length===0&&unexpected.length===0&&invalidClass.length===0&&generic.length===0&&duplicateCollection.length===0&&decisionReady.every(r=>r.decisionReady&&r.validated)&&prospective.every(r=>Number.isFinite(Number(r.gate?.current))&&Number.isFinite(Number(r.gate?.required))&&r.gate.required>0&&r.gate.collectionPath)&&permanentRows.every(r=>r.blockerCode&&r.reason);
 return{schemaVersion:1,analysisId:'theory-validation-phase5-decisionability-v1',phaseComplete:complete,productionChanged:false,sourcePhase4:{phaseComplete:p4.phaseComplete,blockedTheoryCount:blockedIds.length,rejectedCarryover:p4.rows.filter(r=>r.terminalStatus==='REJECTED').map(r=>r.theoryId)},summary:{blockedFromPhase4:blockedIds.length,decisionReady:decisionReady.length,prospectiveGate:prospective.length,permanentBlocker:permanentRows.length,missing:missingBlocked.length,invalidClass:invalidClass.length,genericBlocker:generic.length,duplicateCollection:duplicateCollection.length},diagnostics:{missingBlocked,unexpected,invalidClass,generic,duplicateCollection},rows};
}
if(require.main===module){const out=build();process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={BLOCKED_TARGETS,build};
