'use strict';
const assert = require('node:assert/strict');
const {select,compare,build} = require('./research-preserve-practical-candidates.cjs');
const a = ['1-2-3','1-2-4','1-2-5'], p = ['3-1-2','1-2-3'];
assert.deepEqual(select(a,p), ['3-1-2','1-2-3','1-2-4']);
assert.deepEqual(a,['1-2-3','1-2-4','1-2-5']);
assert.equal(select(['1-1-2'],p),null);
assert.equal(select(a,['1-2-3','1-2-4','1-2-5','1-2-6']),null);
const rows = [{raceKey:'20260801-01-1', a,b:select(a,p),actual:'3-1-2',payout:1000},
  {raceKey:'20260901-01-1', a,b:select(a,p),actual:'1-2-5',payout:2000}];
const c = compare(rows);
assert.equal(c.gains,1); assert.equal(c.losses,1); assert.equal(c.netHits,0);
assert.equal(c.returnDelta,-1000); assert.equal(c.a.stake,c.b.stake);
const records = rows.map(r => ({raceKey:r.raceKey,prediction:{candidate24Tickets:r.a,practicalTickets:p,
  verificationEvidence:{generation:{logicFingerprint:'test'}}},
  __officialResult:{trifecta:{combination:r.actual,payout:r.payout}}}));
const gate = () => ({decision:'INSUFFICIENT_EVIDENCE',reason:'NO_FORMAL_DECISION_GATE'});
const report = build(records,()=>{throw Error('must use stored candidates');},gate);
assert.equal(report.cohorts[0].discovery.netHits,1);
assert.equal(report.cohorts[0].retrospectiveCheck.netHits,-1);
assert.equal(report.productionChanged,false);
assert.equal(report.decision.decision,'INSUFFICIENT_EVIDENCE');
assert.equal(build([...records,records[0]],()=>[],gate).excluded['missing-or-duplicate-race-key'],1);
for (const flag of [{refund:true},{status:'void'},{trifecta:{combination:'1-2-3',payout:0}}]) {
  const bad={...records[0],__officialResult:{...records[0].__officialResult,...flag}};
  assert.equal(build([bad],()=>[],gate).rows.length,0);
}
const changedResult=structuredClone(records);changedResult[0].__officialResult.trifecta.combination='6-5-4';
assert.deepEqual(build(changedResult,()=>[],gate).rows[0].b,report.rows[0].b);
const unknown=structuredClone(records[0]);delete unknown.prediction.verificationEvidence;
assert.equal(build([unknown],()=>[],gate).rows.length,0);
console.log('preserve-practical same-count research tests passed');
