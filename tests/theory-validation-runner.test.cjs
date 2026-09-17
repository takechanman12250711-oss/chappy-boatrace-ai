'use strict';
const assert=require('node:assert');
const runner=require('../scripts/theory-validation-runner.cjs');
const ids=Object.keys(runner.REGISTRY);
assert.strictEqual(ids.length,13);
const r=runner.runAll();
assert.strictEqual(r.productionChanged,false);
assert.strictEqual(r.summary.theories,13);
assert.strictEqual(r.summary.noTrigger,1);
assert.strictEqual(r.summary.candidateBlocked,12);
assert.strictEqual(r.summary.validated,1);
assert.strictEqual(r.summary.decisionReady,1);
const attack=r.reports.find(x=>x.theoryId==='attack');
assert(attack);
assert.strictEqual(attack.status,'NO_TRIGGER');
assert.strictEqual(attack.counts.triggered,0);
assert.strictEqual(attack.roi.baseline,84.62);
assert.strictEqual(attack.completion.validated,true);
assert.strictEqual(attack.completion.decisionReady,true);
for(const report of r.reports.filter(x=>x.theoryId!=='attack')){
  assert.strictEqual(report.status,'BLOCKED_CANDIDATE_MUTATOR');
  assert.strictEqual(report.completion.validated,false);
  assert.strictEqual(report.completion.decisionReady,false);
  assert.strictEqual(report.completion.blockerCode,'NO_CANDIDATE_MUTATOR');
  assert(report.warnings.some(x=>x.code==='NO_CANDIDATE_MUTATOR'));
}
console.log('theory validation runner phase3 accounting tests passed');
