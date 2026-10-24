#!/usr/bin/env node
"use strict";

// 外部動画「勝ちやすいレースの選び方」の3段階チェックを、締切前保存予想と公式結果原本で検証する研究集計。
// 各日のレースは前日までの公式結果だけで場・本節を判定し、判定後にその日の結果を履歴へ積む。
//
// 2つのコホートを別々に出し、数値を混ぜない:
//   saved   … data/predictions の締切前保存予想（2026-07-22〜）。①②③すべてを判定し、チャッピーの実戦券の成績を比べる
//   results … data/results だけ（2024-01-01〜）。風・展示・当地勝率がないので①と本節だけを判定する
//
// 出力: data/stats/race-selection-backtest-v1.json
// 使い方: node --max-old-space-size=6144 scripts/build-race-selection-backtest.cjs [--results DIR] [--predictions DIR] [--out FILE]

const fs = require("fs");
const path = require("path");
const filter = require("./race-selection-filter.cjs");
const contract = require("./analysis-input-contract.js");

const RESULTS_FROM = "20240101";
// 判定条件はこの集計を初めて流す前に固定した。前半・後半で同じ傾向かを見るための区切り
const PERIOD_SPLIT = "20261001";

function parseArgs(argv) {
  const args = { results: "data/results", predictions: "data/predictions", out: "data/stats/race-selection-backtest-v1.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (["results", "predictions", "out"].includes(key) && argv[i + 1]) { args[key] = argv[i + 1]; i += 1; }
  }
  return args;
}

function listDates(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^\d{8}\.json$/.test(name)).map((name) => name.slice(0, 8)).sort();
}

function groupSet() {
  return { all: filter.emptyGroup() };
}

function add(set, key, race, tickets) {
  set[key] = set[key] || filter.emptyGroup();
  filter.addToGroup(set[key], race, tickets);
}

function summarize(set) {
  return Object.fromEntries(Object.keys(set).sort().map((key) => [key, filter.summarizeGroup(set[key])]));
}

function practicalTicketsOf(record) {
  const list = record?.prediction?.practicalTickets;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((item) => contract.normalizeTicket(item?.ticket || item)).filter(Boolean))];
}

function build({ results, predictions, out }, params = filter.DEFAULT_PARAMS) {
  const resultDates = listDates(results);
  if (!resultDates.length) throw new Error(`結果ファイルがありません: ${results}`);
  const predictionDates = new Set(listDates(predictions));
  const state = filter.createState();

  const saved = { overall: {}, byCondition: {}, byReason: {}, byPeriod: {}, byPeriodCondition: {} };
  const savedCounts = { records: 0, preDeadline: 0, excluded: {}, unsettled: 0 };
  const resultsCohort = { venue: {}, venueSeries: {} };
  const incompleteDays = [];

  for (const date of resultDates) {
    const day = JSON.parse(fs.readFileSync(path.join(results, `${date}.json`), "utf8"));
    const races = (day.races || []).map((race) => ({ ...race, date: race.date || date }));
    const evaluate = day.complete !== false;
    if (day.complete === false) incompleteDays.push(date);
    const byKey = new Map(races.map((race) => [`${date}-${race.jcd}-${race.raceNo}`, race]));

    if (evaluate && date >= RESULTS_FROM) {
      for (const race of races) {
        if (!filter.isSettledRace(race)) continue;
        const venue = filter.checkVenue(filter.venueCourse1Rate(state, race.jcd, date, params), params);
        add(resultsCohort.venue, venue.status, race, null);
        // 本節：1号艇の選手（完走した選手だけ登録番号が分かる）
        const boat1 = race.finishers.find((finisher) => finisher.boat === 1);
        const series = boat1 ? filter.seriesRecord(state, boat1.registerNo, race.jcd, date, params) : { races: 0, avgFinish: null };
        const seriesOk = !(series.races >= params.seriesMinRaces && series.avgFinish > params.maxSeriesAvgFinish);
        const key = venue.status === "pass" ? (boat1 ? (seriesOk ? "pass" : "fail-series") : "unknown-boat1") : venue.status;
        add(resultsCohort.venueSeries, key, race, null);
      }
    }

    if (evaluate && predictionDates.has(date)) {
      const data = JSON.parse(fs.readFileSync(path.join(predictions, `${date}.json`), "utf8"));
      const records = contract.mergePredictionSources(data.predictions || [], data.verificationPredictions || []);
      for (const record of records) {
        savedCounts.records += 1;
        const reason = contract.preDeadlineReason(record);
        if (reason) { savedCounts.excluded[reason] = (savedCounts.excluded[reason] || 0) + 1; continue; }
        savedCounts.preDeadline += 1;
        const race = byKey.get(contract.raceKey(record));
        if (!race || !filter.isSettledRace(race)) { savedCounts.unsettled += 1; continue; }
        const conditions = record.prediction.preRaceConditions || {};
        const boats = Array.isArray(conditions.boats) ? conditions.boats : [];
        const boat1 = boats.find((boat) => Number(boat?.boatNo) === 1);
        // 選手の登録番号が保存されていない古い予想は、公式結果の1号艇の登録番号を使う（出走表で締切前に分かる情報）。
        // どちらにもなければ本節は判定不能
        const registerNo = /^\d{4}$/.test(String(boat1?.registerNo || ""))
          ? String(boat1.registerNo)
          : String(race.finishers.find((finisher) => finisher.boat === 1)?.registerNo || "");
        const series = /^\d{4}$/.test(registerNo)
          ? filter.seriesRecord(state, registerNo, race.jcd, date, params)
          : { races: 0, avgFinish: null, known: false };
        const checks = {
          venue: filter.checkVenue(filter.venueCourse1Rate(state, race.jcd, date, params), params),
          water: filter.checkWater(conditions.weather, params),
          boat1: filter.checkBoat1(boats, series, params)
        };
        const overall = filter.combine([checks.venue, checks.water, checks.boat1]);
        const tickets = practicalTicketsOf(record);
        const period = date < PERIOD_SPLIT ? "before-20261001" : "from-20261001";
        add(saved.overall, overall.status, race, tickets);
        add(saved.overall, "all", race, tickets);
        saved.byPeriod[period] = saved.byPeriod[period] || {};
        add(saved.byPeriod[period], overall.status, race, tickets);
        add(saved.byPeriod[period], "all", race, tickets);
        for (const [name, check] of Object.entries(checks)) {
          saved.byCondition[name] = saved.byCondition[name] || {};
          add(saved.byCondition[name], check.status, race, tickets);
          const periodKey = `${period}:${name}`;
          saved.byPeriodCondition[periodKey] = saved.byPeriodCondition[periodKey] || {};
          add(saved.byPeriodCondition[periodKey], check.status, race, tickets);
        }
        if (overall.reason) add(saved.byReason, overall.reason, race, tickets);
      }
    }

    for (const race of races) filter.updateStateWithRace(state, race);
  }

  const report = {
    version: filter.VERSION,
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    source: "外部動画「勝ちやすいレースの選び方」（フナフェッショナル／あべけん）。ユーザーが貼った文字起こしと要約から作成。動画本体は未視聴",
    params,
    periodSplit: PERIOD_SPLIT,
    notes: [
      "閾値は動画に数値がないものを含め、集計を初めて流す前に固定した仮置き",
      "場の1コース1着率と本節は、その日より前の公式結果だけで判定（当日の先行レースは使わない）",
      "安定板の使用は保存データにないため判定していない",
      "practical はチャッピーの保存済み実戦券（1点100円）。boat1Head20 は1号艇1着・2・3着全部の20点（1点100円）",
      "フライング・出遅れ・欠場艇を含む券は返還として購入額・払戻から除外",
      "saved は締切前判定（analysis-input-contract）を通した保存予想だけ。チャッピーが選んだレースだけなので全レースの代表ではない",
      "results は風・展示・当地勝率がなく、①と本節だけの判定。完走しなかった1号艇の選手は登録番号が分からず本節を判定できない"
    ],
    saved: {
      counts: savedCounts,
      overall: summarize(saved.overall),
      byPeriod: Object.fromEntries(Object.keys(saved.byPeriod).sort().map((key) => [key, summarize(saved.byPeriod[key])])),
      byCondition: Object.fromEntries(Object.keys(saved.byCondition).map((key) => [key, summarize(saved.byCondition[key])])),
      byPeriodCondition: Object.fromEntries(Object.keys(saved.byPeriodCondition).sort().map((key) => [key, summarize(saved.byPeriodCondition[key])])),
      byFailReason: summarize(saved.byReason)
    },
    results: {
      from: RESULTS_FROM,
      venue: summarize(resultsCohort.venue),
      venueAndSeries: summarize(resultsCohort.venueSeries)
    },
    incompleteDaysSkipped: incompleteDays.length
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  const report = build(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ saved: report.saved.overall, counts: report.saved.counts }, null, 2));
}

module.exports = { build, PERIOD_SPLIT, RESULTS_FROM };
