"use strict";

const assert = require("node:assert/strict");
const {
  HAMANAKO_SOURCE,
  sourceConfig,
  parseHamanakoOriginalExhibitionHtml,
  fetchOriginalExhibition,
  attachOriginalLapTimes
} = require("../api/_original-exhibition");
const raceApi = require("../api/race");
const predictionConditions = require("../js/prediction-conditions");

const racers = ["3744", "3959", "4581", "3422", "4933", "4793"];
const laps = [38.06, 37.66, 37.99, 38.24, 38.21, 37.49];

function row(boat, registerNo, lapTime) {
  return [
    "<tr>",
    `<td class='col1 waku'>${boat}</td>`,
    `<td class='col2'><a href='profile?toban=${registerNo}'>選手</a></td>`,
    `<td class='col5'>${(6.79 + boat * 0.01).toFixed(2)}</td>`,
    `<td class="col6 rank_1">${lapTime}</td>`,
    "<td class='col7'>5.10</td>",
    "<td class='col8'>8.00</td>",
    "</tr>"
  ].join("");
}

function fixture(overrides = {}) {
  const rowCount = overrides.rowCount ?? 6;
  return [
    "<table><thead><tr><th class='col6'>一周</th></tr></thead><tbody>",
    ...Array.from({ length: rowCount }, (_, index) =>
      row(
        index + 1,
        racers[index],
        overrides.invalidLapAt === index
          ? "--"
          : laps[index].toFixed(2)
      )
    ),
    "</tbody></table>",
    "<h2>一周・まわり足・直線タイムは、BOATRACE 浜名湖独自計測値です。</h2>"
  ].join("");
}

const config = sourceConfig({
  jcd: "06",
  date: "20260812",
  rno: 12
});
assert.ok(config);
assert.equal(sourceConfig({ jcd: "07", date: "20260812", rno: 12 }), null);

const parsed = parseHamanakoOriginalExhibitionHtml(fixture(), config);
assert.equal(parsed.status, "available");
assert.deepEqual(parsed.rows.map((item) => item.boat), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(parsed.rows.map((item) => item.registerNo), racers);
assert.deepEqual(parsed.rows.map((item) => item.lapTime), laps);
assert.equal(parsed.source, HAMANAKO_SOURCE);

assert.equal(
  parseHamanakoOriginalExhibitionHtml(fixture({ rowCount: 5 }), config).status,
  "incomplete",
  "6艇揃わない独自展示を部分採用しない"
);
assert.equal(
  parseHamanakoOriginalExhibitionHtml(fixture({ invalidLapAt: 2 }), config).status,
  "incomplete",
  "欠損・異常タイムを含む独自展示を採用しない"
);
assert.equal(
  parseHamanakoOriginalExhibitionHtml("表示するデータがありません", config).status,
  "unavailable",
  "展示前は推測せず未取得にする"
);

const base = {
  entries: racers.map((registerNo, index) => ({
    boat: index + 1,
    registerNo,
    exhibition: { displayTime: 6.8 + index * 0.01 }
  })),
  beforeInfo: racers.map((_registerNo, index) => ({
    boat: index + 1,
    exhibition: { displayTime: 6.8 + index * 0.01 }
  }))
};
const attached = attachOriginalLapTimes(base, parsed);
assert.equal(attached.originalExhibition.status, "available");
assert.equal(attached.entries[1].lapTime, 37.66);
assert.equal(attached.entries[1].lapTimeSource, HAMANAKO_SOURCE);
assert.equal(attached.beforeInfo[1].exhibition.lapTime, 37.66);
assert.ok(attached.entries.every((item) => item.lapTimeSourceUrl === config.sourceUrl));

const mismatched = attachOriginalLapTimes(
  {
    ...base,
    entries: base.entries.map((item, index) =>
      index === 2 ? { ...item, registerNo: "9999" } : item
    )
  },
  parsed
);
assert.equal(mismatched.originalExhibition.status, "identity-mismatch");
assert.ok(mismatched.entries.every((item) => item.lapTime === undefined));

const exhibitionMismatched = attachOriginalLapTimes(
  {
    ...base,
    beforeInfo: base.beforeInfo.map((item, index) =>
      index === 2
        ? { ...item, exhibition: { ...item.exhibition, displayTime: 6.99 } }
        : item
    )
  },
  parsed
);
assert.equal(exhibitionMismatched.originalExhibition.status, "exhibition-mismatch");
assert.ok(exhibitionMismatched.beforeInfo.every((item) => item.lapTime === undefined));

async function testFetch() {
  const unsupported = await fetchOriginalExhibition(
    { jcd: "07", date: "20260812", rno: 12 },
    async () => {
      throw new Error("unsupported venue must not fetch");
    }
  );
  assert.equal(unsupported.status, "unsupported");

  const fetched = await fetchOriginalExhibition(
    { jcd: "06", date: "20260812", rno: 12 },
    async (url) => ({
      ok: true,
      status: 200,
      async text() {
        assert.equal(String(url), config.sourceUrl);
        return fixture();
      }
    })
  );
  assert.equal(fetched.status, "available");

  const failed = await fetchOriginalExhibition(
    { jcd: "06", date: "20260812", rno: 12 },
    async () => ({ ok: false, status: 503 })
  );
  assert.equal(failed.status, "fetch-failed");
}

async function testRaceIntegration() {
  const originalFetch = global.fetch;
  const fetchedUrls = [];
  const entryHtml = [
    "枠 ボートレーサー 全国 当地 モーター ボート",
    ...racers.map((registerNo, index) => {
      const boat = index + 1;
      return [
        boat,
        `${registerNo} / A1 選手 ${boat}`,
        "静岡/静岡",
        "40歳/52.0kg",
        "F0 L0 0.15",
        "6.00 40.0 60.0",
        "6.00 40.0 60.0",
        `${10 + boat} 30.0 50.0`,
        `${20 + boat} 30.0 50.0`
      ].join(" ");
    }),
    "モーター・ボート変更時"
  ].join(" ");
  const beforeHtml = [
    "枠 写真 ボートレーサー",
    ...racers.map((_registerNo, index) =>
      `${index + 1} ${["選手一郎", "選手次郎", "選手三郎", "選手四郎", "選手五郎", "選手六郎"][index]} 52.0kg ${(6.80 + index * 0.01).toFixed(2)} 0.0`
    ),
    "部品交換凡例"
  ].join(" ");

  global.fetch = async (url) => {
    const text = String(url);
    fetchedUrls.push(text);
    return {
      ok: true,
      status: 200,
      async text() {
        if (text.includes("racelist")) return entryHtml;
        if (text.includes("beforeinfo")) return beforeHtml;
        return fixture();
      }
    };
  };

  try {
    let payload = null;
    await raceApi(
      { query: { jcd: "06", rno: "12", date: "20260812" } },
      {
        status() { return this; },
        json(value) { payload = value; return value; }
      }
    );
    assert.equal(fetchedUrls.length, 3);
    assert.equal(payload.ok, true);
    assert.equal(payload.originalExhibition.status, "available");
    assert.deepEqual(payload.beforeInfo.map((item) => item.lapTime), laps);
    assert.ok(payload.entries.every((item) => item.lapTimeSource === HAMANAKO_SOURCE));
    const frozen = predictionConditions.capture(payload, {});
    assert.equal(frozen.dataAvailability.lapTime, 6);
    assert.ok(frozen.boats.every((item) => item.lapTimeSource === HAMANAKO_SOURCE));
    assert.ok(frozen.boats.every((item) => item.lapTimeSourceUrl === config.sourceUrl));
  } finally {
    global.fetch = originalFetch;
  }
}

async function testRaceKeepsOriginalNullBeforeDisplay() {
  const originalFetch = global.fetch;
  const fetchedUrls = [];
  global.fetch = async (url) => {
    fetchedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() { return ""; }
    };
  };

  try {
    let payload = null;
    await raceApi(
      { query: { jcd: "06", rno: "3", date: "20260813" } },
      {
        status() { return this; },
        json(value) { payload = value; return value; }
      }
    );
    assert.equal(fetchedUrls.length, 3);
    assert.equal(payload.originalExhibition.status, "unavailable");
    assert.ok(payload.beforeInfo.every((item) => item.lapTime === undefined));
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  await testFetch();
  await testRaceIntegration();
  await testRaceKeepsOriginalNullBeforeDisplay();
}

main()
  .then(() => console.log("開催場公式・独自展示一周タイムテスト: 合格"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
