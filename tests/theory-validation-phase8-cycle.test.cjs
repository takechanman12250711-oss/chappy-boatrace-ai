'use strict';
const assert=require('node:assert');
const {ELIGIBILITY_STATES,build}=require('../scripts/theory-validation-phase8-cycle.cjs');
const out=build();
assert.strictEqual(out.productionChanged,false);
assert.strictEqual(out.phaseComplete,true);
assert.strictEqual(out.summary.theories,13);
assert.strictEqual(out.audit.uniqueTheories,true);
assert.strictEqual(out.audit.uniqueCandidateFingerprints,true);
assert.strictEqual(out.audit.rejectedCandidateRetest,0);
assert.strictEqual(out.audit.ambiguousState,0);
assert.strictEqual(out.audit.brokenValidationHandoff,0);
assert.strictEqual(out.audit.illegalProductionChange,0);
assert.strictEqual(out.audit.lifecycleContradictions,0);
assert.strictEqual(out.audit.forcedCandidateWithoutContract,0);
assert.strictEqual(out.audit.wallExistingProspectiveHandoff,true);
assert.strictEqual(out.audit.duplicateCollectorAdded,false);
assert.strictEqual(out.audit.historicalLifecycleComplete,true);
assert.strictEqual(new Set(out.rows.map(r=>r.theoryId)).size,13);
const candidateFingerprints=[];
for(const row of out.rows){
  assert.ok(row.evidenceAccumulation.route,`missing evidence route ${row.theoryId}`);
  assert.ok(ELIGIBILITY_STATES.has(row.eligibility.state),`invalid eligibility ${row.theoryId}`);
  assert.ok(row.nextAction,`missing next action ${row.theoryId}`);
  assert.strictEqual(row.productionChanged,false);
  if(row.candidateDiscovery.candidatePresent){
    const c=row.candidateDiscovery.candidate;
    for(const key of ['theoryId','candidateId','sourceEvidence','fixedDefinition','cohortFingerprint','discoveryPeriod','dataCount','antiPosthoc','standaloneCounterfactual','candidateFingerprint'])assert.ok(Object.prototype.hasOwnProperty.call(c,key),`missing candidate field ${key} ${row.theoryId}`);
    assert.strictEqual(c.antiPosthoc.newThresholdInvented,false);
    assert.strictEqual(c.antiPosthoc.mayRetestRejectedFingerprint,false);
    candidateFingerprints.push(c.candidateFingerprint);
  }
  if(row.decisionStatus==='REJECTED'){
    assert.strictEqual(row.eligibility.state,'DUPLICATE_REJECTED');
    assert.strictEqual(row.validationHandoff,null);
  }
  if(row.decisionStatus==='PERMANENT_BLOCKER'){
    assert.ok(['NO_CANDIDATE','CONFOUNDED'].includes(row.eligibility.state));
    assert.strictEqual(row.validationHandoff,null);
  }
}
assert.strictEqual(new Set(candidateFingerprints).size,candidateFingerprints.length);
const wall=out.rows.find(r=>r.theoryId==='wall');
assert.ok(wall);
assert.strictEqual(wall.eligibility.state,'ELIGIBLE_FOR_VALIDATION');
assert.ok(wall.validationHandoff);
assert.strictEqual(wall.validationHandoff.existingAdapter,'scripts/theory-validation-phase6-prospective-integration.cjs');
assert.strictEqual(wall.validationHandoff.gate.required,100);
assert.strictEqual(wall.validationHandoff.gate.automaticAtGate,true);
assert.strictEqual(wall.validationHandoff.automaticProductionChange,false);
const newEnv=out.rows.find(r=>r.theoryId==='newEnvironment');
assert.strictEqual(newEnv.eligibility.state,'NO_CANDIDATE');
assert.strictEqual(newEnv.blockerCode,'NO_FIXED_CANDIDATE_FROM_DISCOVERY');
assert.strictEqual(newEnv.validationHandoff,null);
const attack=out.rows.find(r=>r.theoryId==='attack');
assert.strictEqual(attack.evidenceAccumulation.routeStatus,'DERIVED_FROM_SAVED_PREDICTIONS');
const trend=out.rows.find(r=>r.theoryId==='raceTrend');
assert.strictEqual(trend.evidenceAccumulation.routeStatus,'OBSERVATION_ROUTE_PRESENT_NO_PHASE7_COVERAGE_KEY');
console.log('theory validation phase8 cycle tests passed');
