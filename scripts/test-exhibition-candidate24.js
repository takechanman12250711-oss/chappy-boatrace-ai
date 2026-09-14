'use strict';
const assert = require('node:assert/strict');
const { exhibitionSnapshot, requireExhibition } = require('./note-exhibition');
const { buildReport } = require('./build-candidate24-report');
const time = '2030-09-14T06:00:00Z';
const raw = { entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
  startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0, mappingSource: 'official-start-image' })) };
assert.equal(exhibitionSnapshot(raw, time).ready, true, 'ST 0.00 is valid');
for (const mutate of [x => x.entries[0].exhibition.displayTime = null,
  x => x.startExhibition.pop(), x => x.startExhibition[0].mappingSource = 'legacy-course-order',
  x => x.entries[0].boat = 2]) {
  const x = structuredClone(raw); mutate(x); assert.equal(exhibitionSnapshot(x, time).ready, false);
}
const record = { selectedAt: time, deadlineAt: '2030-09-14T07:00:00Z', exhibitionSnapshot: exhibitionSnapshot(raw, time) };
requireExhibition(record);
assert.throws(() => requireExhibition({ ...record, exhibitionSnapshot: undefined }), /not_verified/);
assert.throws(() => requireExhibition({ ...record, selectedAt: '2030-09-14T05:00:00Z' }), /not_verified/);
const make = (r, pool, practical) => ({ date: '20300914', raceKey: `20300914-01-${r}`,
  selectedAt: time, deadlineAt: record.deadlineAt, prediction: { candidate24Tickets: pool, practicalTickets: practical } });
const result = (r, ticket, payout) => ({ source: 'boatrace-official', date: '20300914', jcd: '01', raceNo: r,
  resultAvailable: true, trifecta: { combination: ticket, payout } });
const rows = [make(1, ['1-2-3','1-2-4'], ['1-2-4']), make(2, ['1-2-3'], ['1-2-3'])];
const before = JSON.stringify(rows);
const report = buildReport([...rows, rows[0], { ...rows[0], selectedAt: '2030-09-14T08:00:00Z' }],
  [result(1, '1-2-3', 900), result(2, '2-3-1', 1200)]);
assert.equal(report.candidate24.races, 2);
assert.equal(report.candidate24.hitRate, 50);
assert.equal(report.candidate24.stake, 300, 'use actual point count, do not pad to 24');
assert.equal(report.candidate24.recoveryRate, 300);
assert.equal(report.practical.hitRate, 0);
assert.equal(report.practical.stake, 200);
assert.equal(JSON.stringify(rows), before, 'preserve practical predictions');
const excluded = buildReport(rows, [{ ...result(1, '1-2-3', 900), refund: true }, result(2, '2-3-1', null)]);
assert.equal(excluded.candidate24.races, 0);
assert.equal(excluded.candidate24.hitRate, null);
assert.equal(excluded.excludedRefundOrVoid, 1);
assert.equal(excluded.unknownPayout, 1);
console.log('exhibition waiting, pre-deadline proof, distinct candidate/practical denominators, deduplication and returns passed');
