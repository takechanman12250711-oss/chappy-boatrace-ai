"use strict";

const assert = require("node:assert/strict");
const {
  parseOfficialRaceHtml
} = require("../api/_parser");
const raceApi = require("../api/race");
require("./test-race-parser-missing-st");

const beforeHtml = [
  "枠 写真 ボートレーサー",
  "1 佐々木 太郎 52.0kg 6.72 0.0",
  "2 山田 次郎 52.1kg 6.74 0.0",
  "3 高橋 三郎 52.2kg 6.76 0.0",
  "4 田中 四郎 52.3kg 6.78 0.0",
  "5 伊藤 五郎 52.4kg 6.80 0.0",
  "6 渡辺 六郎 52.5kg 6.82 0.0",
  "部品交換凡例"
].join(" ");

const parsed = parseOfficialRaceHtml(
  "",
  beforeHtml
);

const entryWithSpacedName =
  parseOfficialRaceHtml([
    "枠 ボートレーサー 全国 当地 モーター ボート",
    "1 4287 / A1 今井 貴士 福岡/福岡 41歳/55.0kg",
    "F0 L0 0.15 6.57 45.0 63.0 6.81 47.0 65.0",
    "12 35.0 55.0 24 38.0 58.0",
    "モーター・ボート変更時"
  ].join(" "));
assert.equal(
  entryWithSpacedName.entries[0].racerName,
  "今井 貴士",
  "出走表カード用の姓・名の区切りを消さない"
);

assert.equal(
  parsed.beforeInfo.length,
  6
);
assert.equal(
  parsed.beforeInfo[0].racerName,
  "佐々木太郎",
  "踊り字を含む選手名でも艇ブロックを認識する"
);
assert.equal(
  parsed.beforeInfo[0].exhibition.displayTime,
  6.72
);
assert.ok(
  parsed.beforeInfo.every(
    row => row.exhibition.displayTime !== null
  ),
  "6艇すべての展示タイムを取得する"
);

// 公式ページの実際の形：行は上から1〜6コース順、行頭の数字は艇番（画像と同じ）。
function officialStartRow(
  boat,
  st
) {
  return (
    `<div>${boat}` +
    `<img src="/static_extra/pc/images/img_boat2_${boat}.png">` +
    `${st}</div>`
  );
}

const officialStartHtml = [
  "<main>スタート展示",
  officialStartRow(1, ".14"),
  officialStartRow(2, ".24"),
  officialStartRow(6, ".15"),
  officialStartRow(3, ".03"),
  officialStartRow(5, ".06"),
  officialStartRow(4, ".16"),
  "水面気象情報</main>"
].join("");
const officialStart = parseOfficialRaceHtml(
  "",
  officialStartHtml
);

assert.deepEqual(
  officialStart.startExhibition.map(
    row => row.boat
  ),
  [1, 2, 6, 3, 5, 4],
  "公式の艇番画像から進入順を保持する"
);
assert.deepEqual(
  officialStart.startExhibition.map(row => row.course),
  [1, 2, 3, 4, 5, 6],
  "行の順番をコースとする"
);
// 2026-10-23 大村6R：公式スタート展示の並びは 1-6-4-2-3-5。
const omura6 = parseOfficialRaceHtml("", [
  "<main>スタート展示",
  officialStartRow(1, ".16"), officialStartRow(6, ".01"), officialStartRow(4, ".15"),
  officialStartRow(2, ".18"), officialStartRow(3, ".19"), officialStartRow(5, ".37"),
  "水面気象情報</main>"
].join("")).startExhibition;
assert.deepEqual(omura6.map(row => [row.course, row.boat, row.st]),
  [[1, 1, 0.16], [2, 6, 0.01], [3, 4, 0.15], [4, 2, 0.18], [5, 3, 0.19], [6, 5, 0.37]],
  "前付けの進入を艇番と取り違えない");
// 行頭の数字と画像の艇番が食い違う行は採用せず、公式進入と扱わない。
const mismatched = parseOfficialRaceHtml("", [
  "<main>スタート展示",
  `<div>2<img src="/static_extra/pc/images/img_boat2_1.png">.16</div>`,
  officialStartRow(2, ".18"), officialStartRow(3, ".19"), officialStartRow(4, ".15"),
  officialStartRow(5, ".37"), officialStartRow(6, ".01"),
  "水面気象情報</main>"
].join("")).startExhibition;
assert.ok(mismatched.every(row => row.isOfficialCourse === false), "不一致の行は公式進入にしない");
assert.ok(
  officialStart.startExhibition.every(
    row =>
      row.isOfficialCourse === true &&
      row.mappingSource ===
        "official-start-image"
  ),
  "6艇すべてを公式進入として記録する"
);

async function testFetchedAt() {
  const originalFetch = global.fetch;
  const fetchedUrls = [];
  global.fetch = async url => {
    fetchedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() {
        return fetchedUrls.length === 1
          ? ""
          : beforeHtml;
      }
    };
  };

  try {
    let statusCode = 0;
    let response = null;
    await raceApi(
      {
        query: {
          jcd: "07",
          rno: "9",
          date: "20260726"
        }
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(value) {
          response = value;
          return value;
        }
      }
    );

    assert.equal(statusCode, 200);
    assert.equal(fetchedUrls.length, 2);
    assert.ok(
      Number.isFinite(
        Date.parse(response.fetchedAt)
      ),
      "公式2ページ取得直後の時刻を保存する"
    );
  } finally {
    global.fetch = originalFetch;
  }
}

testFetchedAt()
  .then(() => {
    console.log(
      "公式レースパーサー・取得時刻テスト: 合格"
    );
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
