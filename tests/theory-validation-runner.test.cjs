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
const attack=r.reports.find(x=>x.theoryId==='attack');
assert(attack);
assert.strictEqual(attack.status,'NO_TRIGGER');
assert.strictEqual(attack.counts.triggered,0);
assert.strictEqual(attack.roi.baseline,84.62);
for(const report of r.reports.filter(x=>x.theoryId!=='attack')){
  assert.strictEqual(report.status,'BLOCKED_CANDIDATE_MUTATOR');
  assert(report.warnings.some(x=>x.code==='NO_CANDIDATE_MUTATOR'));
}
console.log('theory validation runner phase3 tests passed');
