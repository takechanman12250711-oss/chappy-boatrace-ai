#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./build-exhibition-time-pitfalls.cjs");

// 順位・相関
assert.deepStrictEqual(lib.averageRanks([6.7, 6.6, 6.7, 6.8]), [2.5, 1, 2.5, 4], "同タイムは平均順位");
assert.strictEqual(lib.spearman([1, 2, 3], [1, 2, 3]), 1);
assert.strictEqual(lib.spearman([1, 2, 3], [3, 2, 1]), -1);

// 期間・荒れ水面は固定値どおり
assert.strictEqual(lib.period("20260915"), "explored");
assert.strictEqual(lib.period("20260916"), "holdout");
assert.strictEqual(lib.period("20260721"), null);
assert.strictEqual(lib.isRough({ windSpeed: 5, waveHeight: 0 }), true, "風速5mは荒れ");
assert.strictEqual(lib.isRough({ windSpeed: 4, waveHeight: 4 }), false);
assert.strictEqual(lib.isRough({ windSpeed: 0, waveHeight: 5 }), true, "波高5cmは荒れ");

function predictionRecord(date, jcd, raceNo, times, extra = {}) {
  return {
    raceKey: `${date}-${jcd}-${raceNo}`,
    date, jcd, raceNo,
    deadlineAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T15:00:00+09:00`,
    selectedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T05:50:00.000Z`,
    prediction: {
      predictionMode: "server_pre_deadline",
      preRaceConditions: {
        schemaVersion: 4,
        sourceTiming: "pre_deadline",
        officialResultUsed: false,
        source: "boatrace-official",
        sourceFetchedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T05:49:00.000Z`,
        weather: { windSpeed: extra.wind ?? 2, waveHeight: extra.wave ?? 2 },
        boats: times.map((time, index) => ({ boatNo: index + 1, course: extra.courses?.[index] ?? index + 1, courseOfficial: extra.official ?? true, exhibitionTime: time }))
      }
    }
  };
}

function resultRace(date, jcd, raceNo, order, { absent = [] } = {}) {
  return {
    source: "boatrace-official",
    resultAvailable: true,
    status: "finished",
    date, jcd, raceNo,
    finishers: order.map((boat, index) => ({ rank: index + 1, boat })),
    starts: [1, 2, 3, 4, 5, 6].filter((boat) => !absent.includes(boat)).map((boat) => ({ boat, course: boat, st: 0.15 })),
    trifecta: { boats: order.slice(0, 3), payout: 1000 }
  };
}

// extractRace: 完走しなかった艇は最下位タイ、欠場・非公式進入・展示欠損は除外
{
  const record = predictionRecord("20260801", "01", 1, [6.70, 6.65, 6.72, 6.75, 6.80, 6.78]);
  const { race } = lib.extractRace({ ...record, __analysisRaceKey: "20260801-01-1", __officialResult: resultRace("20260801", "01", 1, [2, 1, 3, 4]) });
  assert.deepStrictEqual(race.rows.map((row) => row.finish), [2, 1, 3, 4, 5.5, 5.5], "5・6号艇は完走せず5.5位");
  assert.strictEqual(lib.extractRace({ ...record, __officialResult: resultRace("20260801", "01", 1, [1, 2, 3, 4, 5], { absent: [6] }) }).reason, "absent-boat");
  const unofficial = predictionRecord("20260801", "01", 1, [6.7, 6.7, 6.7, 6.7, 6.7, 6.7], { official: false });
  assert.strictEqual(lib.extractRace({ ...unofficial, __officialResult: resultRace("20260801", "01", 1, [1, 2, 3, 4, 5, 6]) }).reason, "official-course-missing");
  const missing = predictionRecord("20260801", "01", 1, [6.7, null, 6.7, 6.7, 6.7, 6.7]);
  assert.strictEqual(lib.extractRace({ ...missing, __officialResult: resultRace("20260801", "01", 1, [1, 2, 3, 4, 5, 6]) }).reason, "exhibition-time-missing");
}

// metrics: 最速艇の1着率（同タイムは等分）と順位相関
{
  const races = [
    { rows: [1, 2, 3, 4, 5, 6].map((boat) => ({ boat, course: boat, ex: 6.6 + boat * 0.01, finish: boat })) },
    { rows: [1, 2, 3, 4, 5, 6].map((boat) => ({ boat, course: boat, ex: boat <= 2 ? 6.6 : 6.8, finish: boat === 2 ? 1 : boat === 1 ? 2 : boat })) }
  ];
  const m = lib.metrics(races);
  assert.strictEqual(m.fastestWinRatePct, 75, "1R目は的中、2R目は同タイム2艇の片方が1着で0.5");
  assert.strictEqual(m.meanRankCorrelation !== null && m.meanRankCorrelation > 0.8, true);
  assert.strictEqual(m.sufficient, false, "100R未満は結論に使わない");
  // 補正: 1号艇を0.05秒遅く見なすと、1R目の最速は2号艇
  const adjusted = lib.metrics([races[0]], { 1: -0.05 });
  assert.strictEqual(adjusted.fastestWinRatePct, 0);
}

// boatBias: レース内平均との差
{
  const bias = lib.boatBias([{ rows: [1, 2, 3, 4, 5, 6].map((boat) => ({ boat, ex: boat === 1 ? 6.60 : 6.72 })) }]);
  assert.strictEqual(bias[1], -0.1);
  assert.strictEqual(bias[2], 0.02);
}

// build: 締切前判定を通り、補正は explored だけから作る
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exhibition-pitfalls-"));
  const predictionsDir = path.join(dir, "predictions");
  const resultsDir = path.join(dir, "results");
  fs.mkdirSync(predictionsDir);
  fs.mkdirSync(resultsDir);
  const write = (dir2, date, body) => fs.writeFileSync(path.join(dir2, `${date}.json`), JSON.stringify(body));
  write(predictionsDir, "20260801", { predictions: [predictionRecord("20260801", "01", 1, [6.60, 6.70, 6.70, 6.70, 6.70, 6.70])] });
  write(resultsDir, "20260801", { races: [resultRace("20260801", "01", 1, [1, 2, 3, 4, 5, 6])] });
  write(predictionsDir, "20261001", {
    predictions: [
      predictionRecord("20261001", "22", 1, [6.70, 6.70, 6.70, 6.70, 6.70, 6.60], { wind: 6 }),
      { ...predictionRecord("20261001", "01", 2, [6.7, 6.7, 6.7, 6.7, 6.7, 6.7]), selectedAt: "2026-10-01T06:30:00.000Z" }
    ]
  });
  write(resultsDir, "20261001", { races: [resultRace("20261001", "22", 1, [6, 1, 2, 3, 4, 5]), resultRace("20261001", "01", 2, [1, 2, 3, 4, 5, 6])] });
  const report = lib.build({ root: dir, predictionsDir, resultsDir });
  assert.strictEqual(report.cohort.eligibleRaces, 2, "締切後に保存した予想は除外");
  assert.strictEqual(report.cohort.excludedReasons["captured-at-or-after-deadline"], 1, "締切前判定の除外理由を残す");
  assert.deepStrictEqual(report.cohort.raceExcludedReasons, {}, "レース除外理由は別項目");
  assert.strictEqual(report.periods.explored.races, 1);
  assert.strictEqual(report.periods.holdout.races, 1);
  assert.strictEqual(report.adjustmentFromExplored[1], -0.0833, "補正値は explored の1R目だけから");
  assert.strictEqual(report.periods.holdout.rough.races, 1, "風速6mは荒れ");
  assert.strictEqual(report.periods.holdout.differentMeasurementVenues.races, 1, "福岡（22）は計測位置が異なる場");
  assert.strictEqual(report.periods.holdout.raw.fastestWinRatePct, 100, "最速の6号艇が1着");
  assert.strictEqual(report.usableForPrediction, false);
  assert.strictEqual(report.productionChanged, false);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("exhibition-time-pitfalls: all checks passed");
