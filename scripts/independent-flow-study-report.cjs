'use strict';
// Head-reference diagnostics only. Outcomes never reconstruct race tactics.
const count=(object,key)=>{object[key]=(object[key]||0)+1;};
function build(cohort,protocol,results,conflicts,resultOf){
  const unresolved={},pending=[],excluded=[],settled=[],roleObservations={second:{},third:{}},types={};
  let references=0,headMatches=0,paired=0,gained=0,lost=0;
  for(const receipt of cohort.rows){
    const s=receipt.snapshot,j=s.flowStudy.judgment,key=s.input.raceKey,decision=j.decision;
    if(decision.status!=='reference'){count(unresolved,decision.reason);continue;}
    references++;
    const r=resultOf(results.get(key));
    if(conflicts.has(key)){excluded.push({raceKey:key,reason:'conflicting_official_results'});continue;}
    if(!r){pending.push(key);continue;}
    if(r.excluded){excluded.push({raceKey:key,reason:r.excluded});continue;}
    const finish=r.actual.split('-').map(Number),match=decision.actor===finish[0];
    const scenario=j.scenarios.find(x=>x.id===decision.scenarioId);
    count(types,scenario.type);if(match)headMatches++;
    // Compare only two pre-sealed single-head references on the exact same input.
    const baseline=s.candidate.status==='selected'?s.candidate.head:null;
    if(baseline!==null){paired++;if(match&&baseline!==finish[0])gained++;if(!match&&baseline===finish[0])lost++;}
    // These are descriptive role labels of finishers, not a trivial all-boat coverage metric.
    if(match){count(roleObservations.second,scenario.roles.find(x=>x.boat===finish[1]).role);
      count(roleObservations.third,scenario.roles.find(x=>x.boat===finish[2]).role);}
    settled.push({raceKey:key,selectedAt:s.selectedAt,scenarioId:scenario.id,actor:decision.actor,actual:r.actual,
      headMatched:match,baselineHead:baseline,baselineHeadMatched:baseline===null?null:baseline===finish[0],
      snapshotHash:receipt.snapshotHash,confirmedAt:receipt.artifact.confirmedAt});
  }
  return {version:'independent-flow-study-report-v1',protocol:protocol.value,protocolHash:protocol.hash,
    sealed:cohort.rows.length,rejected:cohort.rejected,references,unresolved,pending,excluded,settled,
    headReference:{settled:settled.length,matches:headMatches,matchRate:settled.length?headMatches/settled.length*100:null,scenarioTypes:types},
    sameInputHeadComparison:{paired,gained,lost,net:gained-lost},roleObservations,
    actualTacticsInferred:false,ticketPerformanceAvailable:false,fullJudgmentImplemented:false,
    usableForPrediction:false,automaticApplication:false,decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No registered adoption gate'}};
}
module.exports={build};
