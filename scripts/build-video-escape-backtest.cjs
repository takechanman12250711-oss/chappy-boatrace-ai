#!/usr/bin/env node
"use strict";

// 公式結果原本 data/results/*.json だけから、動画のイン逃げ選定ルールを日付順に再現する。
// 各日のレースは「その日より前の結果」だけで判定し、判定後にその日の結果を履歴へ積む。
//
// 出力:
//   data/stats/video-escape-backtest-v1.json     … 条件別・年別の的中率と回収率
//   data/stats/video-escape-racer-recent-v1.json … 最新時点の選手別「枠別過去10走」「コース別ST」
//
// 使い方: node scripts/build-video-escape-backtest.cjs [--from YYYYMMDD] [--results DIR] [--out DIR]

const fs = require("fs");
const path = require("path");
const filter = require("./video-escape-filter.cjs");

function parseArgs(argv) {
  const args = { from: "20240101", results: "data/results", out: "data/stats" };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (["from", "results", "out"].includes(key) && argv[i + 1]) {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  if (!/^\d{8}$/.test(args.from)) throw new Error(`--from は YYYYMMDD: ${args.from}`);
  return args;
}

function listResultFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => ({ date: name.slice(0, 8), file: path.join(dir, name) }));
}

function cohortSet() {
  return { all: filter.emptyCohort(), byYear: {} };
}

function addToCohortSet(set, race) {
  filter.addRaceToCohort(set.all, race);
  const year = String(race.date).slice(0, 4);
  set.byYear[year] = set.byYear[year] || filter.emptyCohort();
  filter.addRaceToCohort(set.byYear[year], race);
}

function summarizeSet(set) {
  return {
    all: filter.summarizeCohort(set.all),
    byYear: Object.fromEntries(
      Object.keys(set.byYear).sort().map((year) => [year, filter.summarizeCohort(set.byYear[year])])
    )
  };
}

function build({ from, results, out }, params = filter.DEFAULT_PARAMS) {
  const files = listResultFiles(results);
  if (!files.length) throw new Error(`結果ファイルがありません: ${results}`);

  const state = filter.createState();
  const cohorts = {
    baseline: cohortSet(),
    filter1: cohortSet(),
    filter12: cohortSet(),
    filter12wall: cohortSet()
  };
  const statusCounts = {};
  const boatOneUnknown = { refundedForBoatOne: 0, boatOneStartedButNotFinished: 0 };
  let evaluatedRaces = 0;
  let racesWithUnknownOtherBoat = 0;
  let filter1WithUnknownOtherBoat = 0;
  let settledRacesRead = 0;

  for (const { date, file } of files) {
    const day = JSON.parse(fs.readFileSync(file, "utf8"));
    const races = (day.races || [])
      .filter(filter.isSettledRace)
      .map((race) => ({ ...race, date: race.date || date }));
    settledRacesRead += races.length;

    if (date >= from) {
      for (const race of races) {
        addToCohortSet(cohorts.baseline, race);
        const evaluation = filter.evaluateEntries(state, filter.entriesFromResult(race), params);
        statusCounts[evaluation.status] = (statusCounts[evaluation.status] || 0) + 1;
        if (evaluation.status === "boat1-unknown") {
          if (filter.refundedBoats(race).has(1)) boatOneUnknown.refundedForBoatOne += 1;
          else boatOneUnknown.boatOneStartedButNotFinished += 1;
          continue;
        }
        if (evaluation.status !== "evaluated") continue;
        evaluatedRaces += 1;
        if (evaluation.unknownBoats.length) racesWithUnknownOtherBoat += 1;
        if (evaluation.filter1) {
          addToCohortSet(cohorts.filter1, race);
          if (evaluation.unknownBoats.length) filter1WithUnknownOtherBoat += 1;
        }
        if (evaluation.filter12) addToCohortSet(cohorts.filter12, race);
        if (evaluation.filter12wall) addToCohortSet(cohorts.filter12wall, race);
      }
    }
    for (const race of races) filter.updateStateWithRace(state, race, params);
  }

  const firstDate = files[0].date;
  const lastDate = files[files.length - 1].date;

  const report = {
    version: filter.VERSION,
    purpose: "外部動画のイン逃げ選定ルールを公式結果原本で前向きに再現した研究集計",
    source: {
      video: "https://www.youtube.com/watch?v=MbNrZ4cx3aQ",
      videoTitle: "初心者でも的中率8割を狙う3連単の買い方とレースの選び方（フナフェッショナル／あべけん, 2026-10-20）",
      rulesFrom: "ユーザーがGeminiで作成した動画要約（動画本体は未視聴）",
      results: `${results}/*.json`,
      resultDateRange: [firstDate, lastDate],
      settledRacesRead
    },
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    evaluation: {
      from,
      to: lastDate,
      noLookahead: "各日のレースはその日より前の公式結果だけで判定し、判定後にその日の結果を履歴へ積む",
      params,
      rules: {
        filter1: "1号艇の選手が1枠の直近10走で1着7回以上、かつ2〜6号艇の選手が各自の枠の直近10走で1着3回以下",
        filter12: "filter1 かつ 1号艇の1コース平均ST（直近10回）が他5艇の各自コース平均ST以下（枠なり前提）",
        filter12wall: "filter12 かつ 2・3号艇の平均STが1号艇+wallMarginSec以内（壁の数値は動画になく仮置き）"
      },
      notBacktested: [
        "③当日展示（展示ST・展示タイム）: 結果原本に含まれないため未検証。evaluateExhibitionは当日運用向けの仮置き閾値",
        "最低オッズによる見送り: 締切前の全120通りオッズが結果原本にないため未検証。evaluateOddsは当日運用向け"
      ],
      knownBiases: [
        "完走しなかった選手は登録番号が結果原本にないため、その走は履歴に入らない（転覆・F等の回が欠ける）",
        "完走しなかった2〜6号艇は選手不明のため、その艇の『1着3回以下』判定を省略して通過扱い",
        "1号艇が完走しなかったレースは選手不明で判定できず除外。内訳をboatOneUnknownに記録",
        "フライング・出遅れ・欠場艇を含む舟券は返還として購入額・払戻から除外。それ以外の返還（不成立）はレース単位で除外済み"
      ],
      statusCounts,
      boatOneUnknown,
      evaluatedRaces,
      racesWithUnknownOtherBoat,
      filter1WithUnknownOtherBoat
    },
    cohorts: Object.fromEntries(Object.entries(cohorts).map(([key, set]) => [key, summarizeSet(set)]))
  };

  // 当日運用向けスナップショット: 最新結果日から365日以内に完走記録のある選手
  const cutoff = new Date(Date.UTC(+lastDate.slice(0, 4), +lastDate.slice(4, 6) - 1, +lastDate.slice(6, 8)));
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffText = cutoff.toISOString().slice(0, 10).replace(/-/g, "");
  const racers = {};
  for (const registerNo of [...state.keys()].sort()) {
    const record = state.get(registerNo);
    if (record.lastDate < cutoffText) continue;
    racers[registerNo] = { lastDate: record.lastDate, frames: record.frames, courseSt: record.courseSt };
  }
  const snapshot = {
    version: `${filter.VERSION}-racer-recent`,
    asOfResultDate: lastDate,
    description: "選手別の枠別直近10走の着順（古い→新しい）と、実進入コース別の直近10回ST（F・出遅れ除く）",
    productionChanged: false,
    usableForPrediction: false,
    windowSize: params.windowSize,
    stWindowSize: params.stWindowSize,
    racerCount: Object.keys(racers).length,
    racers
  };

  fs.mkdirSync(out, { recursive: true });
  const reportPath = path.join(out, "video-escape-backtest-v1.json");
  const snapshotPath = path.join(out, "video-escape-racer-recent-v1.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`);
  return { report, snapshot, reportPath, snapshotPath };
}

if (require.main === module) {
  const { report, snapshot, reportPath, snapshotPath } = build(parseArgs(process.argv.slice(2)));
  const line = (key) => {
    const s = report.cohorts[key].all;
    const f12 = s.formations.f12;
    const f4 = s.formations.f4;
    return `${key.padEnd(13)} ${String(s.races).padStart(7)}R  1逃げ${s.boatOneWinRatePct}%  ` +
      `12点 的中${f12.hitRatePct}% 回収${f12.roiPct}%  4点 的中${f4.hitRatePct}% 回収${f4.roiPct}%`;
  };
  console.log(`${report.evaluation.from}〜${report.evaluation.to}`);
  for (const key of Object.keys(report.cohorts)) console.log(line(key));
  console.log(`保存: ${reportPath} / ${snapshotPath}（${snapshot.racerCount}人）`);
}

module.exports = { build, parseArgs };
