'use strict';
const previous=require('./independent-partner-study-report.cjs');
function build(cohort,protocol,results,conflicts,resultOf){
  const projected={rejected:cohort.rejected,rows:cohort.rows.map(r=>({...r,snapshot:{...r.snapshot,
    candidate:r.snapshot.partnerStudy.judgment,partnerStudy:r.snapshot.routeWaterStudy}}))};
  const report=previous.build(projected,protocol,results,conflicts,resultOf);
  const coverage={races:cohort.rows.length,conditionalRouteRaces:0,weatherAvailableRaces:0,tideUnknownRaces:0,
    localAvailableBoats:0,localUnknownBoats:0,localComparedPairs:0,localConflictOrMissingPairs:0};
  for(const {snapshot:s} of cohort.rows){const {context:c,judgment:j}=s.routeWaterStudy;
    if(c.scenarioId)coverage.conditionalRouteRaces++;
    if(c.water.status==='available')coverage.weatherAvailableRaces++;
    if(c.water.tide.status==='unknown')coverage.tideUnknownRaces++;
    coverage.localAvailableBoats+=c.local.filter(r=>r.status==='available').length;
    coverage.localUnknownBoats+=c.local.filter(r=>r.status!=='available').length;
    for(const pair of j.comparisons){const stage=pair.evaluated.find(e=>e.stage==='localWater');
      if(stage){coverage.localComparedPairs++;if(stage.outcome===null)coverage.localConflictOrMissingPairs++;}}
  }
  return {...report,version:'independent-route-water-report-v1',baselineMethod:'independent-partner-selector-v1',
    coverage,actualTurnObserved:false,weatherAdaptationOrderingImplemented:false,
    decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'Unregistered gate; conditional routes and local-rate references with unknown sample sizes'}};
}
module.exports={build};
