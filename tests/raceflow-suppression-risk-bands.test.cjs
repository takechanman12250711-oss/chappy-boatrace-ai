'use strict';
const assert=require('assert');
const {build}=require('../scripts/analyze-raceflow-suppression-risk-bands.cjs');
const r=build();
assert.strictEqual(r.scope.holdoutUsed,false);assert.strictEqual(r.scope.productionChanged,false);
assert.strictEqual(r.scope.sourceSuppressedPairs,23);assert.strictEqual(r.scope.sourceSuppressedWinRate,0.3913);
assert.ok(r.candidateCount>0);assert.ok(r.bestByWinRate);assert.strictEqual(r.bestByWinRate.quartiles.length,4);
console.log('raceFlow suppression risk bands tests passed');
