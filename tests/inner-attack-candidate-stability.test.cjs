'use strict';
const assert=require('assert');
const {build,CANDIDATE}=require('../scripts/check-inner-attack-candidate-stability.cjs');
const r=build();
assert.strictEqual(r.scope.holdoutUsed,false);assert.strictEqual(r.scope.productionChanged,false);assert.deepStrictEqual(r.scope.candidate,CANDIDATE);
assert.strictEqual(r.overall.raceCount,258);assert.strictEqual(r.overall.baselineHits,124);assert.strictEqual(r.overall.candidateHits,126);assert.strictEqual(r.overall.net,2);
assert.strictEqual(r.chronologicalQuartiles.length,4);assert.strictEqual(r.chronologicalQuartiles.reduce((s,x)=>s+x.raceCount,0),258);
console.log('inner attack candidate stability tests passed');
