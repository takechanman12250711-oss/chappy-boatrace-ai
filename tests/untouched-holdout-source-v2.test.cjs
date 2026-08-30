'use strict';

const assert = require('node:assert/strict');
const resolver = require('../scripts/resolve-st-role-attack-exhibition-holdout-v2.cjs');

{
  const finalReport = {
    analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
    holdoutConsumed: true,
    thresholdSearchPerformed: false,
    productionChanged: false,
    automaticApplication: false,
    nextStep: 'reject-st-role-attack-exhibition-composite'
  };
  assert.equal(resolver.isFinalReport(finalReport), true);
  assert.equal(resolver.isFinalReport({ ...finalReport, holdoutConsumed: false }), false);
  assert.equal(resolver.isFinalReport({ ...finalReport, nextStep: 'blocked-anything' }), false);
}

{
  const nested = {
    discovery: {
      rows: [
        { raceKey: '20260801-01-1', winnerBoatNo: 1, analyses: [{ boatNo: 1 }] }
      ]
    },
    sealedHoldout: {
      rows: [
        { raceKey: '20260802-01-1', winnerBoatNo: 3, analyses: [{ boatNo: 1 }, { boatNo: 3 }] },
        { raceKey: '20260802-01-2', winnerBoatNo: 1, analyses: [{ boatNo: 1 }, { boatNo: 4 }] }
      ]
    }
  };
  const arrays = resolver.collectRowArrays(nested, 'fixture');
  const labels = arrays.map((row) => row.label);
  assert.ok(labels.some((label) => label.includes('discovery.rows')));
  assert.ok(labels.some((label) => label.includes('sealedHoldout.rows')));
}

assert.ok(resolver.semanticScore('module.loadSealedHoldout') > resolver.semanticScore('module.loadDiscovery'));
assert.ok(resolver.semanticScore('json:data/effective-score-validation.json') >= 60);
assert.ok(resolver.semanticScore('tests/fixture-holdout.json') < resolver.semanticScore('data/holdout.json'));
assert.equal(resolver.isBlockedStep('blocked-resolve-source'), true);
assert.equal(resolver.isBlockedStep('reject-fixed-rule'), false);

console.log('untouched holdout source v2 tests passed');
