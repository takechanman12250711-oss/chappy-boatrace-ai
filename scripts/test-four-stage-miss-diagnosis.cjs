'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const m=require('./build-four-stage-miss-diagnosis.cjs');
test('four-stage diagnosis builds without changing production',()=>{const r=m.build();assert.equal(r.productionChanged,false);assert.equal(r.automaticApplication,false);assert.ok(r.summary.races>=r.summary.hits);assert.equal(r.summary.misses,r.summary.races-r.summary.hits);assert.equal(r.summary.headMiss+r.summary.secondMiss+r.summary.thirdMiss,r.summary.misses);});