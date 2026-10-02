'use strict';
const assert=require('assert');
const {build}=require('../scripts/analyze-outer-attack-composite-signal.cjs');
const r=build();
assert.strictEqual(r.scope.holdoutUsed,false);assert.strictEqual(r.scope.productionChanged,false);
assert.strictEqual(r.neutralization.net,0);assert.strictEqual(r.neutralization.changedTopBoatCount,0);
assert.ok(r.candidateCount>0);assert.ok(r.best);assert.strictEqual(r.best.quartiles.length,4);
assert.ok(r.allFourBlockCandidates.length>0);
console.log('outer attack composite signal tests passed');
