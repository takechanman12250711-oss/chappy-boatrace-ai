#!/usr/bin/env node
"use strict";

// 外部動画（あべけん「月100万円以上稼ぐ舟券プロ達の7つの共通点」）の7番目
// 「自信のある勝負レースにだけ資金を集中する」を検証する研究集計。
// 締切前保存予想の自信度・選定スコアが高いレースほど、実戦厳選券の回収率が高いかを見る。
// productionChanged=false / usableForPrediction=false / automaticApplication=false。
//
// 使い方: node scripts/build-confidence-stake-roi.cjs [--out FILE]

const fs = require("fs");
const path = require("path");
const contract = require("./analysis-input-contract.js");

const VERSION = "confidence-stake-roi-v1";

// 結果を見る前に固定した条件（2026-10-22）。
const FIXED = Object.freeze({
  exploredFrom: "20260722",
  exploredTo: "20260915",
  holdoutFrom: "20260916",
  scores: ["confidenceScore", "selectionScore"],
  bands: 3,                    // explored の三分位で低・中・高に分け、同じ境界を holdout に当てはめる
  unitYen: 100,
  minRacesForConclusion: 100,
  // 「勝負所」と言えるのは、両期間とも高帯の回収率が100%以上かつ低帯を上回り、両期間とも100R以上の場合
  supportRule: "high-band ROI >= 100% and > low-band ROI in both periods, each with >= 100 races"
});

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (source && source[key] !== undefined) out[key] = source[key];
  return out;
}

function compactPredictionRecord(record) {
  const prediction = record?.prediction || {};
  const conditions = prediction.preRaceConditions || {};
  return {
    ...pick(record, ["raceKey", "date", "jcd", "raceNo", "deadlineAt", "deadline", "selectedAt", "capturedAt", "createdAt",
      "isRetrospective", "verificationMode", "officialResultUsedForPrediction", "officialResultUsedForEvaluation"]),
    selection: pick(record?.selection || {}, ["score"]),
    prediction: {
      ...pick(prediction, ["predictionMode", "officialResultUsedForPrediction", "officialResultUsedForEvaluation", "isRetrospective"]),
      confidence: pick(prediction.confidence || {}, ["score"]),
      practicalTickets: (Array.isArray(prediction.practicalTickets) ? prediction.practicalTickets : []).map((ticket) => pick(ticket, ["ticket"])),
      preRaceConditions: pick(conditions, ["schemaVersion", "sourceTiming", "officialResultUsed", "source", "dataSource", "sourceFetchedAt"])
    }
  };
}

function finiteScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 返還券・存在しない券が出るレース（欠場・F・出遅れ）と、払戻が1組しか保存されない3着以内の同着は外す。
function unsettleableReason(result) {
  const starts = Array.isArray(result?.starts) ? result.starts : [];
  const boats = new Set(starts.map((start) => Number(start?.boat)).filter((boat) => boat >= 1 && boat <= 6));
  if (boats.size !== 6 || starts.some((start) => start?.falseStart || start?.lateStart)) return "refund-or-missing-start";
  const ranks = (Array.isArray(result?.finishers) ? result.finishers : []).map((finisher) => Number(finisher?.rank)).filter((rank) => rank >= 1 && rank <= 3);
  if (new Set(ranks).size !== ranks.length) return "top-three-dead-heat";
  const payout = Number(result?.trifecta?.payout);
  if (!(payout > 0)) return "payout-missing";
  return "";
}

function extractRace(record) {
  const tickets = [...new Set((record?.prediction?.practicalTickets || [])
    .map((ticket) => contract.normalizeTicket(ticket?.ticket)).filter(Boolean))];
  if (!tickets.length) return { reason: "no-practical-tickets" };
  const result = record.__officialResult || {};
  const reason = unsettleableReason(result);
  if (reason) return { reason };
  const winning = contract.actualTicket(result);
  if (!winning) return { reason: "result-ticket-missing" };
  const key = record.__analysisRaceKey || contract.raceKey(record);
  const hit = tickets.includes(winning);
  return {
    race: {
      key,
      date: key.slice(0, 8),
      confidenceScore: finiteScore(record?.prediction?.confidence?.score),
      selectionScore: finiteScore(record?.selection?.score),
      tickets: tickets.length,
      stakeYen: tickets.length * FIXED.unitYen,
      returnYen: hit ? Number(result.trifecta.payout) * (FIXED.unitYen / 100) : 0,
      hit
    }
  };
}

function period(date) {
  if (date >= FIXED.exploredFrom && date <= FIXED.exploredTo) return "explored";
  if (date >= FIXED.holdoutFrom) return "holdout";
  return null;
}

// explored の値から三分位の境界（2つ）を作る。
function tertileCuts(values) {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (sorted.length < FIXED.bands) return null;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(1 / 3), at(2 / 3)];
}

function bandOf(value, cuts) {
  if (value === null || !cuts) return null;
  if (value < cuts[0]) return "low";
  if (value < cuts[1]) return "mid";
  return "high";
}

function round(value, digits) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;
}

function summarize(races) {
  const stake = races.reduce((sum, race) => sum + race.stakeYen, 0);
  const returned = races.reduce((sum, race) => sum + race.returnYen, 0);
  const hits = races.filter((race) => race.hit).length;
  return {
    races: races.length,
    sufficient: races.length >= FIXED.minRacesForConclusion,
    hitRatePct: races.length ? round((hits / races.length) * 100, 1) : null,
    roiPct: stake ? round((returned / stake) * 100, 1) : null,
    avgTickets: races.length ? round(races.reduce((sum, race) => sum + race.tickets, 0) / races.length, 2) : null,
    stakeYen: stake,
    returnYen: returned
  };
}

function analyze(races) {
  const byPeriod = { explored: [], holdout: [] };
  for (const race of races) {
    const key = period(race.date);
    if (key) byPeriod[key].push(race);
  }
  const out = { overall: {}, byScore: {} };
  for (const [key, list] of Object.entries(byPeriod)) out.overall[key] = summarize(list);
  for (const score of FIXED.scores) {
    const cuts = tertileCuts(byPeriod.explored.map((race) => race[score]));
    const result = { cutsFromExplored: cuts, periods: {} };
    for (const [key, list] of Object.entries(byPeriod)) {
      const bands = { low: [], mid: [], high: [] };
      let missing = 0;
      for (const race of list) {
        const band = bandOf(race[score], cuts);
        if (band) bands[band].push(race);
        else missing += 1;
      }
      result.periods[key] = { scoreMissing: missing, ...Object.fromEntries(Object.entries(bands).map(([name, items]) => [name, summarize(items)])) };
    }
    // 丸めた roiPct ではなく金額で比べ、99.95% を100%扱いにしない。
    const rawRoi = (summary) => (summary.stakeYen ? summary.returnYen / summary.stakeYen : null);
    const supported = ["explored", "holdout"].every((key) => {
      const p = result.periods[key];
      const high = rawRoi(p.high);
      const low = rawRoi(p.low);
      return p.high.sufficient && p.low.sufficient && high !== null && low !== null && high >= 1 && high > low;
    });
    result.supportsConcentration = supported;
    out.byScore[score] = result;
  }
  return out;
}

// 収集途中（complete: false）の結果日は、確定済みレースだけが偏って残るため日ごと外す。
function incompleteResultDays(resultsDir) {
  const days = new Set();
  if (!fs.existsSync(resultsDir)) return days;
  for (const name of fs.readdirSync(resultsDir).filter((file) => /^\d{8}\.json$/.test(file))) {
    const day = JSON.parse(fs.readFileSync(path.join(resultsDir, name), "utf8"));
    if (day?.complete === false) days.add(name.slice(0, 8));
  }
  return days;
}

function build({ root = path.resolve(__dirname, ".."), predictionsDir, resultsDir, out } = {}) {
  const { records, diagnostics } = contract.buildDefaultCohort({ root, predictionsDir, resultsDir, compactPredictionRecord });
  const incompleteDays = incompleteResultDays(resultsDir || path.join(root, "data", "results"));
  const raceExcludedReasons = {};
  const excludedIncompleteDays = new Set();
  const races = [];
  for (const record of records) {
    const key = record.__analysisRaceKey || contract.raceKey(record);
    if (incompleteDays.has(key.slice(0, 8))) {
      raceExcludedReasons["incomplete-result-day"] = (raceExcludedReasons["incomplete-result-day"] || 0) + 1;
      excludedIncompleteDays.add(key.slice(0, 8));
      continue;
    }
    const { race, reason } = extractRace(record);
    if (race) races.push(race);
    else raceExcludedReasons[reason] = (raceExcludedReasons[reason] || 0) + 1;
  }
  races.sort((a, b) => a.key.localeCompare(b.key));
  const report = {
    version: VERSION,
    purpose: "自信度・選定スコアが高いレースほど実戦厳選券の回収率が高いか（勝負所に資金を集める根拠があるか）を検証する研究集計",
    source: {
      video: "https://www.youtube.com/watch?v=7kS9-_UTS9I",
      claim: "7. 大勝負を仕掛ける瞬間を見極める（自信のあるレースに資金を集中する）",
      claimsFrom: "ユーザーが作成した動画要約（動画本体は未視聴）",
      inputs: "data/predictions（締切前保存・analysis-input-contract）の confidence.score / selection.score / practicalTickets + data/results（公式結果）"
    },
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    fixedBeforeResults: FIXED,
    caveats: [
      "券は保存済みの実戦厳選（practicalTickets）を各100円で買った場合。実購入とは別",
      "三分位の境界は explored の値だけから作り、holdout に同じ境界を当てはめる",
      "欠場・F・出遅れのあるレース、3着以内の同着、収集途中（complete: false）の結果日は除外",
      "スコアの意味や算出方法は期間中に変わっている可能性がある"
    ],
    cohort: { ...diagnostics, eligibleRaces: races.length, raceExcludedReasons, incompleteResultDays: [...excludedIncompleteDays].sort(), from: races[0]?.date || null, to: races[races.length - 1]?.date || null },
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
  const out = outIndex >= 0 ? argv[outIndex + 1] : "data/stats/confidence-stake-roi-v1.json";
  const report = build({ out });
  console.log(`${report.cohort.from}〜${report.cohort.to} ${report.cohort.eligibleRaces}R`);
  for (const [key, s] of Object.entries(report.overall)) console.log(`${key} 全体: ${s.races}R 的中${s.hitRatePct}% 回収${s.roiPct}% 平均${s.avgTickets}点`);
  for (const [score, r] of Object.entries(report.byScore)) {
    console.log(`${score} 境界 ${JSON.stringify(r.cutsFromExplored)} 勝負所の根拠: ${r.supportsConcentration}`);
    for (const [key, p] of Object.entries(r.periods)) {
      console.log(`  ${key} (欠測${p.scoreMissing})`);
      for (const band of ["low", "mid", "high"]) {
        const s = p[band];
        console.log(`    ${band.padEnd(4)} ${String(s.races).padStart(5)}R 的中${s.hitRatePct}% 回収${s.roiPct}% 平均${s.avgTickets}点`);
      }
    }
  }
  console.log(`保存: ${out}`);
}

module.exports = { VERSION, FIXED, build, analyze, extractRace, summarize, tertileCuts, bandOf, period, unsettleableReason, compactPredictionRecord };
