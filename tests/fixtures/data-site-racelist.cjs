'use strict';
// Synthetic official racelist page (same text layout the existing parser reads).
const ROW = (boat, reg, cls, name, nw, motorNo, m2) =>
  `<tr><td>${boat}</td><td>${reg} / ${cls}</td><td>${name}</td><td>福岡/福岡</td><td>30歳/52.0kg</td>` +
  `<td>F0 L0 0.15</td><td>${nw} 40.00 60.00</td><td>6.00 40.00 60.00</td><td>${motorNo} ${m2} 50.00</td><td>41 33.00 50.00</td></tr>`;
function racelist(rows) {
  return '<html><body><div>本日のレース 一般戦 出走表</div><div>締切予定時刻 15:00 15:30</div>' +
    '<table><tr><th>枠</th><th>ボートレーサー</th><th>全国</th><th>当地</th><th>モーター</th><th>ボート</th></tr>' +
    rows.join('') + '</table><p>モーター・ボート変更時</p></body></html>';
}
const SOLID = racelist([ROW(1, 4444, 'A1', '山田 一郎', '7.80', 11, '48.00'), ROW(2, 4445, 'B1', '佐藤 二郎', '4.90', 12, '30.00'),
  ROW(3, 4446, 'B1', '鈴木 三郎', '4.80', 13, '33.00'), ROW(4, 4447, 'B1', '高橋 四郎', '4.60', 14, '35.00'),
  ROW(5, 4448, 'B2', '田中 五郎', '3.50', 15, '28.00'), ROW(6, 4449, 'B1', '伊藤 六郎', '4.20', 16, '31.00')]);
const ROUGH = racelist([ROW(1, 5444, 'B2', '渡辺 一郎', '3.20', 21, '28.00'), ROW(2, 5445, 'B1', '中村 二郎', '5.10', 22, '30.00'),
  ROW(3, 5446, 'A2', '小林 三郎', '6.00', 23, '35.00'), ROW(4, 5447, 'A1', '加藤 四郎', '7.40', 24, '44.00'),
  ROW(5, 5448, 'A1', '吉田 五郎', '7.10', 25, '38.00'), ROW(6, 5449, 'B1', '山本 六郎', '5.00', 26, '31.00')]);
module.exports = { SOLID, ROUGH, racelist, ROW };
