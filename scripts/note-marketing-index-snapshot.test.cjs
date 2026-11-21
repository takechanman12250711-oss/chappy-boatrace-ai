'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./note-marketing-content');
const { indexSnapshotCurrent } = require('./note-marketing-index-snapshot.cjs');
const config = require('../config/note-marketing.json');
const url = n => `https://note.com/great_robin3243/n/n${n}`;
const row = (n, raceNo, deadline, price) => ({ raceKey: `20261006-18-${raceNo}`, articleSeries: 'normal', place: '徳山', raceNo,
  deadlineAt: deadline, publishedAt: '2026-10-06T10:00:00+09:00', ticketCount: 8, price, url: url(n),
  resultUrl: `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261006&jcd=18&rno=${raceNo}` });
const verified = (rows, at) => { const state = { rows }; state.articles = { index: { hash: c.hash(c.publishedIndexBody(state, config, at)), verifiedAt: new Date(at).toISOString() } }; return state; };
const t = s => Date.parse(`2026-10-06T${s}+09:00`);

test('same rendering is current, as before', () => {
  const state = verified([row('aa', 8, '2026-10-06T12:00:00+09:00', 0)], t('11:50:00'));
  assert.equal(indexSnapshotCurrent(state, config, t('11:55:00')), true);
});
test('a free article deadline passing after verification does not stop X', () => {
  const state = verified([row('aa', 8, '2026-10-06T12:00:00+09:00', 0), row('bb', 9, '2026-10-06T12:30:00+09:00', 0)], t('11:50:00'));
  assert.notEqual(state.articles.index.hash, c.hash(c.publishedIndexBody(state, config, t('12:05:00'))), 'the plain hash check would stop here');
  assert.equal(indexSnapshotCurrent(state, config, t('12:05:00')), true);
  assert.equal(indexSnapshotCurrent(state, config, t('12:35:00')), true, 'two free deadlines crossed');
});
test('a paid or unknown-price article crossing its deadline still stops', () => {
  for (const price of [200, undefined, null, '0']) {
    const state = verified([row('aa', 8, '2026-10-06T12:00:00+09:00', price)], t('11:50:00'));
    assert.equal(indexSnapshotCurrent(state, config, t('12:00:00')), false, String(price));
  }
  const mixed = verified([row('aa', 8, '2026-10-06T12:00:00+09:00', 0), row('bb', 9, '2026-10-06T12:01:00+09:00', 200)], t('11:50:00'));
  assert.equal(indexSnapshotCurrent(mixed, config, t('12:00:30')), true);
  assert.equal(indexSnapshotCurrent(mixed, config, t('12:01:00')), false, 'paid row in the crossed set');
});
test('any other content difference still stops', () => {
  const rows = [row('aa', 8, '2026-10-06T12:00:00+09:00', 0)];
  const state = verified(rows, t('11:50:00'));
  const added = { ...state, rows: [...rows, row('cc', 10, '2026-10-06T13:00:00+09:00', 0)] };
  assert.equal(indexSnapshotCurrent(added, config, t('12:05:00')), false, 'new article not on the page');
  const course = { ...state, korogashiIndex: { version: 'note-korogashi-index-v1', text: 'コロがしコース\n変更' } };
  assert.equal(indexSnapshotCurrent(course, config, t('12:05:00')), false, 'course text changed');
  assert.equal(indexSnapshotCurrent({ ...state, articles: { index: { hash: 'x' } } }, config, t('12:05:00')), false);
  assert.equal(indexSnapshotCurrent({ rows }, config, t('12:05:00')), false, 'no verified hash');
  assert.equal(indexSnapshotCurrent(state, config, NaN), false);
});
test('a snapshot from the previous day is never accepted', () => {
  const rows = [row('aa', 8, '2026-10-06T23:59:00+09:00', 0)];
  const state = verified(rows, t('23:50:00'));
  assert.equal(indexSnapshotCurrent(state, config, Date.parse('2026-10-07T00:01:00+09:00')), false);
});
test('the check is read-only', () => {
  const state = verified([row('aa', 8, '2026-10-06T12:00:00+09:00', 0)], t('11:50:00'));
  const before = JSON.stringify(state);
  indexSnapshotCurrent(state, config, t('12:05:00'));
  assert.equal(JSON.stringify(state), before);
});
