'use strict';
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const {build}=require('../scripts/theory-validation-phase7-lifecycle.cjs');
const out=build();
assert.strictEqual(out.productionChanged,false);
assert.strictEqual(out.phaseComplete,true);
assert.strictEqual(out.summary.theories,13);
assert.strictEqual(new Set(out.rows.map(r=>r.theoryId)).size,13);
assert.strictEqual(out.audit.uniqueTheoryRegistry,true);
assert.strictEqual(out.audit.missingOrGenericState,0);
assert.strictEqual(out.audit.duplicateCollectors,0);
assert.strictEqual(out.audit.rejectedCandidateReexecution,0);
assert.strictEqual(out.audit.prospectiveHandoffBroken,0);
assert.strictEqual(out.audit.productionChanged,false);
assert.strictEqual(out.audit.historicalContradictions,0);
assert.strictEqual(out.audit.wallCollectorIncludesPhase6Handoff,true);
assert.strictEqual(out.audit.wallCollectorIncludesPhase7Lifecycle,true);
const wall=out.rows.find(r=>r.theoryId==='wall');
assert.ok(wall);
assert.strictEqual(wall.candidate.present,true);
assert.strictEqual(wall.prospectiveGate.required,100);
assert.ok(wall.prospectiveGate.current>=0);
assert.strictEqual(wall.decisionStatus,'ADOPTED_BY_USER');
assert.strictEqual(wall.candidateAdoptionStatus,'APPROVED_IMPLEMENTED');
const newEnv=out.rows.find(r=>r.theoryId==='newEnvironment');
assert.strictEqual(newEnv.decisionStatus,'PERMANENT_BLOCKER');
assert.strictEqual(newEnv.blockerCode,'NO_FIXED_CANDIDATE_FROM_DISCOVERY');
for(const row of out.rows){
  assert.strictEqual(row.productionAdoptionStatus,row.theoryId==='wall'?'OWNER_APPROVED_PURCHASE_SKIP_ACTIVE':'CURRENT_PRODUCTION_UNCHANGED');
  assert.ok(row.nextAllowedAction);
  if(row.decisionStatus==='REJECTED') assert.ok(row.nextAllowedAction.startsWith('NONE_'));
  if(row.decisionStatus==='PERMANENT_BLOCKER') assert.strictEqual(row.candidate.present,false);
}
const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','stats','theory-validation-phase7-lifecycle.json'),'utf8'));
assert.strictEqual(snapshot.analysisId,'theory-validation-phase7-lifecycle-v1');
assert.strictEqual(snapshot.productionChanged,false);
assert.strictEqual(snapshot.rows.length,13);
assert.deepStrictEqual([...snapshot.rows.map(r=>r.theoryId)].sort(),[...out.rows.map(r=>r.theoryId)].sort());
for(const row of snapshot.rows){
  const live=out.rows.find(r=>r.theoryId===row.theoryId);
  assert.ok(live,`missing live lifecycle row ${row.theoryId}`);
  assert.strictEqual(row.decisionStatus,live.decisionStatus,`decision status drift ${row.theoryId}`);
  assert.strictEqual(row.nextAllowedAction,live.nextAllowedAction,`next action drift ${row.theoryId}`);
}
assert.strictEqual(snapshot.rows.find(r=>r.theoryId==='wall').prospectiveGate.current,wall.prospectiveGate.current);
console.log('theory validation phase7 lifecycle tests passed');
