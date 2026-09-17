'use strict';

function finite(v){return Number.isFinite(Number(v));}
function num(v){return finite(v)?Number(v):0;}
function classifyReasons(reasons={}){
  const groups={triggered:0,notTriggered:0,replayBlocked:0,other:0};
  for(const [reason,countValue] of Object.entries(reasons||{})){
    const count=num(countValue);
    if(reason==='triggered') groups.triggered+=count;
    else if(/replay|frozen|missing|unavailable/i.test(reason)) groups.replayBlocked+=count;
    else if(/not-1|condition-not-met|not-trigger/i.test(reason)) groups.notTriggered+=count;
    else groups.other+=count;
  }
  return groups;
}
function buildTheoryValidationReport({theoryId,scope={},diagnostics={},result={}}={}){
  const propagation=result.propagation||{};
  const hits=result.hits||{};
  const tickets=result.tickets||{};
  const roi=result.roi||{};
  const eligible=num(diagnostics.eligible);
  const replayable=num(diagnostics.replayable);
  const excluded=num(diagnostics.excludedMissingFrozenFeatures);
  const triggered=num(diagnostics.triggered);
  const ticketsChanged=num(propagation.ticketsChanged);
  const reasons=diagnostics.reasons||{};
  const failureClassification=classifyReasons(reasons);
  const warnings=[];
  if(triggered>0&&ticketsChanged===0) warnings.push({code:'THEORY_TRIGGERED_WITHOUT_TICKET_CHANGE',severity:'high',message:'理論は発動したが最終3連単へ伝播していない'});
  if(excluded>0) warnings.push({code:'FROZEN_INPUT_MISSING',severity:'medium',count:excluded,message:'凍結入力不足で再現不能なレースがある'});
  const resultRacesKnown=finite(result.races);
  const resultRaces=num(result.races);
  const replayAccountingComplete=(replayable+excluded)===eligible;
  const resultMatchComplete=!resultRacesKnown||resultRaces===eligible;
  if(!replayAccountingComplete) warnings.push({code:'REPLAY_ACCOUNTING_MISMATCH',severity:'high',eligible,replayable,excluded,message:'replay可能件数と除外件数の合計が対象件数と一致しない'});
  if(!resultMatchComplete) warnings.push({code:'RESULT_COHORT_MISMATCH',severity:'high',eligible,resultRaces,message:'結果照合件数がholdout対象件数と一致しない'});
  const status=triggered===0?'NO_TRIGGER':(ticketsChanged===0?'PROPAGATION_BLOCKED':'EVALUATED');
  const complete=replayAccountingComplete&&resultMatchComplete;
  return {
    schemaVersion:2,
    reportType:'theory-validation',
    theoryId:String(theoryId||'unknown'),
    status,
    scope,
    counts:{eligible,replayable,excluded,triggered,ticketsChanged,resultRaces},
    coverage:{replayPct:eligible?Math.round((replayable/eligible)*10000)/100:100,replayAccountingComplete,resultMatchComplete},
    propagation:{rankingChanged:num(propagation.rankingChanged),scenarioChanged:num(propagation.scenarioChanged),attackerChanged:num(propagation.attackerChanged),ticketsChanged},
    hits:{baseline:num(hits.baseline),candidate:num(hits.candidate),added:num(hits.added),lost:num(hits.lost),net:num(hits.net)},
    tickets:{baseline:num(tickets.baseline),candidate:num(tickets.candidate),delta:num(tickets.delta)},
    roi:{baseline:num(roi.baseline),candidate:num(roi.candidate),delta:num(roi.delta)},
    missingReasons:reasons,
    failureClassification,
    warnings,
    completion:{complete,decisionReady:complete,productionChangeRequired:false},
    productionChanged:false
  };
}
module.exports={buildTheoryValidationReport,classifyReasons};
