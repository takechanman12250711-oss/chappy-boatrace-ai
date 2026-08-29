'use strict';

const assert = require('assert');
const {
  buildCourseMissConditionBreakdown,
  parseRaceKey,
  toMarkdown,
} = require('../scripts/analyze-course-miss-conditions.cjs');

function analysis(boat, values = {}) {
  return {
    boat,
    courseIndex: 0,
    raceFlowIndex: 0,
    startIndex: 0,
    exhibitionIndex: 0,
    remainIndex: 0,
    localIndex: 0,
    skillIndex: 0,
    motorIndex: 0,
    ...values,
  };
}

{
  const parsed = parseRaceKey('20260801-24-7');
  assert.deepStrictEqual(parsed, { date: '20260801', venueCode: '24', raceNo: 7 });
}

{
  const rows = [
    {
      raceKey: '20260801-24-7',
      winnerBoat: 2,
      analyses: [
        analysis(1, { courseIndex: 80, raceFlowIndex: 50 }),
        analysis(2, { courseIndex: 60, raceFlowIndex: 45, startIndex: 40 }),
        analysis(3, { courseIndex: 20 }),
      ],
    },
    {
      raceKey: '20260801-24-8',
      winnerBoat: 1,
      analyses: [
        analysis(1, { courseIndex: 80 }),
        analysis(2, { courseIndex: 20 }),
      ],
    },
  ];

  const report = buildCourseMissConditionBreakdown(rows);
  assert.strictEqual(report.scope.holdoutUsed, false);
  assert.strictEqual(report.scope.decisiveMethodStatus, 'not_collected_in_discovery_contract');
  assert.strictEqual(report.total, 1);
  assert.strictEqual(report.byVenue[0].key, '24');
  assert.strictEqual(report.byPath[0].key, '1>2');
  assert.strictEqual(report.rows[0].winnerRank, 2);
  assert.ok(toMarkdown(report).includes('決まり手'));
}

console.log('course miss condition breakdown tests passed');
