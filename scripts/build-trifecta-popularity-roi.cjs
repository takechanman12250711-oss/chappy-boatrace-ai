#!/usr/bin/env node
"use strict";

// 公式結果原本だけから「3連単を人気帯ごとに全点買い続けた場合」の的中率・回収率を出す研究集計。
// 外部動画（あべけん「月100万円稼ぐ舟券プロの7つの共通点」）の「大穴1発狙いはやらない」の検証用。
// 人気は締切後の確定オッズ基準のため、締切前に買える人気順とは一致しない。
// productionChanged=false / usableForPrediction=false。
//
// 使い方: node scripts/build-trifecta-popularity-roi.cjs [--from YYYYMMDD] [--results DIR] [--out FILE]

const fs = require("fs");
const path = require("path");

const VERSION = "trifecta-popularity-roi-v1";
const BANDS = Object.freeze([
  [1, 1], [2, 3], [4, 10], [11, 30], [31, 60], [61, 120]
]);

function parseArgs(argv) {
  const args = { from: "20240101", results: "data/results", out: "data/stats/trifecta-popularity-roi-v1.json" };
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

function isCountable(race) {
  const trifecta = race?.trifecta;
  return race?.status === "finished" &&
    race.void !== true &&
    Number.isInteger(trifecta?.popularity) &&
    trifecta.popularity >= 1 && trifecta.popularity <= 120 &&
    Number.isFinite(trifecta?.payout) && trifecta.payout > 0;
}

// 3着以内に同着があると公式の3連単払戻は複数組になるが、結果原本は1組しか持たないため集計から外す。
function hasTopThreeDeadHeat(race) {
  const ranks = (Array.isArray(race?.finishers) ? race.finishers : [])
    .map((finisher) => Number(finisher?.rank))
    .filter((rank) => rank >= 1 && rank <= 3);
  return new Set(ranks).size !== ranks.length;
}

// 6艇がそろって正常にスタートしなかったレースは、存在しない券や返還券が出て帯の点数どおりに買えないため外す。
function hasRefundOrMissingStart(race) {
  const starts = Array.isArray(race?.starts) ? race.starts : [];
  const boats = new Set(starts.map((start) => Number(start?.boat)).filter((boat) => boat >= 1 && boat <= 6));
  return boats.size !== 6 || starts.some((start) => start?.falseStart || start?.lateStart);
}

function emptyTally() {
  return { races: 0, hits: Object.fromEntries(BANDS.map(([lo, hi]) => [`${lo}-${hi}`, { hits: 0, payout: 0 }])) };
}

function addRace(tally, race) {
  tally.races += 1;
  const popularity = race.trifecta.popularity;
  const band = BANDS.find(([lo, hi]) => popularity >= lo && popularity <= hi);
  const bucket = tally.hits[`${band[0]}-${band[1]}`];
  bucket.hits += 1;
  bucket.payout += race.trifecta.payout;
}

function summarize(tally) {
  return BANDS.map(([lo, hi]) => {
    const key = `${lo}-${hi}`;
    const tickets = hi - lo + 1;
    const { hits, payout } = tally.hits[key];
    const stake = tally.races * tickets * 100;
    return {
      band: key,
      ticketsPerRace: tickets,
      hitRatePct: tally.races ? Math.round((hits / tally.races) * 1000) / 10 : null,
      roiPct: stake ? Math.round((payout / stake) * 1000) / 10 : null,
      hitRaces: hits,
      stakeYen: stake,
      returnedYen: payout
    };
  });
}

function build({ from, results, out }) {
  const files = fs.readdirSync(results).filter((name) => /^\d{8}\.json$/.test(name)).sort();
  const all = emptyTally();
  const byYear = {};
  let skipped = 0;
  let deadHeats = 0;
  let refundRaces = 0;
  const incompleteDays = [];
  let lastCountedDate = null;
  for (const name of files) {
    const date = name.slice(0, 8);
    if (date < from) continue;
    const day = JSON.parse(fs.readFileSync(path.join(results, name), "utf8"));
    // 収集途中の日は確定済みレースだけが偏って残るため、日ごと集計から外す。
    if (day.complete === false) {
      incompleteDays.push(date);
      continue;
    }
    lastCountedDate = date;
    for (const race of day.races || []) {
      if (isCountable(race) && hasTopThreeDeadHeat(race)) {
        deadHeats += 1;
        continue;
      }
      if (isCountable(race) && hasRefundOrMissingStart(race)) {
        refundRaces += 1;
        continue;
      }
      if (!isCountable(race)) {
        if (race?.status === "finished" && race.void !== true) skipped += 1;
        continue;
      }
      addRace(all, race);
      const year = date.slice(0, 4);
      byYear[year] = byYear[year] || emptyTally();
      addRace(byYear[year], race);
    }
  }
  const report = {
    version: VERSION,
    purpose: "3連単を確定人気帯ごとに全点100円で買い続けた場合の的中率・回収率",
    source: {
      video: "https://www.youtube.com/watch?v=7kS9-_UTS9I",
      claim: "大穴1発狙いはやらない（本命軸を積み重ねる）",
      results: `${results}/*.json`
    },
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    caveats: [
      "人気は締切後の確定オッズ基準。締切前に同じ人気順で買えるとは限らない",
      "不成立レースは除外",
      "3着以内の同着レースは払戻が1組しか保存されていないため除外",
      "6艇がそろって正常にスタートしなかったレース（欠場・F・出遅れ）は返還券・存在しない券が出るため除外",
      "収集途中（complete: false）の日は確定済みレースだけが残る偏りがあるため日ごと除外",
      "回収率は各帯の全点を毎レース買う前提。帯内の一部だけを選ぶ買い方の成績ではない"
    ],
    from,
    to: lastCountedDate,
    incompleteDaysExcluded: incompleteDays.length,
    incompleteDays,
    racesCounted: all.races,
    finishedRacesWithoutPopularity: skipped,
    topThreeDeadHeatsExcluded: deadHeats,
    refundOrMissingStartExcluded: refundRaces,
    all: summarize(all),
    byYear: Object.fromEntries(Object.keys(byYear).sort().map((year) => [year, { races: byYear[year].races, bands: summarize(byYear[year]) }]))
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const report = build(args);
  console.log(`${report.from}〜${report.to} ${report.racesCounted}R`);
  for (const row of report.all) {
    console.log(`${row.band.padEnd(7)}番人気 ${String(row.ticketsPerRace).padStart(2)}点 的中${row.hitRatePct}% 回収${row.roiPct}%`);
  }
  console.log(`保存: ${args.out}`);
}

module.exports = { build, BANDS, isCountable, hasTopThreeDeadHeat, hasRefundOrMissingStart };
