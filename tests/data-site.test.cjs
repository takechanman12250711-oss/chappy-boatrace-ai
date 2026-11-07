'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const day = require('../scripts/data-site/collect-day.cjs');
const venues = require('../scripts/data-site/build-venues.cjs');
const { target } = require('../scripts/data-site/persist.cjs');
const { SOLID, ROUGH } = require('./fixtures/data-site-racelist.cjs');

function fakeFetch(pages) {
  const seen = [];
  const impl = async url => {
    seen.push(url);
    const rno = Number(new URL(url).searchParams.get('rno'));
    const html = pages(rno);
    return html ? { ok: true, status: 200, text: async () => html } : { ok: false, status: 404, text: async () => '' };
  };
  impl.seen = seen;
  return impl;
}
const schedule = { ok: true, venues: [{ jcd: '24', place: '大村', eventGrade: '一般', eventTitle: 'テスト杯', eventSession: { day: 2 },
  races: [{ raceNo: 1, deadline: '15:00' }, { raceNo: 2, deadline: '15:30' }] }] };

test('collects every race of the day, classifies it and ranks motors without network', async () => {
  const fetchImpl = fakeFetch(rno => (rno === 12 ? null : rno % 2 ? SOLID : ROUGH));
  const out = await day.collect({ date: '20261107', schedule, fetch: fetchImpl, gapMs: 0 });
  assert.equal(fetchImpl.seen.length, 12);
  assert.ok(fetchImpl.seen.every(u => u.startsWith('https://www.boatrace.jp/owpc/pc/race/racelist?') && u.includes('hd=20261107') && u.includes('jcd=24')));
  assert.ok(day.isDayFile(out));
  assert.equal(out.raceCount, 11);
  assert.equal(out.failedRaceCount, 1);
  const v = out.venues[0];
  assert.equal(v.place, '大村');
  assert.equal(v.races[0].deadline, '15:00');
  assert.equal(v.races[0].boats[0].name, '山田 一郎');
  assert.equal(v.races[0].lookout.label, 'solid');
  assert.ok(v.races[0].lookout.reasons.includes('1号艇がA1級'));
  assert.equal(v.races[1].lookout.label, 'rough');
  assert.ok(v.races[1].lookout.reasons.some(r => r.includes('A1が2人')));
  assert.equal(v.races[11].boats.length, 0);
  assert.equal(v.motors[0].motorNo, 11); // 48.00 is the best motor in the fixtures
  assert.equal(v.motors[0].rank, 1);
  assert.equal(v.motors[0].races.length, 6);
});

test('a day with nothing collected is never published', async () => {
  const out = await day.collect({ date: '20261107', schedule, fetch: fakeFetch(() => null), gapMs: 0 });
  assert.equal(day.isDayFile(out), false);
  assert.equal(target('day', '20261107').isValid(out), false);
  assert.equal(day.outputPath('20261107'), 'data/site/days/20261107.json');
});

test('venue summary counts in-course wins, rough and manshu races from official results', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venues-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const race = (jcd, winnerBoat, payout, method) => ({ jcd, resultAvailable: true, void: false, winningMethod: method,
    trifecta: { payout }, finishers: [{ rank: 1, boat: winnerBoat }],
    starts: [1, 2, 3, 4, 5, 6].map(b => ({ boat: b, course: b })) });
  fs.writeFileSync(path.join(dir, '20261105.json'), JSON.stringify({ races: [race('02', 1, 1200, '逃げ'), race('02', 4, 23000, 'まくり')] }));
  fs.writeFileSync(path.join(dir, '20261106.json'), JSON.stringify({ races: [race('02', 1, 6000, '逃げ'), { jcd: '02', void: true }] }));
  const out = venues.build({ resultsDir: dir });
  const toda = out.venues.find(v => v.jcd === '02');
  assert.equal(toda.races, 3);
  assert.equal(toda.inWinRate, 66.7);
  assert.equal(toda.courseWinRates[3], 33.3);
  assert.equal(toda.roughRate, 66.7);
  assert.equal(toda.manshuRate, 33.3);
  assert.equal(toda.medianPayout, 6000);
  assert.equal(toda.methods.find(m => m.method === '逃げ').share, 66.7);
  assert.equal(venues.isVenuesFile(out), false); // fewer than 20 venues is rejected
});

test('the published venue file covers all 24 venues', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', venues.OUTPUT), 'utf8'));
  assert.ok(venues.isVenuesFile(file));
  assert.equal(file.venues.length, 24);
});
