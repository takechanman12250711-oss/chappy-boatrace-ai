'use strict';

const assert = require('node:assert');
const {
  actualStartByBoat,
  buildCourseMissConditionBreakdown,
  parseRaceKey,
  toMarkdown,
} = require('../scripts/analyze-course-miss-conditions.cjs');

{
  const parsed = parseRaceKey('20260801-24-7');
  assert.deepStrictEqual(parsed, { date: '20260801', venueCode: '24', raceNo: 7 });
}

{
  assert.strictEqual(actualStartByBoat({ starts: [{ boat: 3, st: 0.07 }] }, 3), 0.07);
  assert.strictEqual(actualStartByBoat({ starts: [{ boat: 3, st: 0.07 }] }, 2), null);
}

{
  const report = buildCourseMissConditionBreakdown();
  assert.strictEqual(report.schemaVersion, 2);
  assert.strictEqual(report.scope.holdoutUsed, false);
  assert.strictEqual(report.scope.productionChanged, false);
  assert.strictEqual(report.scope.decisiveMethodStatus, 'official-result-joined');
  assert.strictEqual(report.total, 119);
  assert.strictEqual(
    report.byPath.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.strictEqual(
    report.byVenue.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.strictEqual(
    report.byWinningMethod.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.strictEqual(
    report.byPathWinningMethod.reduce((sum, row) => sum + row.count, 0),
    report.total
  );
  assert.ok(report.diagnostics.officialWinningMethodKnownCount > 0);
  assert.ok(report.rows.every(row => row.raceKey && row.predictedBoat !== row.winnerBoat));
  assert.ok(report.rows.every(row => typeof row.winningMethod === 'string'));
  assert.ok(toMarkdown(report).includes('予測艇→実勝者 × 決まり手'));
}

console.log('course miss condition breakdown tests passed');
