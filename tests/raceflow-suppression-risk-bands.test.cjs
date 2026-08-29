'use strict';
const assert=require('assert');
const {build}=require('../scripts/analyze-raceflow-suppression-risk-bands.cjs');
const r=build();
assert.strictEqual(r.scope.holdoutUsed,false);assert.strictEqual(r.scope.productionChanged,false);
assert.match(r.scope.sourcePairFingerprint,/^[0-9a-f]{64}$/);
assert.ok(r.sourcePairSummary.suppressed.pairs>0);assert.ok(r.sourcePairSummary.suppressed.challengerWinRate>=0&&r.sourcePairSummary.suppressed.challengerWinRate<=1);
assert.ok(r.candidateCount>0);assert.ok(r.bestByWinRate);assert.strictEqual(r.bestByWinRate.quartiles.length,4);
console.log('raceFlow suppression risk bands tests passed');
