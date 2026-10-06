'use strict';
const {stats}=require('./independent-rule-forward.cjs');
const count=(obj,key)=>{obj[key]=(obj[key]||0)+1;};
function build(cohort,protocol,results,conflicts,resultOf){
  const skipped={},pending=[],excluded=[],settled=[],paired=[],notComparable={};let selected=0,gained=0,lost=0;
  for(const receipt of cohort.rows){
    const s=receipt.snapshot,j=s.partnerStudy.judgment,key=s.input.raceKey;
    if(j.status!=='selected'){count(skipped,j.reason);continue;}selected++;
    const result=resultOf(results.get(key));
    if(conflicts.has(key)){excluded.push({raceKey:key,reason:'conflicting_official_results'});continue;}
    if(!result){pending.push(key);continue;}
    if(result.excluded){excluded.push({raceKey:key,reason:result.excluded});continue;}
    const row={raceKey:key,...result,tickets:j.tickets,scenarioId:j.scenarioId,snapshotHash:receipt.snapshotHash,
      selectedAt:s.selectedAt,confirmedAt:receipt.artifact.confirmedAt};settled.push(row);
    const baseline=s.candidate;
    if(baseline.status!=='selected'){count(notComparable,'baseline-skipped');continue;}
    if(baseline.tickets.length!==j.tickets.length){count(notComparable,'ticket-count-mismatch');continue;}
    const a=baseline.tickets.includes(result.actual),b=j.tickets.includes(result.actual);
    if(b&&!a)gained++;if(a&&!b)lost++;paired.push({...row,baseline:baseline.tickets});
  }
  return {version:'independent-partner-study-report-v1',protocol:protocol.value,protocolHash:protocol.hash,
    sealed:cohort.rows.length,rejected:cohort.rejected,selected,skipped,pending,excluded,settled,
    allCandidate:stats(settled,'tickets'),paired:{count:paired.length,baseline:stats(paired,'baseline'),candidate:stats(paired,'tickets'),
      gained,lost,net:gained-lost,notComparable},accounting:'hypothetical-100-yen-per-ticket',
    actualPurchase:false,actualTacticsInferred:false,fullJudgmentImplemented:false,usableForPrediction:false,automaticApplication:false,
    decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No registered adoption gate; limited turn/skill hypotheses'}};
}
module.exports={build};
