'use strict';
const fs=require('node:fs');
const path=require('node:path');
const runner=require('./theory-validation-runner.cjs');
const inventory=require('./theory-validation-inventory.cjs');
const ROOT=path.resolve(__dirname,'..');
const TARGETS=['flow','course','stSlit','exhibition','holdPickup','local','waterWeather','racerSkill','motorMaintenance','wall','raceTrend','newEnvironment'];
const readJson=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const baseMetrics=()=>({triggered:null,ticketsChanged:null,hitNet:null,roiDeltaPt:null,measurementState:'NOT_MEASURED'});
function build(){
 const inv=inventory.build(); const common=runner.runAll(TARGETS); const commonBy=new Map(common.reports.map(r=>[r.theoryId,r]));
 const flow=readJson('data/stats/flow-suppression-report.json');
 const composite=readJson('data/stats/st-role-attack-exhibition-holdout-report.json');
 const remain=readJson('data/stats/remain-pickup-same-stake-shadow-report.json');
 const localWater=readJson('data/stats/local-water-v2-post-adoption-monitor.json');
 const wall=readJson('data/stats/wall-established-attacker2-skip-ab-report.json');
 const stBranch=readJson('data/stats/st-slit-branch-profit-report.json');
 const dispositions={
  flow:{terminalStatus:'REJECTED',blockerCode:'REJECTED_STANDALONE_FLOW_SIGNAL',evidence:['data/stats/flow-suppression-report.json','PR #692'],reason:flow.conclusion?.reason||'raceFlow単独差は固定識別幅に未達で本番候補にしない',metrics:{...baseMetrics(),measurementState:'DISCOVERY_ONLY'},context:{attackWinCount:flow.attackWin?.count,innerWinCount:flow.innerWin?.count,raceFlowGap:flow.comparison?.attackWinMinusInnerWin?.raceFlow}},
  course:{terminalStatus:'BLOCKED',blockerCode:'NO_INDEPENDENT_HOLDOUT',evidence:['PR #351'],reason:'frame-rise-fall候補は84Rの分析が2暦日に集中し、独立holdoutとして扱えずcandidateBも未実装',metrics:baseMetrics(),context:{retrospectiveRaceCount:84,calendarDates:2}},
  stSlit:{terminalStatus:'BLOCKED',blockerCode:'NO_STANDALONE_CANDIDATE',evidence:['data/stats/st-slit-branch-profit-report.json','data/stats/st-role-attack-exhibition-holdout-report.json','PR #725'],reason:'正式ST証拠は蓄積済みだが、既存の固定候補は攻め・展示との複合条件で単独ST効果を分離できず、その複合案自体もholdout件数不足で棄却済み',metrics:baseMetrics(),context:{formalProspectiveSettled:stBranch.verificationProspective?.summaries?.formal?.settledCount,formalProspectiveRecoveryRate:stBranch.verificationProspective?.summaries?.formal?.recoveryRate,compositeEligible:composite.overall?.eligibleCount,compositeHeadNet:composite.overall?.netCorrectGain}},
  exhibition:{terminalStatus:'BLOCKED',blockerCode:'NO_STANDALONE_CANDIDATE',evidence:['data/stats/st-role-attack-exhibition-holdout-report.json','PR #725','PR #297'],reason:'展示は現行coreへ既に正式反映されるが、既存の未採用候補はST・攻めとの複合条件のみで展示単独の安全なcounterfactualが未定義',metrics:baseMetrics(),context:{compositeEligible:composite.overall?.eligibleCount,compositeHeadNet:composite.overall?.netCorrectGain}},
  holdPickup:{terminalStatus:'REJECTED',blockerCode:'REJECTED_HOLDOUT_ROI_WORSE',evidence:['data/stats/remain-pickup-same-stake-shadow-report.json','PR #863'],reason:'7点固定・同額1点入替の102R holdoutで的中純増0、回収率41.2%→39.2%のため候補を不採用',metrics:{triggered:remain.holdout?.B?.affectedRaceCount??null,ticketsChanged:remain.holdout?.B?.affectedRaceCount??null,hitNet:remain.holdout?.delta?.hitCount??null,roiDeltaPt:remain.holdout?.delta?.recoveryRatePoints??null,measurementState:'HOLDOUT_MEASURED'},context:{holdoutRaces:remain.holdout?.A?.settledRaceCount,baselineRecoveryRate:remain.holdout?.A?.recoveryRate,candidateRecoveryRate:remain.holdout?.B?.recoveryRate}},
  local:{terminalStatus:'BLOCKED',blockerCode:'COMBINED_LOCAL_WATER_EFFECT_NOT_SEPARABLE',evidence:['data/stats/local-water-v2-post-adoption-monitor.json','PR #615'],reason:'現行A/BはLocal/Water V2の合成タイブレークとしてのみ比較され、当地単独寄与へ安全に分解できない',metrics:baseMetrics(),context:{combinedAppliedRaces:localWater.total?.appliedRaces,combinedHitDelta:localWater.total?.hitDelta,combinedReturnDelta:localWater.total?.returnDelta}},
  waterWeather:{terminalStatus:'BLOCKED',blockerCode:'COMBINED_LOCAL_WATER_EFFECT_NOT_SEPARABLE',evidence:['data/stats/local-water-v2-post-adoption-monitor.json','PR #615'],reason:'現行A/BはLocal/Water V2の合成タイブレークとしてのみ比較され、水面・気象単独寄与へ安全に分解できない',metrics:baseMetrics(),context:{combinedAppliedRaces:localWater.total?.appliedRaces,combinedHitDelta:localWater.total?.hitDelta,combinedReturnDelta:localWater.total?.returnDelta}},
  racerSkill:{terminalStatus:'BLOCKED',blockerCode:'NO_PREREGISTERED_STANDALONE_COUNTERFACTUAL',evidence:['PR #298','PR #305'],reason:'技量V2は現行本番の僅差タイブレークへ既に接続済みだが、工程4で再利用できる事前登録済みの技量単独A/B候補が存在しない',metrics:baseMetrics(),context:{}},
  motorMaintenance:{terminalStatus:'BLOCKED',blockerCode:'NO_PREREGISTERED_STANDALONE_COUNTERFACTUAL',evidence:['PR #299','PR #656'],reason:'モーター/整備V2の本番core接続は回帰固定済みだが、現行理論を安全に差分化する事前登録済み単独candidate mutatorが存在しない',metrics:baseMetrics(),context:{}},
  wall:{terminalStatus:'BLOCKED',blockerCode:'PROSPECTIVE_GATE_NOT_REACHED',evidence:['data/stats/wall-established-attacker2-skip-ab-report.json','PR #733','PR #734'],reason:'壁成立+攻め艇2の前向きskip A/Bは進行中だが、正式判断最低100Rに対して31Rで未到達',metrics:{triggered:wall.diagnostics?.targetSettledRaceCount??null,ticketsChanged:wall.diagnostics?.targetSettledBetRaceCount??null,hitNet:wall.delta?.missedHitCount!=null?-Number(wall.delta.missedHitCount):null,roiDeltaPt:null,measurementState:'PROSPECTIVE_INCOMPLETE'},context:{minimumDecisionRaceCount:wall.interpretation?.minimumFormalDecisionRaceCount,baselineRecoveryRate:wall.a?.recoveryRate,avoidedLossYen:wall.delta?.avoidedLoss,distinctDates:wall.diagnostics?.distinctSettledDates}},
  raceTrend:{terminalStatus:'BLOCKED',blockerCode:'NO_PREREGISTERED_STANDALONE_COUNTERFACTUAL',evidence:['PR #671'],reason:'raceTrendは正式入力/readinessとして他A/Bの前提に使われるが、raceTrend単独で最終3連単を変える固定candidate mutatorが事前登録されていない',metrics:baseMetrics(),context:{}},
  newEnvironment:{terminalStatus:'BLOCKED',blockerCode:'NO_DECISION_READY_NEW_ENGINE_COHORT',evidence:['PR #680','PR #234'],reason:'新エンジン理論は正式証拠条件を持つが、既存固定A/Bではactive new-engine evidenceが0/451で、別100R prospective gateも判断可能状態に到達していない',metrics:baseMetrics(),context:{historicalEvaluatedRaces:451,historicalActiveEvidence:0,requiredProspectiveRaces:100}}
 };
 const rows=TARGETS.map(theoryId=>{const invRow=inv.rows.find(r=>r.theoryId===theoryId);const commonRow=commonBy.get(theoryId);const d=dispositions[theoryId];return{theoryId,builder:invRow?.builder||null,builderAvailable:invRow?.available===true,commonRunnerStatus:commonRow?.status||'MISSING_REPORT',validated:false,decisionReady:false,...d};});
 const missing=rows.filter(r=>!r.builderAvailable||r.commonRunnerStatus==='MISSING_REPORT'||!r.terminalStatus||!r.blockerCode).map(r=>r.theoryId);
 const nonTerminal=rows.filter(r=>!['BLOCKED','REJECTED','VALIDATED'].includes(r.terminalStatus)).map(r=>r.theoryId);
 const generic=rows.filter(r=>r.blockerCode==='NO_CANDIDATE_MUTATOR').map(r=>r.theoryId);
 const complete=rows.length===12&&missing.length===0&&nonTerminal.length===0&&generic.length===0;
 return{schemaVersion:1,analysisId:'theory-validation-phase4-terminal-audit-v1',phaseComplete:complete,validationComplete:rows.every(r=>r.validated&&r.decisionReady),productionChanged:false,summary:{theories:rows.length,validated:rows.filter(r=>r.terminalStatus==='VALIDATED').length,rejected:rows.filter(r=>r.terminalStatus==='REJECTED').length,blocked:rows.filter(r=>r.terminalStatus==='BLOCKED').length,missing:missing.length,nonTerminal:nonTerminal.length,genericBlocker:generic.length},diagnostics:{missing,nonTerminal,generic},rows};
}
if(require.main===module){const out=build();process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={TARGETS,build};
