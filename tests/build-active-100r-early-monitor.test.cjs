'use strict';const assert=require('node:assert');const {build,progressVisibility}=require('../scripts/build-active-100r-early-monitor.cjs');const x=build();assert.strictEqual(x.productionChanged,false);assert.strictEqual(x.automaticProductionChange,false);const currentWindowCount=Number(x.reviewProgress?.currentWindowCount||0);assert.ok(Number.isFinite(currentWindowCount)&&currentWindowCount>=0);assert.ok(Number.isFinite(Number(x.scopedRaceCount))&&Number(x.scopedRaceCount)>=0);assert.ok(Number.isFinite(Number(x.matchedRows))&&Number(x.matchedRows)>=0);assert.ok(x.matchedRows<=x.scopedRaceCount);assert.ok(x.scopedRaceCount<=currentWindowCount);assert.strictEqual(x.duplicates,0);const visibility=progressVisibility(
 {generatedAt:'formal-time',source:{recordCount:3214,eligibleCount:0,excluded:{incompleteShadowV2:2180}}},
 {generatedAt:'all-race-time',cohorts:[
  {method:'current',active:true,latestPredictionAt:'2026-09-29T01:00:00Z',captured:5,settled:0,pending:5,practical:{hits:0,hitRate:null,recoveryRate:null}},
  {method:'prior',active:false,latestPredictionAt:'2026-09-28T01:00:00Z',captured:57,settled:54,pending:0,practical:{hits:16,hitRate:29.6,recoveryRate:84.85}}
 ]});
assert.strictEqual(visibility.formalInput.eligible,0);
assert.strictEqual(visibility.allRaceReview.activeCohort.pending,5);
assert.strictEqual(visibility.allRaceReview.activeCohort.settled,0);
assert.strictEqual(visibility.allRaceReview.latestSettledCohort.method,'prior');
assert.strictEqual(visibility.allRaceReview.latestSettledCohort.hits,16);
assert.ok(x.progressVisibility?.formalInput);
assert.ok(x.progressVisibility?.allRaceReview);
console.log(`active 100R early monitor passed: ${x.matchedRows}/100 settled, ${x.scopedRaceCount} scoped, ${currentWindowCount} eligible`);