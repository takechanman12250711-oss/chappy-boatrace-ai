#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./build-confidence-stake-roi.cjs");

// 期間・三分位
assert.strictEqual(lib.period("20260915"), "explored");
assert.strictEqual(lib.period("20260916"), "holdout");
assert.deepStrictEqual(lib.tertileCuts([1, 2, 3, 4, 5, 6]), [3, 5]);
assert.strictEqual(lib.bandOf(2, [3, 5]), "low");
assert.strictEqual(lib.bandOf(3, [3, 5]), "mid", "境界値は上の帯");
assert.strictEqual(lib.bandOf(5, [3, 5]), "high");
assert.strictEqual(lib.bandOf(null, [3, 5]), null, "スコア欠測は帯に入れない");

const STARTS = [1, 2, 3, 4, 5, 6].map((boat) => ({ boat, course: boat, st: 0.15, falseStart: false, lateStart: false }));
function result(date, raceNo, order, payout, extra = {}) {
  return {
    source: "boatrace-official", resultAvailable: true, status: "finished", date, jcd: "01", raceNo,
    finishers: order.map((boat, index) => ({ rank: index + 1, boat })),
    starts: STARTS, trifecta: { boats: order.slice(0, 3), combination: order.slice(0, 3).join("-"), payout }, ...extra
  };
}

// 返還・同着は除外
assert.strictEqual(lib.unsettleableReason(result("20260801", 1, [1, 2, 3, 4, 5, 6], 500)), "");
assert.strictEqual(lib.unsettleableReason({ ...result("20260801", 1, [1, 2, 3], 500), starts: STARTS.map((s) => (s.boat === 4 ? { ...s, falseStart: true } : s)) }), "refund-or-missing-start");
assert.strictEqual(lib.unsettleableReason({ ...result("20260801", 1, [1, 2, 3], 500), finishers: [{ rank: 1, boat: 1 }, { rank: 1, boat: 2 }, { rank: 3, boat: 3 }] }), "top-three-dead-heat");

function prediction(date, raceNo, tickets, confidence, selection) {
  const day = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return {
    raceKey: `${date}-01-${raceNo}`, date, jcd: "01", raceNo,
    deadlineAt: `${day}T15:00:00+09:00`, selectedAt: `${day}T05:50:00.000Z`,
    selection: { score: selection },
    prediction: {
      predictionMode: "server_pre_deadline",
      confidence: { score: confidence },
      practicalTickets: tickets.map((ticket) => ({ ticket })),
      preRaceConditions: { schemaVersion: 4, sourceTiming: "pre_deadline", officialResultUsed: false, source: "boatrace-official", sourceFetchedAt: `${day}T05:49:00.000Z` }
    }
  };
}

// extractRace: 実戦厳選券を各100円、的中なら払戻
{
  const { race } = lib.extractRace({ ...prediction("20260801", 1, ["1-2-3", "1-3-2", "1-2-3"], 80, 70), __analysisRaceKey: "20260801-01-1", __officialResult: result("20260801", 1, [1, 2, 3, 4, 5, 6], 1500) });
  assert.strictEqual(race.tickets, 2, "重複券は1点");
  assert.strictEqual(race.stakeYen, 200);
  assert.strictEqual(race.returnYen, 1500);
  assert.strictEqual(lib.extractRace({ ...prediction("20260801", 1, [], 80, 70), __officialResult: result("20260801", 1, [1, 2, 3], 500) }).reason, "no-practical-tickets", "見送りレースは買わない");
}

// build: 境界は explored だけから作り、締切後保存は除外
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confidence-stake-"));
  const predictionsDir = path.join(dir, "predictions");
  const resultsDir = path.join(dir, "results");
  fs.mkdirSync(predictionsDir);
  fs.mkdirSync(resultsDir);
  const write = (base, date, body) => fs.writeFileSync(path.join(base, `${date}.json`), JSON.stringify(body));
  // explored: 自信度 10/20/30/40/50/60 → 境界 [30, 50]
  write(predictionsDir, "20260801", { predictions: [10, 20, 30, 40, 50, 60].map((score, i) => prediction("20260801", i + 1, ["1-2-3"], score, score)) });
  write(resultsDir, "20260801", { races: [1, 2, 3, 4, 5, 6].map((raceNo) => result("20260801", raceNo, raceNo === 6 ? [1, 2, 3] : [2, 1, 3], 1000)) });
  // holdout: 自信度55（high）が的中、締切後保存は除外
  write(predictionsDir, "20261001", {
    predictions: [
      prediction("20261001", 1, ["1-2-3"], 55, 55),
      { ...prediction("20261001", 2, ["1-2-3"], 99, 99), selectedAt: "2026-10-01T06:30:00.000Z" }
    ]
  });
  write(resultsDir, "20261001", { races: [result("20261001", 1, [1, 2, 3], 800), result("20261001", 2, [1, 2, 3], 800)] });
  const report = lib.build({ root: dir, predictionsDir, resultsDir });
  assert.strictEqual(report.cohort.eligibleRaces, 7, "締切後保存の1Rを除く");
  assert.strictEqual(report.cohort.excludedReasons["captured-at-or-after-deadline"], 1);
  const conf = report.byScore.confidenceScore;
  assert.deepStrictEqual(conf.cutsFromExplored, [30, 50]);
  assert.strictEqual(conf.periods.explored.high.races, 2, "50と60");
  assert.strictEqual(conf.periods.explored.high.roiPct, 500, "1000 / (2R×100)");
  assert.strictEqual(conf.periods.explored.low.roiPct, 0);
  assert.strictEqual(conf.periods.holdout.high.races, 1);
  assert.strictEqual(conf.periods.holdout.high.roiPct, 800);
  assert.strictEqual(conf.supportsConcentration, false, "100R未満では根拠ありとしない");
  assert.strictEqual(report.usableForPrediction, false);
  assert.strictEqual(report.productionChanged, false);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("confidence-stake-roi: all checks passed");
