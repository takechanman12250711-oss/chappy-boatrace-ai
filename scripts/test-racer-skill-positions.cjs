'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const support = require('./independent-partner-context-v1.cjs');
const builder = path.join(__dirname, 'build-race-stats.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'racer-positions-'));

function day(date, secondCount, closed = true) {
  const count = closed ? 12 : 1;
  return {
    date, source: 'boatrace-official', venues: [{ jcd: '06' }], venueCount: 1,
    collectedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T03:00:00Z`,
    raceCount: count, completedRaces: count, pendingRaces: 0, failedRaces: 0,
    races: Array.from({ length: count }, (_, i) => ({
      date, jcd: '06', raceNo: i + 1, source: 'boatrace-official', resultAvailable: true,
      finishers: [1, 2, 3, 4, 5, 6].map(boat => ({
        boat, registerNo: String(4000 + boat),
        rank: boat === 2 ? (i < secondCount ? 2 : 3)
          : boat === 3 ? (i < secondCount ? 3 : 2) : boat
      })),
      // Boat 2 actually entered course 5, and boat 5 entered course 2.
      starts: [1, 2, 3, 4, 5, 6].map(boat => ({
        boat, course: boat === 2 ? 5 : boat === 5 ? 2 : boat, st: 0.1
      })),
      winningMethod: '逃げ', trifecta: { payout: 1000 }
    }))
  };
}

try {
  fs.mkdirSync(path.join(root, 'data/results'), { recursive: true });
  const put = data => fs.writeFileSync(path.join(root, 'data/results', data.date + '.json'), JSON.stringify(data));
  const build = () => {
    execFileSync(process.execPath, [builder], { cwd: root });
    return support.load(root);
  };
  put(day('20241010', 3));
  put(day('20261010', 8));
  const source = build();
  const windows = source.data.racers['4002'].windows;
  for (const [key, starts, seconds, thirds] of [
    ['all3Years', 24, 11, 13], ['recent1Year', 12, 8, 4], ['previous2Years', 12, 3, 9]
  ]) {
    const c = windows[key].byCourse['5'];
    assert.ok(c, key + ': ' + JSON.stringify(windows));
    assert.equal(c.starts, starts);
    assert.equal(c.seconds, seconds);
    assert.equal(c.thirds, thirds);
    assert.equal(c.top3, c.wins + c.seconds + c.thirds);
    assert.equal(windows[key].byCourse['2'], undefined, 'must use actual course, not boat number');
  }
  const zero = source.data.racers['4005'].windows.all3Years.byCourse['2'];
  assert.equal(zero.starts, 24);
  assert.equal(zero.seconds, 0);
  assert.equal(zero.thirds, 0);
  assert.equal(zero.top3, 0);
  const winner = source.data.racers['4001'].windows.all3Years.byCourse['1'];
  assert.equal(winner.wins, 24);
  assert.equal(winner.seconds + winner.thirds, 0);
  for (const racer of Object.values(source.data.racers)) {
    for (const w of Object.values(racer.windows)) {
      for (const c of Object.values(w.byCourse)) {
        assert.equal(c.top3, c.wins + c.seconds + c.thirds);
        assert.ok(c.top3 <= c.starts);
      }
    }
  }
  put(day('20261011', 1, false));
  assert.deepEqual(build().data.racers, source.data.racers, 'unclosed day must not leak into counts');

  // Old capture deliberately ignores new counts; no change to sealed consumer contracts.
  const legacy = structuredClone(source);
  for (const racer of Object.values(legacy.data.racers)) {
    for (const w of Object.values(racer.windows)) {
      for (const c of Object.values(w.byCourse)) { delete c.seconds; delete c.thirds; }
    }
  }
  const input = { date: '20261011', jcd: '06', raceNo: 1, raceKey: '20261011-06-1',
    observedAt: new Date(Date.now() + 1000).toISOString(),
    rows: day('20261010', 8).races[0].starts.map(({ boat, course }) => ({ boat, course })) };
  const context = { inputHash: 'test', contextHash: 'test',
    officialEntries: input.rows.map(row => ({ ...row, registerNo: String(4000 + row.boat) })) };
  const capture = value => support.capture({ entries: [] }, input, context, value);
  const current = capture(source);
  assert.equal(current.history.status, 'available');
  support.validate(current, input, context);
  assert.deepEqual(current, capture(legacy), 'extra keys must not change legacy projection under identical source identity');
  console.log('racer skill position counts: periods, actual course, zeros, cutoff, legacy projection ok');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
