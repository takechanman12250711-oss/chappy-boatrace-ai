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

test('a re-run keeps races already saved in the morning and only fills the missing ones', async () => {
  const first = await day.collect({ date: '20261107', schedule, fetch: fakeFetch(rno => (rno === 12 ? null : SOLID)), gapMs: 0 });
  const second = fakeFetch(() => ROUGH);
  const out = await day.collect({ date: '20261107', schedule, fetch: second, gapMs: 0, existing: first });
  assert.equal(second.seen.length, 1); // only 12R was fetched again
  assert.ok(second.seen[0].includes('rno=12'));
  assert.deepEqual(out.venues[0].races[0], first.venues[0].races[0]);
  assert.equal(out.venues[0].races[11].lookout.label, 'rough');
  assert.equal(out.raceCount, 12);
  const other = await day.collect({ date: '20261108', schedule, fetch: fakeFetch(() => ROUGH), gapMs: 0, existing: first });
  assert.equal(other.venues[0].races[0].lookout.label, 'rough'); // another day's file is never reused
});

test('nightly check grades only saved lookouts against official payouts', t => {
  const checks = require('../scripts/data-site/build-checks.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'days')); fs.mkdirSync(path.join(dir, 'results'));
  const race = (raceNo, label) => ({ raceNo, boats: [{}], lookout: label ? { label } : null });
  fs.writeFileSync(path.join(dir, 'days', '20261107.json'), JSON.stringify({ date: '20261107', venues: [{ jcd: '02', place: '戸田',
    races: [race(1, 'rough'), race(2, 'rough'), race(3, 'solid'), race(4, 'mixed'), race(5, null), race(6, 'solid')] }] }));
  fs.writeFileSync(path.join(dir, 'days', '20261108.json'), JSON.stringify({ date: '20261108', venues: [] })); // no results yet
  const res = (raceNo, payout) => ({ jcd: '02', raceNo, resultAvailable: true, void: false, trifecta: { payout, combination: '1-2-3' } });
  fs.writeFileSync(path.join(dir, 'results', '20261107.json'), JSON.stringify({ races: [res(1, 12000), res(2, 900), res(3, 1500), res(4, 7000), res(5, 30000),
    { jcd: '02', raceNo: 6, resultAvailable: true, void: true }] }));
  const out = checks.build({ daysDir: path.join(dir, 'days'), resultsDir: path.join(dir, 'results') });
  assert.ok(checks.isChecksFile(out));
  assert.equal(out.days.length, 1);
  assert.equal(out.cumulative.races, 4); // unlabelled 5R and void 6R are not counted
  assert.deepEqual(out.cumulative.rough, { races: 2, hit: 1, rate: 50 });
  assert.deepEqual(out.cumulative.solid, { races: 1, hit: 1, rate: 100 });
  assert.equal(out.cumulative.baseRoughRate, 50);
  assert.equal(out.latest.races.find(r => r.raceNo === 2).correct, false);
  assert.equal(out.latest.races.find(r => r.raceNo === 4).correct, null);
});

test('deadline comes from the race card when the schedule has none; menu text is never used as a title', async () => {
  const noDeadlines = { ok: true, venues: [{ jcd: '24', place: '大村', eventGrade: '一般', eventTitle: 'テスト杯', eventSession: 'night', races: [] }] };
  const out = await day.collect({ date: '20261107', schedule: noDeadlines, fetch: fakeFetch(() => SOLID), gapMs: 0 });
  assert.equal(out.venues[0].races[0].deadline, '15:00');
  assert.equal(out.venues[0].races[1].deadline, '15:30');
  assert.equal(out.venues[0].races[11].deadline, '20:30');
  assert.equal(out.venues[0].races[0].title, '一般戦');
  assert.equal(day.raceTitle({ title: '本日の払戻金一覧 レーサー検索 ライブ リプレイ' }), '');
  // a saved race without a deadline gets only its deadline filled; the lookout stays as saved
  const saved = JSON.parse(JSON.stringify(out));
  saved.venues[0].races[0].deadline = '';
  const again = await day.collect({ date: '20261107', schedule: noDeadlines, fetch: fakeFetch(() => ROUGH), gapMs: 0, existing: saved });
  assert.equal(again.venues[0].races[0].deadline, '15:00');
  assert.equal(again.venues[0].races[0].lookout.label, 'solid');
  assert.equal(again.venues[0].races[0].boats[0].name, '山田 一郎');
});

test('pre-race info is fetched only for races near the deadline and saved before it', async () => {
  const before = require('../scripts/data-site/collect-before.cjs');
  const { beforeinfo } = require('./fixtures/data-site-racelist.cjs');
  const morning = await day.collect({ date: '20261107', schedule, fetch: fakeFetch(rno => (rno % 2 ? SOLID : ROUGH)), gapMs: 0 });
  // 1R 15:00, 2R 15:30. Now = 14:30 JST → only 1R (30 min) is inside the 50-minute window... and 2R (60 min) is not.
  const now = Date.parse('2026-11-07T14:30:00+09:00');
  const f1 = fakeFetch(() => beforeinfo({ order: [1, 3, 2, 4, 5, 6], wind: 6 }));
  const run1 = await before.collect({ date: '20261107', day: morning, now, fetch: f1, gapMs: 0 });
  assert.equal(f1.seen.length, 1);
  assert.ok(f1.seen[0].startsWith('https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=1&jcd=24&hd=20261107'));
  const r1 = run1.report.races['24-1'];
  assert.equal(r1.boats[2].exRank, 1);           // 6.70 is the fastest exhibition
  assert.equal(r1.boats[3].tilt, 2);
  assert.equal(r1.boats[3].parts, 'ピストン');
  assert.deepEqual(r1.start.map(s => s.boat), [1, 3, 2, 4, 5, 6]);
  assert.equal(r1.weather.windSpeed, 6);
  assert.equal(r1.weather.windDirection, '向かい風');
  assert.ok(['rough', 'mixed', 'solid'].includes(r1.lookout.label));
  assert.ok(before.isBeforeFile(run1.report));
  // 20 minutes later: 1R is complete and kept as is, 2R (40 min) is now fetched.
  const f2 = fakeFetch(() => beforeinfo({ wind: 1 }));
  const run2 = await before.collect({ date: '20261107', day: morning, now: now + 20 * 60000, fetch: f2, gapMs: 0, existing: run1.report });
  assert.equal(f2.seen.length, 1);
  assert.ok(f2.seen[0].includes('rno=2'));
  assert.deepEqual(run2.report.races['24-1'], r1);
  // a page fetched before the exhibition (no times) is not saved
  const empty = await before.collect({ date: '20261107', day: morning, now, fetch: fakeFetch(() => '<html>展示前</html>'), gapMs: 0 });
  assert.equal(Object.keys(empty.report.races).length, 0);
  assert.equal(before.isBeforeFile(empty.report), false);
  // after the deadline nothing is fetched
  const late = fakeFetch(() => beforeinfo());
  await before.collect({ date: '20261107', day: morning, now: Date.parse('2026-11-07T20:35:00+09:00'), fetch: late, gapMs: 0 });
  assert.equal(late.seen.length, 0);
});
