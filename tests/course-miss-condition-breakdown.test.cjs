'use strict';

const assert = require('node:assert');
const {
  buildCourseMissConditionBreakdown,
  parseRaceKey,
  toMarkdown,
} = require('../scripts/analyze-course-miss-conditions.cjs');

{
  const parsed = parseRaceKey('20260801-24-7');
  assert.deepStrictEqual(parsed, { date: '20260801', venueCode: '24', raceNo: 7 });
}

{
  const report = buildCourseMissConditionBreakdown();
  assert.strictEqual(report.scope.holdoutUsed, false);
  assert.strictEqual(report.scope.productionChanged, false);
  assert.strictEqual(
    report.scope.decisiveMethodStatus,
    'not-collected-in-current-discovery-contract'
  );
  assert.strictEqual(report.total, 119);
  assert.strictEqual(
    report.byPath.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.strictEqual(
    report.byVenue.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.ok(report.rows.every(row => row.raceKey && row.predictedBoat !== row.winnerBoat));
  assert.ok(toMarkdown(report).includes('決まり手'));
}

console.log('course miss condition breakdown tests passed');
