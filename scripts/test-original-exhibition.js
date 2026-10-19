"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
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

function row(boat, registerNo, lapTime, mawariTime = "5.10", straightTime = "8.00", exhibitionTime) {
  return [
    "<tr>",
    `<td class='col1 waku'>${boat}</td>`,
    `<td class='col2'><a href='profile?toban=${registerNo}'>選手</a></td>`,
    `<td class='col5'>${exhibitionTime ?? (6.79 + boat * 0.01).toFixed(2)}</td>`,
    `<td class="col6 rank_1">${lapTime}</td>`,
    `<td class='col7'>${mawariTime}</td>`,
    `<td class='col8'>${straightTime}</td>`,
    "</tr>"
  ].join("");
}

function fixture(overrides = {}) {
  const rowCount = overrides.rowCount ?? 6;
  const labels = overrides.labels || ["一周", "まわり足", "直線"];
  return [
    // Real header: the group and all three leaf headers repeat col6.
    "<table><thead><tr><th class='col6' colspan='3'>オリジナル展示データ</th></tr><tr>",
    ...labels.map(label => `<th class='col6'>${label}</th>`),
    "</tr></thead><tbody>",
    ...Array.from({ length: rowCount }, (_, index) =>
      row(
        index + 1,
        racers[index],
        overrides.invalidLapAt === index
          ? "--"
          : laps[index].toFixed(2),
        overrides.invalidMawariAt === index ? "-" : (overrides.col7 ?? "5.10"),
        overrides.invalidStraightAt === index ? "-" : (overrides.col8 ?? "8.00")
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
assert.deepEqual(parsed.rows.map(item => item.mawariTime), Array(6).fill(5.10));
assert.deepEqual(parsed.rows.map(item => item.straightTime), Array(6).fill(8.00));
assert.equal(parsed.sourceFetchedAt, null, "pure parsing never invents an observation time");
assert.equal(parsed.sourceSha256, null, "pure parsing is not an observed source capture");
assert.equal(parsed.date, "20260812");
assert.equal(parsed.jcd, "06");
assert.equal(parsed.rno, 12);
assert.equal(parsed.identityComplete, true);
assert.equal(parsed.lapComplete, true);
assert.deepEqual(parsed.metricCounts, { lapTime: 6, mawariTime: 6, straightTime: 6 });

const partial = parseHamanakoOriginalExhibitionHtml(fixture({ invalidMawariAt: 2, invalidStraightAt: 4 }), config);
assert.equal(partial.status, "available", "new metric gaps preserve complete existing lap data");
assert.deepEqual(partial.rows.map(item => item.lapTime), laps);
assert.equal(partial.rows[2].mawariTime, null);
assert.equal(partial.rows[2].straightTime, 8);
assert.equal(partial.rows[4].straightTime, null);
const unknownColumn = parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["一周", "未確認項目", "直線"] }), config);
assert.equal(unknownColumn.status, "available");
assert.ok(unknownColumn.rows.every(item => item.mawariTime === null && item.straightTime === 8));
const reordered = parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["一周", "直線", "まわり足"],
  col7: "8.00", col8: "5.10" }), config);
assert.ok(reordered.rows.every(item => item.mawariTime === 5.10 && item.straightTime === 8),
  "metric meaning follows the leaf labels, not a hardcoded col7/col8 assumption");
assert.equal(parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["直線", "まわり足", "一周"] }), config).status,
  "incomplete", "a mislabeled lap column cannot consume a straight-time value");
assert.equal(parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["一周", "まわり足", "まわり足"] }), config).status,
  "incomplete", "duplicate header meanings are ambiguous");
const legacyLapHeader = parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["一周"] }), config);
assert.equal(legacyLapHeader.status, "available");
assert.ok(legacyLapHeader.rows.every(item => item.mawariTime === null && item.straightTime === null));
const missingMiddleHeader = parseHamanakoOriginalExhibitionHtml(fixture({ labels: ["一周", "直線"] }), config);
assert.equal(missingMiddleHeader.status, "available");
assert.ok(missingMiddleHeader.rows.every(item => item.mawariTime === null && item.straightTime === null),
  "an omitted repeated-class heading cannot shift mawari values into straight time");
const duplicateMetricCell = parseHamanakoOriginalExhibitionHtml(
  fixture().replace("<td class='col7'>5.10</td>", "<td class='col7'>5.10</td><td class='col7'>9.99</td>"), config);
assert.equal(duplicateMetricCell.status, "available");
assert.equal(duplicateMetricCell.rows[0].mawariTime, null, "ambiguous tbody columns stay unknown");
for (const value of ["", "-", "--", "0.00", "NaN", "1e1", "5.1", "-5.10"]) {
  const missing = parseHamanakoOriginalExhibitionHtml(fixture({ col7: value }), config);
  assert.equal(missing.status, "available");
  assert.ok(missing.rows.every(item => item.mawariTime === null), `never infer a missing timing from ${value}`);
}

// Minimal numeric fixture from the official 2026-10-13 11R page, read on
// 2026-10-19 solely to verify column meanings. It is not pre-race evidence.
// https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php?day=20261013&race=11&kind=2
const measured = [
  ["3898", "6.67", "36.77", "5.04", "8.19"], ["4467", "6.63", "36.94", "5.02", "8.00"],
  ["4562", "6.58", "37.57", "5.09", "8.04"], ["4957", "6.61", "37.02", "5.14", "8.02"],
  ["3161", "6.70", "37.71", "5.25", "8.04"], ["4109", "6.68", "37.05", "5.19", "8.11"]
];
const measuredHtml = fixture({ rowCount: 0 }).replace("</tbody>", measured.map((v, i) =>
  row(i + 1, v[0], v[2], v[3], v[4], v[1])).join("") + "</tbody>");
const measuredParsed = parseHamanakoOriginalExhibitionHtml(measuredHtml,
  sourceConfig({ jcd: "06", date: "20261013", rno: 11 }));
assert.equal(measuredParsed.status, "available");
assert.deepEqual(measuredParsed.rows.map(item => [item.lapTime, item.mawariTime, item.straightTime]),
  measured.map(v => v.slice(2).map(Number)));

assert.equal(
  parseHamanakoOriginalExhibitionHtml(fixture({ rowCount: 5 }), config).status,
  "incomplete",
  "6艇揃わない独自展示を部分採用しない"
);
const missingLap = parseHamanakoOriginalExhibitionHtml(fixture({ invalidLapAt: 2 }), config);
assert.equal(missingLap.status, "incomplete", "existing lap completeness status is preserved");
assert.equal(missingLap.identityComplete, true);
assert.equal(missingLap.lapComplete, false);
assert.equal(missingLap.rows.length, 6, "complete identities survive a gap in one measurement");
assert.deepEqual(missingLap.metricCounts, { lapTime: 5, mawariTime: 6, straightTime: 6 });
assert.equal(missingLap.rows[2].lapTime, null);
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
for (const rows of [attached.entries, attached.beforeInfo]) {
  for (const item of rows) for (const value of [item, item.exhibition]) {
    assert.equal(value.mawariTime, 5.10);
    assert.equal(value.straightTime, 8);
    assert.equal(value.mawariTimeUnit, "seconds");
    assert.equal(value.mawariTimeMeasurementLabel, "まわり足");
    assert.equal(value.straightTimeMeasurementLabel, "直線");
    assert.equal(value.mawariTimeSourceRef, "originalExhibition");
    assert.equal(value.mawariTimeSourceUrl, config.sourceUrl);
    assert.equal(Object.hasOwn(value, "turnTime"), false, "never alias mawari to lap/turnTime");
  }
}
assert.equal(attached.originalExhibition.identityMatched, true);
assert.equal(attached.originalExhibition.exhibitionMatched, true);
assert.deepEqual(attached.originalExhibition.boatIdentities, racers.map((registerNo, i) => ({ boat: i + 1, registerNo })));
assert.equal(attachOriginalLapTimes(base, partial).entries[2].mawariTime, null);
assert.equal(attachOriginalLapTimes(base, partial).entries[2].lapTime, laps[2]);
const missingLapAttached = attachOriginalLapTimes(base, missingLap);
assert.equal(missingLapAttached.originalExhibition.status, "available");
assert.equal(missingLapAttached.originalExhibition.lapComplete, false);
assert.deepEqual(missingLapAttached.originalExhibition.metricCounts, { lapTime: 5, mawariTime: 6, straightTime: 6 });
for (const rows of [missingLapAttached.entries, missingLapAttached.beforeInfo]) {
  for (const item of rows) for (const value of [item, item.exhibition]) {
    assert.equal(Object.keys(value).some(key => key.startsWith("lapTime")), false,
      "one source lap gap prevents adding lap values and provenance to all six boats");
    assert.equal(value.mawariTime, 5.10);
    assert.equal(value.straightTime, 8);
  }
}
const existingLap = {
  lapTime: 39.12, lapTimeSource: "previous source", lapTimeSourceUrl: "https://example.test/previous",
  lapTimeUnit: "seconds", lapTimeMeasurementLabel: "一周", lapTimeSourceRef: "previousOriginal"
};
const withExistingLap = Object.fromEntries(["entries", "beforeInfo"].map(key => [key,
  base[key].map(item => ({ ...item, ...existingLap, exhibition: { ...item.exhibition, ...existingLap } }))
]));
const preservedLap = attachOriginalLapTimes(withExistingLap, missingLap);
assert.equal(preservedLap.originalExhibition.metricCounts.lapTime, 5,
  "source counts never include retained values from a previous source");
for (const rows of [preservedLap.entries, preservedLap.beforeInfo]) {
  for (const item of rows) for (const value of [item, item.exhibition]) {
    assert.deepEqual(Object.fromEntries(Object.keys(existingLap).map(key => [key, value[key]])), existingLap);
  }
}

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
  assert.equal(fetched.sourceSha256, createHash("sha256").update(fixture(), "utf8").digest("hex"));
  assert.ok(Number.isFinite(Date.parse(fetched.sourceFetchedAt)));
  const observed = attachOriginalLapTimes(base, fetched);
  assert.equal(observed.originalExhibition.sourceSha256, fetched.sourceSha256);
  assert.equal(observed.originalExhibition.sourceFetchedAt, fetched.sourceFetchedAt);
  assert.equal(observed.originalExhibition.venueCode, "06");
  assert.equal(observed.originalExhibition.raceNo, 12);
  let bodyRead = false;
  const clock = Date;
  const realNow = Date.now();
  class ObservedClock extends Date {
    constructor(...values) { super(...(values.length ? values : [realNow + (bodyRead ? 1000 : 0)])); }
    static now() { return realNow + (bodyRead ? 1000 : 0); }
  }
  try {
    global.Date = ObservedClock;
    const afterBody = await fetchOriginalExhibition({ jcd: "06", date: "20260812", rno: 12 }, async () => ({
      ok: true, async text() { bodyRead = true; return fixture(); }
    }));
    assert.equal(afterBody.sourceFetchedAt, new clock(realNow + 1000).toISOString(), "timestamp follows body read");
  } finally { global.Date = clock; }

  const failed = await fetchOriginalExhibition(
    { jcd: "06", date: "20260812", rno: 12 },
    async () => ({ ok: false, status: 503 })
  );
  assert.equal(failed.status, "fetch-failed");
  assert.equal(failed.sourceSha256, undefined);
  assert.equal(failed.sourceFetchedAt, undefined);
}

async function testRaceIntegration(originalOverrides = {}) {
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
        return fixture(originalOverrides);
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
    const lapComplete = originalOverrides.invalidLapAt === undefined;
    assert.equal(payload.originalExhibition.lapComplete, lapComplete);
    assert.deepEqual(payload.originalExhibition.metricCounts,
      { lapTime: lapComplete ? 6 : 5, mawariTime: 6, straightTime: 6 });
    if (lapComplete) {
      assert.deepEqual(payload.beforeInfo.map((item) => item.lapTime), laps);
      assert.ok(payload.entries.every((item) => item.lapTimeSource === HAMANAKO_SOURCE));
    } else {
      for (const rows of [payload.entries, payload.beforeInfo]) {
        assert.ok(rows.every(item => !Object.keys(item).some(key => key.startsWith("lapTime"))));
      }
    }
    assert.ok(payload.entries.every(item => item.mawariTime === 5.10 && item.straightTime === 8));
    assert.equal(payload.originalExhibition.sourceSha256,
      createHash("sha256").update(fixture(originalOverrides), "utf8").digest("hex"));
    assert.ok(Date.parse(payload.originalExhibition.sourceFetchedAt) <= Date.parse(payload.fetchedAt));
    const frozen = predictionConditions.capture(payload, {});
    assert.equal(frozen.dataAvailability.lapTime, lapComplete ? 6 : 0);
    if (lapComplete) {
      assert.ok(frozen.boats.every((item) => item.lapTimeSource === HAMANAKO_SOURCE));
      assert.ok(frozen.boats.every((item) => item.lapTimeSourceUrl === config.sourceUrl));
    }
    assert.ok(frozen.boats.every(item => item.mawariTime === 5.10 && item.straightTime === 8));
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
  await testRaceIntegration({ invalidLapAt: 2 });
  await testRaceKeepsOriginalNullBeforeDisplay();
}

main()
  .then(() => console.log("開催場公式・独自展示一周タイムテスト: 合格"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
