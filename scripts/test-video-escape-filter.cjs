#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const filter = require("./video-escape-filter.cjs");
const { build } = require("./build-video-escape-backtest.cjs");

const REG = { 1: "4001", 2: "4002", 3: "4003", 4: "4004", 5: "4005", 6: "4006" };

function race({ date = "20240101", jcd = "01", raceNo = 1, order, sts = {}, refund = {}, payout = 1000, missing = [] }) {
  const finishers = order
    .filter((boat) => !missing.includes(boat))
    .map((boat, index) => ({ rank: index + 1, boat, registerNo: REG[boat], racerName: "", raceTime: "" }));
  const starts = [1, 2, 3, 4, 5, 6]
    .filter((boat) => refund[boat] !== "absent")
    .map((boat) => ({
      course: boat,
      boat,
      st: sts[boat] ?? 0.15,
      falseStart: refund[boat] === "F",
      lateStart: refund[boat] === "L"
    }));
  return {
    date, jcd, raceNo, status: "finished", void: false, finishers, starts,
    trifecta: { boats: order.slice(0, 3), payout }
  };
}

// フォーメーション
assert.strictEqual(filter.expandFormation(filter.FORMATIONS.f12).length, 12, "1-234-全は12点");
assert.deepStrictEqual(
  filter.expandFormation(filter.FORMATIONS.f4).map((t) => t.join("-")),
  ["1-2-3", "1-2-4", "1-3-2", "1-3-4"],
  "動画の4点買い"
);

// 枠別過去10走は直近10件だけを保持し、未来の結果を判定に混ぜない
{
  const state = filter.createState();
  for (let i = 0; i < 3; i += 1) filter.updateStateWithRace(state, race({ order: [2, 1, 3, 4, 5, 6] }));
  for (let i = 0; i < 7; i += 1) filter.updateStateWithRace(state, race({ order: [1, 2, 3, 4, 5, 6], sts: { 1: 0.10 } }));
  let result = filter.evaluateEntries(state, REG);
  assert.strictEqual(result.boats[0].frameWins, 7);
  assert.strictEqual(result.filter1, true, "1枠10走7勝・他艇3勝以下で通過");
  assert.strictEqual(result.boats[1].frameWins, 3, "2号艇は2枠で3勝");
  assert.strictEqual(result.boats[0].avgSt, 0.115,"1コース平均ST（0.15×3 + 0.10×7）/10");
  assert.strictEqual(result.filter12, true, "1号艇の平均STが最速");

  filter.updateStateWithRace(state, race({ order: [2, 1, 3, 4, 5, 6] }));
  result = filter.evaluateEntries(state, REG);
  assert.strictEqual(result.boats[0].frameSamples, 10, "11走目で最古の1件が外れる");
  assert.strictEqual(result.boats[0].frameWins, 7, "古い2着が落ちて新しい2着が入る");
  assert.strictEqual(result.boats[1].frameWins, 3, "2号艇は最古の1勝が外れ、新しい1勝が入って3勝のまま");

  assert.strictEqual(result.filter1, true);

  state.get("4002").frames[2] = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2];
  result = filter.evaluateEntries(state, REG);
  assert.strictEqual(result.boats[1].frameWins, 4, "2号艇が2枠の直近10走で4勝");
  assert.strictEqual(result.checks.boatOneStrong, true);
  assert.strictEqual(result.filter1, false, "他艇4勝で不通過");
}

// 選手不明の2〜6号艇がいれば判定しない（完走したかはレース後の情報）
{
  const state = filter.createState();
  for (let i = 0; i < 10; i += 1) filter.updateStateWithRace(state, race({ order: [1, 2, 3, 4, 5, 6], sts: { 1: 0.10 } }));
  assert.strictEqual(filter.evaluateEntries(state, REG).filter1, true);
  const result = filter.evaluateEntries(state, { ...REG, 4: null });
  assert.strictEqual(result.status, "other-boat-unknown");
  assert.strictEqual(result.filter1, undefined, "弱い相手として通過させない");
}

// 相手が自分の枠で10走そろわなければ判定しない
{
  const state = filter.createState();
  for (let i = 0; i < 10; i += 1) filter.updateStateWithRace(state, race({ order: [1, 2, 3, 4, 5, 6], sts: { 1: 0.10 } }));
  state.get("4003").frames[3] = [2, 2, 2, 2, 2, 2, 2, 2, 2];
  assert.strictEqual(filter.evaluateEntries(state, REG).status, "other-boat-insufficient-history", "3号艇は3枠9走");
}

// 5艇すべての平均STがそろわなければ「1号艇が最速」にしない
{
  const state = filter.createState();
  for (let i = 0; i < 10; i += 1) filter.updateStateWithRace(state, race({ order: [1, 2, 3, 4, 5, 6], sts: { 1: 0.10 } }));
  state.get("4005").courseSt[5] = [0.05, 0.05];
  const result = filter.evaluateEntries(state, REG);
  assert.strictEqual(result.boats[4].avgSt, null, "5号艇は2回だけで平均なし");
  assert.strictEqual(result.checks.stComparable, false);
  assert.strictEqual(result.filter1, true);
  assert.strictEqual(result.filter12, false, "比較できない艇がいれば最速と判定しない");
}

// 1号艇の10走不足は判定しない
{
  const state = filter.createState();
  for (let i = 0; i < 9; i += 1) filter.updateStateWithRace(state, race({ order: [1, 2, 3, 4, 5, 6] }));
  assert.strictEqual(filter.evaluateEntries(state, REG).status, "boat1-insufficient-history");
}

// F・出遅れのSTは平均へ入れず、その艇を含む券は返還
{
  const state = filter.createState();
  const fRace = race({ order: [1, 3, 4, 5, 6], missing: [2], refund: { 2: "F" }, sts: { 2: 0.01 } });
  filter.updateStateWithRace(state, fRace);
  assert.strictEqual(state.get("4002"), undefined, "完走していない選手は登録番号がなく履歴に入らない");
  assert.deepStrictEqual([...filter.refundedBoats(fRace)], [2]);
  const f4 = filter.settleTickets(fRace, filter.expandFormation(filter.FORMATIONS.f4));
  assert.strictEqual(f4.refundedTickets, 3, "1-2-3,1-2-4,1-3-2が返還");
  assert.strictEqual(f4.stake, 100, "1-3-4だけが購入扱い");
  assert.strictEqual(f4.hit, true);
  assert.strictEqual(f4.returned, 1000);
}

// 欠場（スタート記録なし）も返還
{
  const absent = race({ order: [1, 2, 3, 4, 5], missing: [6], refund: { 6: "absent" } });
  assert.deepStrictEqual([...filter.refundedBoats(absent)], [6]);
  const f12 = filter.settleTickets(absent, filter.expandFormation(filter.FORMATIONS.f12));
  assert.strictEqual(f12.stake, 900, "6を含む3点が返還");
}

// 当日展示: へこみと外の伸び
{
  const base = {
    startExhibition: [1, 2, 3, 4, 5, 6].map((boat) => ({ course: boat, boat, st: 0.12, marker: "", isOfficialCourse: true })),
    entries: [1, 2, 3, 4, 5, 6].map((boat) => ({ boat, exhibition: { displayTime: 6.80 } }))
  };
  assert.strictEqual(filter.evaluateExhibition(base).pass, true);
  const dent = JSON.parse(JSON.stringify(base));
  dent.startExhibition[0].st = 0.18;
  assert.strictEqual(filter.evaluateExhibition(dent).checks.noStartDent, false, "1号艇が0.06遅れはへこみ");
  const nobi = JSON.parse(JSON.stringify(base));
  nobi.entries[4].exhibition.displayTime = 6.72;
  assert.strictEqual(filter.evaluateExhibition(nobi).checks.noOuterNobi, false, "5号艇が0.08速い");
  const nobiEdge = JSON.parse(JSON.stringify(base));
  nobiEdge.entries[4].exhibition.displayTime = 6.75;
  assert.strictEqual(filter.evaluateExhibition(nobiEdge).checks.noOuterNobi, false, "ちょうど0.05速い（6.80-6.75）も伸びとして扱う");
  const dentEdge = JSON.parse(JSON.stringify(base));
  dentEdge.startExhibition[0].st = 0.17;
  assert.strictEqual(filter.evaluateExhibition(dentEdge).checks.noStartDent, false, "ちょうど0.05遅れ（0.17-0.12）もへこみ");
  const flying = JSON.parse(JSON.stringify(base));
  flying.startExhibition[1] = { course: 2, boat: 2, st: 0.03, marker: "F", isOfficialCourse: true };
  assert.strictEqual(filter.evaluateExhibition(flying).checks.noStartDent, false, "展示F.03は-0.03扱いで、1号艇は0.15遅れ");
  assert.strictEqual(filter.evaluateExhibition({ entries: [] }).pass, null, "展示前は判定なし");
  const legacy = JSON.parse(JSON.stringify(base));
  legacy.startExhibition.forEach((row) => { row.isOfficialCourse = false; row.mappingSource = "legacy-course-order"; });
  assert.strictEqual(filter.evaluateExhibition(legacy).available, false, "仮の枠なり行は進入が不明なので判定なし");
  assert.strictEqual(filter.evaluateExhibition(legacy).pass, null);
  const swapped = JSON.parse(JSON.stringify(base));
  swapped.startExhibition[3].course = 5;
  swapped.startExhibition[4].course = 4;
  assert.strictEqual(filter.evaluateExhibition(swapped).checks.frameOrderEntry, false, "4・5号艇の入れ替えは枠なりでない");
  assert.strictEqual(filter.evaluateExhibition(swapped).pass, false);
  const duplicated = JSON.parse(JSON.stringify(base));
  duplicated.startExhibition[5].course = 5;
  assert.strictEqual(filter.evaluateExhibition(duplicated).available, false, "コースが重複すれば判定なし");
}

// オッズ見送り
{
  const odds = { "1-2-3": 4.0, "1-2-4": 9.1, "1-3-2": 6.2, "1-3-4": 12.5 };
  const ok = filter.evaluateOdds(odds, "f4");
  assert.strictEqual(ok.pass, true, "最低4.0倍×100円=400円 ≥ 4点400円");
  const ng = filter.evaluateOdds({ ...odds, "1-2-3": 3.9 }, "f4");
  assert.strictEqual(ng.pass, false);
  assert.strictEqual(filter.evaluateOdds({ "1-2-3": 4.0 }, "f4").available, false, "オッズ不足は判定なし");
}

// ビルド: 当日の結果は当日の判定に使わない
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "video-escape-"));
  const results = path.join(dir, "results");
  const out = path.join(dir, "out");
  fs.mkdirSync(results);
  const write = (date, races) => fs.writeFileSync(path.join(results, `${date}.json`), JSON.stringify({ races }));
  const days = [];
  for (let d = 1; d <= 10; d += 1) days.push(`202401${String(d).padStart(2, "0")}`);
  days.forEach((date) => write(date, [race({ date, order: [1, 2, 3, 4, 5, 6], payout: 500 })]));
  // 11日目: 1レース目の時点では10走10勝で通過、同日2レース目も同じ（当日1R目の結果を足さない）
  write("20240111", [
    race({ date: "20240111", raceNo: 1, order: [2, 1, 3, 4, 5, 6], payout: 3000 }),
    race({ date: "20240111", raceNo: 2, order: [1, 3, 2, 4, 5, 6], payout: 800 })
  ]);
  // 収集途中の日は判定しないが、確定済みレースは翌日以降の履歴に積む
  fs.writeFileSync(path.join(results, "20240112.json"), JSON.stringify({
    complete: false,
    races: [race({ date: "20240112", raceNo: 1, order: [1, 2, 3, 4, 5, 6], payout: 500 })]
  }));
  const { report, snapshot } = build({ from: "20240111", results, out });
  assert.strictEqual(report.evaluation.incompleteDaysSkipped, 1);
  assert.deepStrictEqual(report.evaluation.incompleteDays, ["20240112"]);
  const f1 = report.cohorts.filter1.all;
  assert.strictEqual(report.cohorts.baseline.all.races, 2);
  assert.strictEqual(f1.races, 2, "同日の2Rとも前日までの履歴で判定");
  assert.strictEqual(f1.formations.f4.hitRaces, 1, "1-3-2だけ的中");
  assert.strictEqual(f1.formations.f4.stakeYen, 800);
  assert.strictEqual(f1.formations.f4.returnedYen, 800);
  assert.strictEqual(f1.formations.f12.returnedYen, 800, "2-1-3は12点に含まれない");
  assert.strictEqual(report.usableForPrediction, false);
  assert.strictEqual(snapshot.racers["4001"].frames["1"].length, 10, "スナップショットは最新までの10走");
  assert.strictEqual(snapshot.racers["4001"].frames["1"].filter((r) => r === 1).length, 9, "収集途中の日の1着も履歴に入る");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("video-escape-filter: all checks passed");
