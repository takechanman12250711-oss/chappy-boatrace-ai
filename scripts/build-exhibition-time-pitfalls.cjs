#!/usr/bin/env node
"use strict";

// 外部動画（「【極秘】"展示タイム"を見るだけでは勝てません｜本当の使い方を完全公開」）の
// 展示タイムの落とし穴3点を、締切前保存予想と公式結果だけで検証する研究集計。
// ①引き波（艇番ごとの展示タイムの偏り） ②荒れ水面 ③計測位置が異なる4場。
// 目展示（行き足・ターン）と周回展示の走行位置はデータがないため対象外。
// productionChanged=false / usableForPrediction=false / automaticApplication=false。
//
// 使い方: node scripts/build-exhibition-time-pitfalls.cjs [--out FILE]

const fs = require("fs");
const path = require("path");
const contract = require("./analysis-input-contract.js");

const VERSION = "exhibition-time-pitfalls-v1";

// 結果を見る前に固定した条件（2026-10-22）。
const FIXED = Object.freeze({
  exploredFrom: "20260722",
  exploredTo: "20260915",
  holdoutFrom: "20260916",
  exhibitionTimeRange: [6.0, 7.5],
  roughWindSpeedMin: 5,      // 風速5m以上
  roughWaveHeightMin: 5,     // 波高5cm以上
  differentMeasurementVenues: ["13", "18", "22", "24"], // 尼崎・徳山・福岡・大村
  minRacesForConclusion: 100
});

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (source && source[key] !== undefined) out[key] = source[key];
  return out;
}

// 必要な項目だけを残して読み込み、メモリを抑える。
function compactPredictionRecord(record) {
  const prediction = record?.prediction || {};
  const conditions = prediction.preRaceConditions || {};
  return {
    ...pick(record, ["raceKey", "date", "jcd", "raceNo", "deadlineAt", "deadline", "selectedAt", "capturedAt", "createdAt",
      "isRetrospective", "verificationMode", "officialResultUsedForPrediction", "officialResultUsedForEvaluation"]),
    prediction: {
      ...pick(prediction, ["predictionMode", "officialResultUsedForPrediction", "officialResultUsedForEvaluation", "isRetrospective"]),
      preRaceConditions: {
        ...pick(conditions, ["schemaVersion", "sourceTiming", "officialResultUsed", "source", "dataSource", "sourceFetchedAt"]),
        weather: pick(conditions.weather || {}, ["windSpeed", "waveHeight"]),
        boats: (Array.isArray(conditions.boats) ? conditions.boats : [])
          .map((boat) => pick(boat, ["boatNo", "course", "courseOfficial", "exhibitionTime"]))
      }
    }
  };
}

// 同タイムは平均順位にする。
function averageRanks(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = rank;
    i = j + 1;
  }
  return ranks;
}

function spearman(a, b) {
  const n = a.length;
  const mean = (list) => list.reduce((sum, v) => sum + v, 0) / n;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

// 締切前保存の6艇の展示タイム・公式進入と、公式結果の着順を1レースにまとめる。
// 完走しなかった艇（転覆・F・出遅れなど）は最下位タイとして扱い、レースは除外しない。
function extractRace(record) {
  const conditions = record?.prediction?.preRaceConditions || {};
  const boats = Array.isArray(conditions.boats) ? conditions.boats : [];
  const [lo, hi] = FIXED.exhibitionTimeRange;
  if (boats.length !== 6) return { reason: "boats-not-six" };
  const rows = boats.map((boat) => ({ boat: Number(boat.boatNo), course: Number(boat.course), official: boat.courseOfficial === true, ex: Number(boat.exhibitionTime) }));
  if (new Set(rows.map((row) => row.boat)).size !== 6 || rows.some((row) => !(row.boat >= 1 && row.boat <= 6))) return { reason: "boats-not-six" };
  if (rows.some((row) => !(row.ex > lo && row.ex < hi))) return { reason: "exhibition-time-missing" };
  if (rows.some((row) => !row.official) || new Set(rows.map((row) => row.course)).size !== 6 || rows.some((row) => !(row.course >= 1 && row.course <= 6))) {
    return { reason: "official-course-missing" };
  }
  const windSpeed = Number(conditions.weather?.windSpeed);
  const waveHeight = Number(conditions.weather?.waveHeight);
  if (!Number.isFinite(windSpeed) || !Number.isFinite(waveHeight)) return { reason: "weather-missing" };

  const result = record.__officialResult || {};
  const starts = Array.isArray(result.starts) ? result.starts : [];
  if (new Set(starts.map((start) => Number(start?.boat)).filter((boat) => boat >= 1 && boat <= 6)).size !== 6) return { reason: "absent-boat" };
  const finishRankByBoat = new Map();
  for (const finisher of Array.isArray(result.finishers) ? result.finishers : []) {
    const rank = Number(finisher?.rank);
    const boat = Number(finisher?.boat);
    if (rank >= 1 && rank <= 6 && boat >= 1 && boat <= 6) finishRankByBoat.set(boat, rank);
  }
  if (!finishRankByBoat.size) return { reason: "finish-missing" };
  const missing = rows.filter((row) => !finishRankByBoat.has(row.boat)).length;
  const tiedLast = (6 - missing + 1 + 6) / 2;
  for (const row of rows) row.finish = finishRankByBoat.has(row.boat) ? finishRankByBoat.get(row.boat) : tiedLast;
  rows.sort((a, b) => a.boat - b.boat);
  const key = record.__analysisRaceKey || contract.raceKey(record);
  return { race: { key, date: key.slice(0, 8), jcd: key.slice(9, 11), windSpeed, waveHeight, rows } };
}

function period(date) {
  if (date >= FIXED.exploredFrom && date <= FIXED.exploredTo) return "explored";
  if (date >= FIXED.holdoutFrom) return "holdout";
  return null;
}

function isRough(race) {
  return race.windSpeed >= FIXED.roughWindSpeedMin || race.waveHeight >= FIXED.roughWaveHeightMin;
}

// 艇番ごとの「レース内平均との差」（秒、マイナスほど速い）。
function boatBias(races) {
  const sums = {};
  for (let boat = 1; boat <= 6; boat += 1) sums[boat] = { sum: 0, n: 0 };
  for (const race of races) {
    const mean = race.rows.reduce((sum, row) => sum + row.ex, 0) / 6;
    for (const row of race.rows) {
      sums[row.boat].sum += row.ex - mean;
      sums[row.boat].n += 1;
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([boat, { sum, n }]) => [boat, n ? Math.round((sum / n) * 10000) / 10000 : null]));
}

function round(value, digits) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
}

// 展示タイム順（adjust適用後）の予測力。top: 最速艇（同タイムは等分）の1着率、rho: 展示順位と着順の順位相関の平均。
function metrics(races, adjust = null) {
  let topWins = 0;
  let rhoSum = 0;
  let rhoN = 0;
  let courseRhoSum = 0;
  let courseRhoN = 0;
  for (const race of races) {
    const times = race.rows.map((row) => row.ex - (adjust ? adjust[row.boat] || 0 : 0));
    const min = Math.min(...times);
    const fastest = race.rows.filter((row, index) => times[index] === min);
    topWins += fastest.filter((row) => row.finish === 1).length / fastest.length;
    const exRanks = averageRanks(times);
    const finishRanks = race.rows.map((row) => row.finish);
    const rho = spearman(exRanks, finishRanks);
    if (rho !== null) { rhoSum += rho; rhoN += 1; }
    const courseRho = spearman(race.rows.map((row) => row.course), finishRanks);
    if (courseRho !== null) { courseRhoSum += courseRho; courseRhoN += 1; }
  }
  return {
    races: races.length,
    sufficient: races.length >= FIXED.minRacesForConclusion,
    fastestWinRatePct: races.length ? round((topWins / races.length) * 100, 1) : null,
    meanRankCorrelation: rhoN ? round(rhoSum / rhoN, 3) : null,
    courseOnlyRankCorrelation: courseRhoN ? round(courseRhoSum / courseRhoN, 3) : null
  };
}

function analyze(races) {
  const byPeriod = { explored: [], holdout: [] };
  for (const race of races) {
    const key = period(race.date);
    if (key) byPeriod[key].push(race);
  }
  const exploredBias = boatBias(byPeriod.explored);
  const periods = {};
  for (const [key, list] of Object.entries(byPeriod)) {
    const venues = new Set(FIXED.differentMeasurementVenues);
    periods[key] = {
      races: list.length,
      boatBiasSec: boatBias(list),
      raw: metrics(list),
      boatBiasAdjusted: metrics(list, exploredBias),
      calm: metrics(list.filter((race) => !isRough(race))),
      rough: metrics(list.filter(isRough)),
      differentMeasurementVenues: metrics(list.filter((race) => venues.has(race.jcd))),
      otherVenues: metrics(list.filter((race) => !venues.has(race.jcd)))
    };
  }
  return { adjustmentFromExplored: exploredBias, periods };
}

function build({ root = path.resolve(__dirname, ".."), predictionsDir, resultsDir, out } = {}) {
  const { records, diagnostics } = contract.buildDefaultCohort({ root, predictionsDir, resultsDir, compactPredictionRecord });
  const excluded = {};
  const races = [];
  for (const record of records) {
    const { race, reason } = extractRace(record);
    if (race) races.push(race);
    else excluded[reason] = (excluded[reason] || 0) + 1;
  }
  races.sort((a, b) => a.key.localeCompare(b.key));
  const report = {
    version: VERSION,
    purpose: "展示タイムの落とし穴（引き波・荒れ水面・計測位置）を締切前保存予想と公式結果で検証する研究集計",
    source: {
      video: "https://youtube.com/watch?v=UH2qqLJoKOo",
      videoTitle: "【極秘】\"展示タイム\"を見るだけでは勝てません｜本当の使い方を完全公開",
      claimsFrom: "ユーザーが作成した動画要約（動画本体は未視聴）",
      inputs: "data/predictions（締切前保存・analysis-input-contract）+ data/results（公式結果）"
    },
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    fixedBeforeResults: FIXED,
    notTested: [
      "目展示（スタート展示直後の行き足・周回展示のターン）: 映像を見た記録がない",
      "周回展示バックストレッチの走行位置: 記録がない"
    ],
    caveats: [
      "1着率・順位相関には進入コースの有利不利が含まれる。courseOnlyRankCorrelation は進入コースだけで着順を説明した場合の参考値",
      "艇番ごとの偏りの補正値は explored 期間だけから作り、holdout に当てはめる",
      "完走しなかった艇は最下位タイとして扱う。欠場艇のいるレースは除外",
      "計測位置が異なる4場は件数が少なく、差があっても場の水面特性と区別できない"
    ],
    cohort: { ...diagnostics, eligibleRaces: races.length, excludedReasons: excluded, from: races[0]?.date || null, to: races[races.length - 1]?.date || null },
    ...analyze(races)
  };
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const out = outIndex >= 0 ? argv[outIndex + 1] : "data/stats/exhibition-time-pitfalls-v1.json";
  const report = build({ out });
  console.log(`${report.cohort.from}〜${report.cohort.to} ${report.cohort.eligibleRaces}R`);
  for (const [key, p] of Object.entries(report.periods)) {
    console.log(`${key}: ${p.races}R 艇番差 ${JSON.stringify(p.boatBiasSec)}`);
    for (const name of ["raw", "boatBiasAdjusted", "calm", "rough", "differentMeasurementVenues", "otherVenues"]) {
      const m = p[name];
      console.log(`  ${name.padEnd(26)} ${String(m.races).padStart(5)}R 最速1着${m.fastestWinRatePct}% 順位相関${m.meanRankCorrelation}（コースのみ${m.courseOnlyRankCorrelation}）`);
    }
  }
  console.log(`保存: ${out}`);
}

module.exports = { VERSION, FIXED, build, analyze, extractRace, metrics, boatBias, averageRanks, spearman, isRough, period, compactPredictionRecord };
