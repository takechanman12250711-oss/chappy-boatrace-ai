'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lastWeek, datesBetween, bootstrapRoi, evSummary, ledgerSummary, buildMarkdown } = require('./weekly-stats.cjs');

test('月曜の朝（日本時間）に動くと先週の月〜日になる', () => {
  // 2026-11-09(月) 06:23 JST = 2026-11-08 21:23 UTC
  assert.deepEqual(lastWeek(new Date('2026-11-08T21:23:00Z')), { from: '20261102', to: '20261108' });
});

test('日付の並び', () => {
  assert.deepEqual(datesBetween('20261030', '20261102'), ['20261030', '20261031', '20261101', '20261102']);
});

test('ブートストラップは再現でき、全部同じなら幅ゼロ', () => {
  const items = [{ stake: 100, ret: 0 }, { stake: 100, ret: 300 }, { stake: 100, ret: 0 }];
  assert.deepEqual(bootstrapRoi(items), bootstrapRoi(items));
  assert.deepEqual(bootstrapRoi([{ stake: 100, ret: 100 }, { stake: 100, ret: 100 }]), [100, 100]);
  assert.equal(bootstrapRoi([{ stake: 100, ret: 0 }]), null);
});

test('boatrace-ev の集計：本線・中穴・大穴と結果待ち', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
  fs.writeFileSync(path.join(dir, '20261102.json'), JSON.stringify({
    races: {
      a: { picks: [{ stake: 100 }, { stake: 100 }], romans: { 中穴: { stake: 100 } }, result: { stake: 200, return: 1500, romans: { 中穴: { stake: 100, return: 0 } } } },
      b: { picks: [{ stake: 100 }], romans: {}, result: { stake: 100, return: 0, romans: {} } },
      c: { picks: [{ stake: 100 }], romans: {} },
      d: { picks: [], romans: {}, result: { stake: 0, return: 0, romans: {} } },
    },
  }));
  const s = evSummary(dir, ['20261102', '20261103']);
  assert.equal(s.filesFound, 1);
  assert.equal(s.predictedRaces, 3);
  assert.equal(s.pendingRaces, 1);
  assert.equal(s.本線.races, 2);
  assert.equal(s.本線.stakeYen, 300);
  assert.equal(s.本線.returnYen, 1500);
  assert.equal(s.本線.roi, 500);
  assert.equal(s.本線.hits, 1);
  assert.equal(s.中穴.races, 1);
  assert.equal(s.大穴.races, 0);
});

test('チャッピーの成績記録を期間で切り出す', () => {
  const ledger = { rows: [
    { raceKey: '20261101-01-1', hit: true, stakeYen: 800, returnYen: 1200 },
    { raceKey: '20261102-01-1', hit: false, stakeYen: 1000, returnYen: 0 },
    { raceKey: '20261109-01-1', hit: true, stakeYen: 500, returnYen: 900 },
  ] };
  const w = ledgerSummary(ledger, '20261102', '20261108');
  assert.equal(w.races, 1);
  assert.equal(w.roi, 0);
  const all = ledgerSummary(ledger, '00000000', '20261108');
  assert.equal(all.races, 2);
  assert.equal(all.hitRate, 50);
});

test('読めなかった所は「要確認」と書く', () => {
  const m = buildMarkdown({ week: { from: '20261102', to: '20261108' }, chappy: { error: 'x' }, holdPickupForward: { error: 'y' }, boatraceEv: { error: 'z' } });
  assert.equal((m.match(/要確認/g) || []).length, 3);
});

test('評価コードが変わったら集計停止と書く', () => {
  const ok = { races: 0, hits: 0, hitRate: null, stakeYen: 0, returnYen: 0, roi: null };
  const m = buildMarkdown({ week: { from: '20261102', to: '20261108' }, chappy: { week: ok, cumulative: ok }, holdPickupForward: { status: 'frozen-module-mismatch' }, boatraceEv: { error: 'z' } });
  assert.match(m, /集計停止/);
});
