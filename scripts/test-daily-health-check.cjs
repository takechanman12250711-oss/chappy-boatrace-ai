'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { judgeRegular, judgeManual, judgeRelay, findNoteError, buildReport, jstDate, raceDayJst } = require('./daily-health-check.cjs');

const now = new Date('2026-11-05T12:00:00Z');
const ago = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
const run = (h, conclusion, status = 'completed') => ({ created_at: ago(h), conclusion, status, html_url: `u${h}` });

test('成功があれば正常', () => {
  assert.equal(judgeRegular('x', [run(1, 'success'), run(2, 'failure')], now, 24, '').ok, true);
});

test('見張り役のIssue：定期報告（週次集計）と健康チェック自身は異常に数えない', () => {
  const { filterWatchIssues } = require('./daily-health-check.cjs');
  const bot = { login: 'github-actions[bot]' };
  const out = filterWatchIssues([
    { number: 1, title: '📊 週次集計（自動）', user: bot },
    { number: 2, title: '🩺 毎日の健康チェック：異常あり', user: bot },
    { number: 3, title: '収集が止まっています', user: bot },
    { number: 4, title: '人が開いたIssue', user: { login: 'someone' } },
    { number: 5, title: 'PR', user: bot, pull_request: {} },
  ]);
  assert.deepStrictEqual(out.map((i) => i.number), [3]);
});

test('取り消しは失敗扱いしない', () => {
  assert.equal(judgeRegular('x', [run(1, 'cancelled'), run(2, 'cancelled'), run(3, 'success')], now, 24, '').ok, true);
});

test('最新が1回だけ失敗なら様子見（正常）', () => {
  assert.equal(judgeRegular('x', [run(1, 'failure'), run(2, 'success')], now, 24, '').ok, true);
});

test('最新が2回続けて失敗なら異常', () => {
  const r = judgeRegular('x', [run(1, 'failure'), run(2, 'failure'), run(3, 'success')], now, 24, '');
  assert.equal(r.ok, false);
  assert.match(r.text, /2回続けて失敗/);
});

test('24時間動いていなければ異常', () => {
  const r = judgeRegular('x', [run(30, 'success')], now, 24, '影響');
  assert.equal(r.ok, false);
  assert.match(r.text, /1回も動いていません/);
});

test('成功0回なら異常、実行中だけなら正常', () => {
  assert.equal(judgeRegular('x', [run(1, 'failure')], now, 24, '').ok, false);
  assert.equal(judgeRegular('x', [run(1, null, 'in_progress')], now, 24, '').ok, true);
});

test('手動の処理は失敗があれば異常', () => {
  assert.equal(judgeManual('x', [run(3, 'failure')], now, 24).ok, false);
  assert.equal(judgeManual('x', [run(30, 'failure'), run(2, 'success')], now, 24).ok, true);
});

test('リレーは実行中か6時間以内なら正常、止まっていれば再開方法を案内', () => {
  assert.equal(judgeRelay('x', [run(0.5, null, 'in_progress')], now, 6).ok, true);
  assert.equal(judgeRelay('x', [run(2, 'success')], now, 6).ok, true);
  const r = judgeRelay('x', [run(10, 'success')], now, 6);
  assert.equal(r.ok, false);
  assert.match(r.text, /Run workflow/);
});

test('noteのエラー名を拾う', () => {
  assert.equal(findNoteError('foo NOTE_UI_TRANSPORT_FAILED=login_timeout bar'), 'login_timeout');
  assert.equal(findNoteError('nothing'), '');
});

test('報告文：異常なしと異常あり', () => {
  assert.match(buildReport([{ label: 'a', ok: true, text: '正常' }], now).markdown, /異常なし/);
  const bad = buildReport([{ label: 'a', ok: false, text: '止|まり' }], now);
  assert.equal(bad.ok, false);
  assert.match(bad.markdown, /異常 1件/);
  assert.match(bad.markdown, /止｜まり/);
});

test('日本時間の日付', () => {
  assert.equal(jstDate(new Date('2026-11-05T15:30:00Z')), '20261106');
});

test('確認するレースの日：予約実行が深夜にずれたら前日を見る', () => {
  // 予定どおり 21:07 日本時間 → その日
  assert.equal(raceDayJst(new Date('2026-11-05T12:07:00Z')), '20261105');
  // 遅れて翌 04:52 日本時間に動いた → 前日（11/5）
  assert.equal(raceDayJst(new Date('2026-11-05T19:52:00Z')), '20261105');
  // 朝 8 時以降 → その日
  assert.equal(raceDayJst(new Date('2026-11-05T23:00:00Z')), '20261106');
});

