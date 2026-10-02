'use strict';
const assert=require('node:assert');
const mod=require('../scripts/build-weak-theory-cause-breakdown.cjs');
const x=mod.build();
assert.strictEqual(x.productionChanged,false);
assert.strictEqual(x.automaticProductionChange,false);
assert.strictEqual(x.selectionContract.minimumEvaluated,20);
assert.strictEqual(x.selectionContract.weakRecoveryRateBelow,80);
assert.strictEqual(x.summaries.length,x.weakTheoryKeys.length);
for(const row of x.summaries){
  assert.ok(['BROAD_WEAKNESS','VENUE_CONCENTRATED','MIXED'].includes(row.classification));
  assert.ok(row.weakVenueCount<=row.venueCount);
  assert.ok(row.worstVenues.length<=5);
  assert.ok(row.bestVenues.length<=5);
}
console.log('weak theory cause breakdown passed');
