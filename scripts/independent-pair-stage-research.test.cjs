'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const research = require('./independent-pair-stage-research.cjs');
const candidate = require('./independent-autonomous-candidate.cjs');
const context = require('./independent-judgment-context.cjs');
const flow = require('./independent-flow-roles-v1.cjs');
const support = require('./independent-partner-context-v1.cjs');
const water = require('./independent-route-water-v1.cjs');
const selector = require('./independent-partner-selector-v2.cjs');
const clock = Date.parse('2030-10-06T01:00:00Z');
function fixture() {
  const target = { jcd: '14', raceNo: 5, deadlineAt: '2030-10-06T01:20:00Z' };
  const data = { ok: true, source: 'boatrace-official', date: '20301006', stadiumCode: '14', raceNo: 5,
    fetchedAt: new Date(clock - 1000).toISOString(),
    entryUrl: 'https://www.boatrace.jp/owpc/pc/race/racelist?jcd=14&rno=5&hd=20301006',
    beforeInfoUrl: 'https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=14&rno=5&hd=20301006',
    entries: [1, 2, 3, 4, 5, 6].map(boat => ({ boat, registerNo: String(5100 + boat), avgSt: .15, className: 'B1',
      local2Rate: 30, local3Rate: 50, exhibition: { displayTime: 6.7 + boat / 100 },
      officialStartRank: { version: 'official-course-start-rank-v1', status: 'available', source: 'boatrace-official-course',
        registerNo: String(5100 + boat), sourceUrl: `https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${5100 + boat}`,
        sourceSha256: 'a'.repeat(64), fetchedAt: new Date(clock - 2000).toISOString(),
        population: 'general-only-unconfirmed', referenceOnly: true, byCourse: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 } } })),
    startExhibition: [1, 2, 3, 4, 5, 6].map(boat => ({ boat, course: boat, st: .1 + boat / 100, marker: '', mappingSource: 'official-start-image' })) };
  const history = { schemaVersion: 1, source: 'boatrace-official', generatedAt: '2030-10-05T01:00:00Z',
    firstDate: '20271006', lastDate: '20301005', analysisWindow: { latestDate: '20301005' }, thresholds: { minimumSamples: 12 }, racers: {} };
  for (const e of data.entries) {
    const byCourse = Object.fromEntries([1, 2, 3, 4, 5, 6].map(course => [course, { course, starts: 30, wins: 5, top3: 18,
      winningMethods: [{ key: '逃げ', count: 5 }] }]));
    history.racers[e.registerNo] = { registerNo: e.registerNo, windows: { recent1Year: { byCourse }, previous2Years: { byCourse } } };
  }
  return { data, target, history };
}
function run(x) {
  const i = candidate.officialInput(x.data, x.target, clock), c = context.capture(x.data, i), f = flow.judge(i, c);
  const s = support.capture(x.data, i, c, { sha256: candidate.hash(JSON.stringify(x.history)), data: x.history });
  const w = water.judge(i, c, f), b = selector.judge(i, c, f, s, w);
  return { args: [i, c, f, s, w, b], baseline: b, result: research.judge(i, c, f, s, w, b) };
}
const a = { second: 2, third: 3 }, b = { second: 4, third: 5 };
function comparisons(left, right) {
  return [{ position: 2, a: 2, b: 4, evaluated: left.map(([stage, outcome]) => ({ stage, outcome })) },
    { position: 3, a: 3, b: 5, evaluated: right.map(([stage, outcome]) => ({ stage, outcome })) }];
}
test('pair comparison stops at the earliest unequal stage, not two independent final rankings', () => {
  const cs = comparisons([['start', -1]], [['start', 0], ['exhibition', 1]]);
  const r = research.comparePairs(a, b, cs);
  assert.equal(r.outcome, -1); assert.equal(r.decidingStage, 'start'); assert.equal(r.evaluated.length, 1);
  assert.equal(research.comparePairs(b, a, cs).outcome, 1);
});
test('conflict or unknown in either position is not cancelled or resolved by lower stages', () => {
  for (const value of [1, null]) {
    const r = research.comparePairs(a, b, comparisons([['start', -1]], [['start', value]]));
    assert.equal(r.outcome, null); assert.equal(r.evaluated.length, 1);
  }
  assert.throws(() => research.comparePairs(a, b, []), /comparison_missing/);
});
test('same boat is neutral, upper-stage ties advance and exact full ties stay ties', () => {
  const tied = research.STAGES.map(s => [s, 0]);
  assert.equal(research.comparePairs(a, b, comparisons(tied, tied)).outcome, 0);
  assert.equal(research.comparePairs(a, a, []).outcome, 0);
  assert.equal(research.comparePairs(a, b, comparisons([['start', 0], ['exhibition', -1]], [['start', 0], ['exhibition', 0]])).decidingStage, 'exhibition');
});
test('validated fixture enumerates 20 pairs, 190 comparisons, same budget and immutable source', () => {
  const r = run(fixture()), before = JSON.stringify(r.args);
  const freeze = x => { if (x && typeof x === 'object') { Object.freeze(x); Object.values(x).forEach(freeze); } };
  r.args.forEach(freeze);
  assert.deepEqual(research.judge(...r.args), r.result); assert.equal(JSON.stringify(r.args), before);
  assert.equal(r.result.pool.length, 20); assert.equal(r.result.comparisons.length, 190);
  assert.equal(r.result.status, 'selected'); assert.equal(r.result.tickets.length, r.baseline.tickets.length);
  assert.deepEqual(new Set(r.result.tickets), new Set(r.baseline.tickets));
  assert.equal(r.result.changed, false); assert.equal(r.result.usableForPrediction, false);
  assert.equal(r.result.routeCompatibilityInferred, false);
});
test('source tampering is rejected; missing history or unresolved main never creates a fallback', () => {
  const r = run(fixture()); r.args[5].tickets = ['6-5-4'];
  assert.throws(() => research.judge(...r.args), /replay_mismatch/);
  const x = fixture(); x.history.lastDate = '20301006';
  assert.equal(run(x).result.reason, 'source-pool-not-evaluated');
  const y = fixture(); y.data.startExhibition[0].marker = 'F';
  assert.equal(run(y).result.reason, 'source-pool-not-evaluated');
});
test('boat renumbering and input permutations preserve selections by actual course', () => {
  const x = fixture(), initial = run(x), map = { 1: 5, 2: 4, 3: 6, 4: 2, 5: 1, 6: 3 };
  x.data.entries.forEach(e => e.boat = map[e.boat]); x.data.startExhibition.forEach(e => e.boat = map[e.boat]);
  const r = run(x);
  assert.deepEqual(new Set(r.result.tickets), new Set(initial.result.tickets.map(t => t.split('-').map(n => map[n]).join('-'))));
  x.data.entries.reverse(); x.data.startExhibition.reverse(); assert.deepEqual(run(x), r);
});
test('results, odds and ordinary AI tickets never enter candidate generation', () => {
  const x = fixture(), initial = run(x);
  Object.assign(x.data, { result: { actual: '6-5-4' }, odds: { '6-5-4': 10000 }, prediction: { tickets: ['6-5-4'] } });
  assert.deepEqual(run(x), initial);
});
test('fixed 300-case synthetic probe produces no different equal-budget selection', () => {
  // These are generated contracts, not races or performance evidence. No result fields.
  let seed = 12983;
  const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const counts = { baselineSelected: 0, changed: 0, skipped: 0, unchanged: 0 };
  for (let n = 0; n < 300; n++) {
    const x = fixture();
    x.data.startExhibition[0].st = .01;
    x.data.entries[0].exhibition.displayTime = 6.6;
    x.data.entries[0].officialStartRank.byCourse[1] = 1;
    for (let i = 1; i < 6; i++) {
      x.data.startExhibition[i].st = .12 + rand(3) / 100;
      x.data.entries[i].exhibition.displayTime = 6.75 + rand(3) / 100;
      x.data.entries[i].officialStartRank.byCourse[i + 1] = 3 + rand(2);
      x.data.entries[i].local2Rate = 20 + rand(3) * 5;
      x.data.entries[i].local3Rate = 50 + rand(3) * 5;
    }
    const r = run(x);
    if (r.baseline.status === 'selected') {
      counts.baselineSelected++;
      if (r.result.status === 'skipped') {
        counts.skipped++;
        assert.equal(r.result.reason, 'equal-budget-boundary-unresolved');
        assert.deepEqual(r.result.tickets, []);
      } else if (r.result.changed) counts.changed++;
      else counts.unchanged++;
    }
  }
  assert.deepEqual(counts, { baselineSelected: 297, changed: 0, skipped: 7, unchanged: 290 });
});
