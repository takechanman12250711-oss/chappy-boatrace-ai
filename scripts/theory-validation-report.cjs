'use strict';

function num(v){return Number.isFinite(Number(v))?Number(v):0;}
function buildTheoryValidationReport({theoryId,scope={},diagnostics={},result={}}={}){
  const propagation=result.propagation||{};
  const hits=result.hits||{};
  const tickets=result.tickets||{};
  const roi=result.roi||{};
  const triggered=num(diagnostics.triggered);
  const ticketsChanged=num(propagation.ticketsChanged);
  const warnings=[];
  if(triggered>0&&ticketsChanged===0) warnings.push({code:'THEORY_TRIGGERED_WITHOUT_TICKET_CHANGE',severity:'high',message:'理論は発動したが最終3連単へ伝播していない'});
  if(num(diagnostics.excludedMissingFrozenFeatures)>0) warnings.push({code:'FROZEN_INPUT_MISSING',severity:'medium',count:num(diagnostics.excludedMissingFrozenFeatures),message:'凍結入力不足で再現不能なレースがある'});
  const status=triggered===0?'NO_TRIGGER':(ticketsChanged===0?'PROPAGATION_BLOCKED':'EVALUATED');
  return {
    schemaVersion:1,
    reportType:'theory-validation',
    theoryId:String(theoryId||'unknown'),
    status,
    scope,
    counts:{eligible:num(diagnostics.eligible),replayable:num(diagnostics.replayable),triggered,ticketsChanged},
    propagation:{rankingChanged:num(propagation.rankingChanged),scenarioChanged:num(propagation.scenarioChanged),attackerChanged:num(propagation.attackerChanged),ticketsChanged},
    hits:{baseline:num(hits.baseline),candidate:num(hits.candidate),added:num(hits.added),lost:num(hits.lost),net:num(hits.net)},
    tickets:{baseline:num(tickets.baseline),candidate:num(tickets.candidate),delta:num(tickets.delta)},
    roi:{baseline:num(roi.baseline),candidate:num(roi.candidate),delta:num(roi.delta)},
    missingReasons:diagnostics.reasons||{},
    warnings,
    productionChanged:false
  };
}
module.exports={buildTheoryValidationReport};
