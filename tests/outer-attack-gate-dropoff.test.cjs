'use strict';
const assert = require('node:assert/strict');
const mod = require('../scripts/build-outer-attack-gate-dropoff.cjs');
const f = require('./helpers/report-input-fixture.cjs');
f.withArchive(root => {
  const records = Array.from({ length: 9 }, (_, i) => f.prediction(i + 1));
  const analyses = r => r.prediction.practicalSelection.frameRiseFallReplayBasis.analyses;
  delete records[1].prediction.practicalSelection;
  analyses(records[2])[0].courseStructureTheory.appliedIndex = 0;
  analyses(records[3])[2].indexes.st = 50;
  analyses(records[4])[2].indexes.raceFlow = 80;
  analyses(records[4])[3].indexes.raceFlow = 80;
  analyses(records[5])[2].indexes.exhibition = 50;
  analyses(records[6])[3] = { ...f.clone(analyses(records[6])[2]), boatNo: 4 };
  records[7].selectedAt = records[7].deadlineAt;
  analyses(records[8])[2].indexes.raceFlow = 80; // Different pairs satisfy separate gates; none matches all.
  const verification = [f.prediction(1), f.prediction(8)];
  delete verification[0].prediction.practicalSelection;
  f.saveDay(root, '20261003', records, verification);
  const r = f.parity(mod, root);
  assert.equal(r.productionChanged, false); assert.equal(r.automaticApplication, false);
  assert.equal(r.counts.total, 9); assert.equal(r.counts.preDeadline, 8);
  assert.deepEqual(r.rows.map(row => row.gate), ['active', 'basisInvalid', 'topNot1', 'noStAttackAdvantage', 'noFlowSuppression', 'noExhibitionAdvantage', 'ambiguous', 'inactiveOther']);
  assert.equal(r.counts.active, 1); assert.equal(r.counts.ambiguous, 1);
  assert.deepEqual(r.rows[0].matchedBoatNos, [3]); assert.deepEqual(r.rows[6].matchedBoatNos, [3, 4]);
});
console.log('outer attack dropoff: deterministic parity, all reachable gates, primary precedence passed');
