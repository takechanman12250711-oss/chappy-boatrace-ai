"use strict";

const assert = require("node:assert/strict");
const { parseOfficialRaceHtml } = require("../api/_parser");

// Official rawBlock excerpts preserved in the 20260927-02-1 immutable note bundle.
const missingStRows = [
  {
    raw: "3 4340 / B2 土性 雅也 三重/三重 42歳/53.3kg F0 L0 - 3.35 15.38 25.00 0.00 0.00 0.00 26 32.35 61.76 12 26.92 42.31 7 8R 5 .21 6",
    boat: 3, registerNo: "4340", racerName: "土性 雅也",
    nationalWinRate: 3.35, national2Rate: 15.38, national3Rate: 25,
    localWinRate: 0, local2Rate: 0, local3Rate: 0,
    motorNo: 26, motor2Rate: 32.35, motor3Rate: 61.76,
    boatNo: 12, boat2Rate: 26.92, boat3Rate: 42.31, stList: [0.21]
  },
  {
    raw: "5 5445 / B2 一ノ木 匠 三重/三重 24歳/51.5kg F0 L0 - 1.58 0.00 2.08 0.00 0.00 0.00 17 25.00 32.14 77 48.28 65.52 1 6R 6 .13 6",
    boat: 5, registerNo: "5445", racerName: "一ノ木 匠",
    nationalWinRate: 1.58, national2Rate: 0, national3Rate: 2.08,
    localWinRate: 0, local2Rate: 0, local3Rate: 0,
    motorNo: 17, motor2Rate: 25, motor3Rate: 32.14,
    boatNo: 77, boat2Rate: 48.28, boat3Rate: 65.52, stList: [0.13]
  }
];
const numericStRow =
  "4 2538 / B1 高橋 二朗 東京/千葉 77歳/52.0kg F0 L0 0.21 3.15 5.15 16.49 3.13 12.50 25.00 25 24.00 36.00 36 39.29 57.14 4 7R 2 .24 5";
const entries = parseOfficialRaceHtml([
  "枠 ボートレーサー 全国 当地 モーター ボート",
  missingStRows[0].raw, numericStRow, missingStRows[1].raw,
  "モーター・ボート変更時"
].join(" ")).entries;

assert.equal(entries.length, 6);
for (const expected of missingStRows) {
  const entry = entries[expected.boat - 1];
  assert.equal(entry.rawFound, true, "平均ST欠損で独立した選手情報まで失わない");
  assert.equal(entry.avgSt, null, "未記載の平均STを0や仮値で補完しない");
  assert.equal(entry.className, "B2");
  assert.equal(entry.rawBlock, expected.raw, "元の公式文字列を保持する");
  for (const key of [
    "boat", "registerNo", "racerName",
    "nationalWinRate", "national2Rate", "national3Rate",
    "localWinRate", "local2Rate", "local3Rate",
    "motorNo", "motor2Rate", "motor3Rate",
    "boatNo", "boat2Rate", "boat3Rate"
  ]) {
    assert.equal(entry[key], expected[key], key + "を隣の列へずらさない");
  }
  assert.deepEqual(entry.currentRace.stList, expected.stList);
}
assert.equal(entries[3].avgSt, 0.21);
assert.equal(entries[3].registerNo, "2538");
assert.equal(entries[3].nationalWinRate, 3.15);
assert.deepEqual(entries[3], parseOfficialRaceHtml(numericStRow).entries[3],
  "前後に欠損ST艇があっても通常の選手情報を変えない");
assert.equal(entries[0].rawFound, false, "存在しない艇は補完しない");
assert.equal(entries[0].avgSt, null);
const invalid = parseOfficialRaceHtml(
  missingStRows[0].raw.replace("F0 L0 - ", "F0 L0 unknown ")
).entries[2];
assert.equal(invalid.rawFound, false, "未知の値を数値や公式欠損として受け入れない");
console.log("公式平均ST欠損の選手情報保持テスト: 合格");
