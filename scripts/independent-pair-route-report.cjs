'use strict';
const {VERSION,SAFETY}=require('./independent-pair-route-diagnostic-v1.cjs');
function build(cohort,protocol){
  const raceCounts={sealed:cohort.rows.length,available:0,unavailable:0},unavailableReasons={},sourceSelectionSkips={};
  const pairCounts={total:0,poolEvaluated:0,poolNotEvaluated:0,selectedBySource:0,sameZone:{true:0,false:0,unknown:0}};
  const rows=[];
  for(const receipt of cohort.rows){
    const s=receipt.snapshot,d=s.pairRouteDiagnosticStudy.diagnostic;
    raceCounts[d.status]++;
    if(d.status==='unavailable')unavailableReasons[d.reason]=(unavailableReasons[d.reason]||0)+1;
    if(d.sourceSelectionStatus==='skipped')sourceSelectionSkips[d.sourceSelectionReason]=(sourceSelectionSkips[d.sourceSelectionReason]||0)+1;
    for(const p of d.pairs){pairCounts.total++;pairCounts[p.selectionPoolMembership==='evaluated'?'poolEvaluated':'poolNotEvaluated']++;
      if(p.selectedBySource)pairCounts.selectedBySource++;
      pairCounts.sameZone[p.relations.sameZone.value===null?'unknown':String(p.relations.sameZone.value)]++;}
    rows.push({raceKey:d.raceKey,status:d.status,reason:d.reason,observedAt:d.observedAt,selectedAt:s.selectedAt,
      snapshotHash:receipt.snapshotHash,diagnosticHash:d.diagnosticHash,protocolHash:s.pairRouteDiagnosticStudy.protocolHash,
      artifact:{...receipt.artifact},pairCount:d.pairs.length,sourceSelectionStatus:d.sourceSelectionStatus,
      sourceSelectionReason:d.sourceSelectionReason});
  }
  const invalidRecords=Object.values(cohort.rejected).reduce((a,b)=>a+b,0);
  return {version:VERSION,protocol:protocol.value,protocolHash:protocol.hash,...SAFETY,
    status:invalidRecords?'incomplete':rows.length?'available':'not-yet-collected',
    source:{complete:invalidRecords===0,scope:'first-valid-v8-seal-per-race-and-pair-diagnostic-protocol',
      diagnosticNeverBackfilled:true},invalidRecords,rejected:cohort.rejected,raceCounts,pairCounts,
    unavailableReasons,sourceSelectionSkips,rows};
}
module.exports={build};
