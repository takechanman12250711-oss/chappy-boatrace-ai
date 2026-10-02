'use strict';
const assert = require('node:assert');
const { buildReport, median, mean } = require('../scripts/analyze-inner-upset-prerace-signals.cjs');

assert.strictEqual(median([3, 1, 2]), 2);
assert.strictEqual(median([1, 3, 2, 4]), 2.5);
assert.strictEqual(mean([1, 2, 3]), 2);

const report = buildReport();
assert.strictEqual(report.scope.dataset, 'discovery-only');
assert.strictEqual(report.scope.holdoutUsed, false);
assert.strictEqual(report.scope.productionChanged, false);
assert.strictEqual(report.total, 39);
assert.strictEqual(report.byPathMethod.reduce((sum, row) => sum + row.count, 0), 39);
assert.ok(report.rows.every(row => row.path === '1->3' || row.path === '1->4'));
assert.ok(report.rows.every(row => row.winningMethod === 'まくり' || row.winningMethod === 'まくり差し'));
assert.ok(report.rows.every(row => Number.isFinite(row.actualStDelta)));
for (const key of report.scope.runtimeCandidateInputs) {
  assert.ok(report.signalSummary[key]);
  assert.ok(report.signalSummary[key].positiveRate >= 0 && report.signalSummary[key].positiveRate <= 1);
}
console.log('inner upset pre-race signal tests passed');
