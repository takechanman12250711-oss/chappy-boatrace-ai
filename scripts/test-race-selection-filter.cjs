#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const filter = require("./race-selection-filter.cjs");
const { build } = require("./build-race-selection-backtest.cjs");

const P = filter.DEFAULT_PARAMS;

function race({ date = "20261010", jcd = "18", raceNo = 1, order = [1, 2, 3], courses = [1, 2, 3, 4, 5, 6], marks = {}, payout = 1000, registers = {} } = {}) {
  const finishers = order.concat([1, 2, 3, 4, 5, 6].filter((boat) => !order.includes(boat)))
    .map((boat, i) => ({ rank: i + 1, boat, registerNo: registers[boat] || `40${boat}0` }));
  const starts = courses.map((boat, i) => ({ course: i + 1, boat, st: 0.15, falseStart: marks[boat] === "F", lateStart: marks[boat] === "L" }));
  return { date, jcd, raceNo, status: "finished", void: false, finishers, starts, trifecta: { boats: order.slice(0, 3), payout } };
}

const boats = (over = {}) => [1, 2, 3, 4, 5, 6].map((boatNo) => ({
  boatNo, course: boatNo, localWinRate: 6.0, exhibitionTime: 6.8, registerNo: `40${boatNo}0`, ...(over[boatNo] || {})
}));

// ① 場の1コース1着率：前日までの365日・200R以上
{
  const state = filter.createState();
  for (let i = 0; i < 200; i += 1) filter.updateStateWithRace(state, race({ date: "20261001", order: i < 110 ? [1, 2, 3] : [2, 1, 3] }));
  const rate = filter.venueCourse1Rate(state, "18", "20261002");
  assert.equal(rate.races, 200);
  assert.equal(rate.rate, 0.55);
  assert.equal(filter.checkVenue(rate).status, "pass", "55%ちょうどは通過");
  assert.equal(filter.venueCourse1Rate(state, "18", "20261001").rate, null, "当日の結果は使わない");
  assert.equal(filter.checkVenue(filter.venueCourse1Rate(state, "18", "20271005")).status, "unknown", "365日より前は数えない");
  const low = filter.createState();
  for (let i = 0; i < 200; i += 1) filter.updateStateWithRace(low, race({ date: "20261001", jcd: "02", order: i < 100 ? [1, 2, 3] : [3, 1, 2] }));
  assert.equal(filter.checkVenue(filter.venueCourse1Rate(low, "02", "20261002")).reason, "venue-course1-low");
  // 前付けで1号艇が2コースのレースは、1コースの艇の勝ちとして数える
  const front = filter.createState();
  filter.updateStateWithRace(front, race({ date: "20261001", order: [2, 1, 3], courses: [2, 1, 3, 4, 5, 6] }));
  assert.equal(front.venues.get("18")[0].win, true);
}

// ② 水面：風速5m・波高5cmで見送り、欠けていれば判定不能
assert.equal(filter.checkWater({ windSpeed: 4, waveHeight: 4 }).status, "pass");
assert.equal(filter.checkWater({ windSpeed: 5, waveHeight: 1 }).reason, "wind-strong");
assert.equal(filter.checkWater({ windSpeed: 6, waveHeight: 1 }).reason, "wind-strong", "動画の実例（徳山・風速6m）は見送り");
assert.equal(filter.checkWater({ windSpeed: 1, waveHeight: 5 }).reason, "wave-high");
assert.equal(filter.checkWater({ windSpeed: null, waveHeight: 1 }).status, "unknown");
assert.equal(filter.checkWater(undefined).status, "unknown");

// ③ 1号艇
{
  const none = { races: 0, avgFinish: null };
  assert.equal(filter.checkBoat1(boats(), none).status, "pass");
  assert.equal(filter.checkBoat1(boats({ 1: { course: 2 }, 2: { course: 1 } }), none).reason, "boat1-not-course1");
  assert.equal(filter.checkBoat1(boats({ 1: { localWinRate: 5.49 } }), none).reason, "boat1-local-low");
  assert.equal(filter.checkBoat1(boats({ 1: { localWinRate: null } }), none).status, "unknown");
  assert.equal(filter.checkBoat1(boats({ 1: { exhibitionTime: 6.9 } }), none).status, "pass", "最速との差0.10秒ちょうどは通過");
  assert.equal(filter.checkBoat1(boats({ 1: { exhibitionTime: 6.91 } }), none).reason, "boat1-exhibition-slow");
  assert.equal(filter.checkBoat1(boats({ 4: { exhibitionTime: 0 } }), none).status, "unknown", "展示タイムが欠けた艇があれば判定不能");
  assert.equal(filter.checkBoat1(boats(), { races: 2, avgFinish: 3.6 }).reason, "boat1-series-poor");
  assert.equal(filter.checkBoat1(boats(), { races: 1, avgFinish: 6 }).status, "pass", "本節1走だけなら本節は見ない");
  assert.equal(filter.checkBoat1([], none).status, "unknown");
  assert.equal(filter.checkBoat1(boats(), { races: 0, avgFinish: null, known: false }).reason, "boat1-identity-missing", "選手が分からなければ本節は判定不能");
  assert.equal(filter.checkBoat1(boats(), { races: 3, avgFinish: 4, known: false }).reason, "boat1-series-poor");
}

// 本節：同じ場・前日までの6日以内
{
  const state = filter.createState();
  filter.updateStateWithRace(state, race({ date: "20261003", order: [2, 3, 4, 5, 6, 1], registers: { 1: "4999" } }));
  filter.updateStateWithRace(state, race({ date: "20261004", order: [2, 3, 4, 5, 1, 6], registers: { 1: "4999" } }));
  filter.updateStateWithRace(state, race({ date: "20261004", jcd: "01", order: [1, 2, 3], registers: { 1: "4999" } }));
  const series = filter.seriesRecord(state, "4999", "18", "20261005");
  assert.deepEqual(series, { races: 2, avgFinish: 5.5 }, "別の場の走は入れない");
  assert.equal(filter.seriesRecord(state, "4999", "18", "20261011").races, 0, "6日より前は本節に入れない");
}

// 3段階：1つでも外れたら見送り、外れがなく不足があれば判定不能
assert.equal(filter.combine([{ status: "pass" }, { status: "unknown", reason: "a" }, { status: "fail", reason: "b" }]).status, "fail");
assert.equal(filter.combine([{ status: "pass" }, { status: "unknown", reason: "a" }]).reason, "a");
assert.equal(filter.combine([{ status: "pass" }, { status: "pass" }]).status, "pass");

// 精算：返還艇を含む券を除く
{
  const r = race({ order: [1, 2, 3], payout: 1500, marks: { 4: "F" } });
  assert.deepEqual(filter.settle(r, ["1-2-3", "1-2-4", "1-3-2"]), { counted: 2, stake: 200, payout: 1500, hit: true });
  assert.equal(filter.BOAT1_HEAD_ALL.length, 20);
}

// 一連の集計：締切後の保存予想を除き、前日までの結果で判定する
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "race-selection-"));
  const results = path.join(dir, "results"), predictions = path.join(dir, "predictions");
  fs.mkdirSync(results); fs.mkdirSync(predictions);
  const history = [];
  for (let i = 0; i < 200; i += 1) history.push(race({ date: "20261001", raceNo: (i % 12) + 1, order: [1, 2, 3] }));
  fs.writeFileSync(path.join(results, "20261001.json"), JSON.stringify({ complete: true, races: history }));
  fs.writeFileSync(path.join(results, "20261002.json"), JSON.stringify({ complete: true, races: [race({ date: "20261002", raceNo: 1, order: [1, 2, 3], payout: 800 }), race({ date: "20261002", raceNo: 2, order: [3, 1, 2], payout: 5000 })] }));
  const record = (raceNo, weather, selectedAt = "2026-10-02T01:00:00.000Z") => ({
    date: "20261002", jcd: "18", raceNo, raceKey: `20261002-18-${raceNo}`, selectedAt, deadlineAt: "2026-10-02T02:00:00.000Z",
    prediction: {
      practicalTickets: [{ ticket: "1-2-3" }, { ticket: "1-3-2" }],
      preRaceConditions: { schemaVersion: 4, sourceTiming: "pre_deadline", officialResultUsed: false, source: "boatrace-official", sourceFetchedAt: "2026-10-02T00:50:00.000Z", weather, boats: boats() }
    }
  });
  fs.writeFileSync(path.join(predictions, "20261002.json"), JSON.stringify({
    predictions: [record(1, { windSpeed: 2, waveHeight: 2 })],
    verificationPredictions: [record(2, { windSpeed: 6, waveHeight: 2 }), record(3, { windSpeed: 1, waveHeight: 1 }, "2026-10-02T02:30:00.000Z")]
  }));
  const report = build({ results, predictions, out: path.join(dir, "out.json") });
  assert.equal(report.productionChanged, false);
  assert.equal(report.usableForPrediction, false);
  assert.equal(report.automaticApplication, false);
  assert.equal(report.saved.counts.preDeadline, 2);
  assert.equal(report.saved.counts.excluded["captured-at-or-after-deadline"], 1, "締切後に保存した予想は使わない");
  assert.equal(report.saved.overall.pass.races, 1);
  assert.equal(report.saved.overall.pass.practical.returnRate, 400);
  assert.equal(report.saved.overall.fail.races, 1);
  assert.equal(report.saved.byFailReason["wind-strong"].races, 1);
  assert.equal(report.saved.overall.all.practical.hitRate, 50);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("race selection filter tests passed");
