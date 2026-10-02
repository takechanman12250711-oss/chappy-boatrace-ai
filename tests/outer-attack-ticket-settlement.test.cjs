"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const shadow = require("../js/outer-attack-ticket-shadow.js");
const settlement = require("../js/outer-attack-ticket-settlement.js");

function analysis(boatNo, options = {}) {
  return {
    boatNo,
    indexes: {
      raceFlow: 40,
      st: 40,
      exhibition: 40,
      local: 40,
      turn: 40,
      national: 40,
      motor: 40,
      ...(options.indexes || {})
    },
    roleScores: {
      attack: 40,
      hold: 40,
      pickup: 40,
      ...(options.roleScores || {})
    },
    courseStructureTheory: { appliedIndex: options.courseIndex ?? 40 }
  };
}

function activePrediction(raceNo = 7, generatedAt = "2026-08-31T04:30:00.000Z") {
  return {
    raceKey: `20260831-05-${raceNo}`,
    date: "2026-08-31",
    jcd: "05",
    raceNo,
    generatedAt,
    formations: {
      main: ["1-2-4", "1-4-2"],
      cover: [
        { ticket: "1-2-5", amountYen: 200 },
        { ticket: "1-5-2", amountYen: 100 }
      ],
      flow: ["1-2-6", "1-6-2"],
      hole: ["2-1-5", "2-5-1"]
    },
    practicalSelection: {
      frameRiseFallReplayBasis: {
        source: "pre-deadline-production-prediction",
        analyses: [
          analysis(1, {
            indexes: { raceFlow: 80, st: 50, exhibition: 50 },
            roleScores: { attack: 50 },
            courseIndex: 90
          }),
          analysis(2),
          analysis(3, {
            indexes: { raceFlow: 60, st: 51, exhibition: 56 },
            roleScores: { attack: 53 },
            courseIndex: 70
          }),
          analysis(4), analysis(5), analysis(6)
        ]
      }
    },
    evaluatedScenarioCandidates: {
      candidatePool: [
        { id: "cover", ticket: "1-4-3", sourceCategory: "cover", evidenceQualified: true, purchaseEligible: true, priorityScore: 50 },
        { id: "flow", ticket: "1-5-3", sourceCategory: "flow", evidenceQualified: true, purchaseEligible: true, priorityScore: 40 },
        { id: "hole", ticket: "2-3-5", sourceCategory: "hole", evidenceQualified: true, purchaseEligible: true, priorityScore: 30 }
      ]
    }
  };
}

function officialResult(raceNo = 7, ticket = "1-4-3", payout = 1500, checkedAt = "2026-08-31T05:00:00.000Z") {
  const finishers = ticket.split("-").map(Number);
  return {
    raceKey: `20260831-05-${raceNo}`,
    date: "2026-08-31",
    jcd: "05",
    raceNo,
    recordType: "official_result",
    resultSource: "boatrace-official",
    result: ticket,
    officialPayoutPer100: payout,
    finishers,
    officialCheckedAt: checkedAt
  };
}

function rawOfficialResult(raceNo = 7, ticket = "1-4-3", payout = 1500) {
  return {
    date: "2026-08-31",
    jcd: "05",
    raceNo,
    source: "boatrace-official",
    resultAvailable: true,
    finishers: ticket.split("-").map(Number),
    trifecta: { combination: ticket, payout },
    checkedAt: "2026-08-31T05:00:00.000Z"
  };
}

function memoryRoot(options = {}) {
  const values = new Map();
  const results = new Map();
  return {
    _values: values,
    _results: results,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) {
        if (options.throwOnKey === key) throw new Error("simulated quota failure");
        values.set(key, String(value));
      }
    },
    ChappyStorage: {
      buildRaceKey: settlement.raceKey,
      upsertPrediction(prediction) {
        return { ...JSON.parse(JSON.stringify(prediction)), persistedPrediction: true };
      },
      upsertResult(result) {
        const saved = { ...JSON.parse(JSON.stringify(result)), persistedResult: true };
        results.set(settlement.raceKey(saved), saved);
        return saved;
      },
      findResult(query) {
        return results.get(settlement.raceKey(query)) || null;
      }
    }
  };
}

assert.equal(settlement.VERSION, "outer-attack-ticket-settlement-v1");
assert.equal(settlement.STORAGE_KEY, "chappy_outer_attack_ticket_settlements_v1");
assert.equal(settlement.REPORT_KEY, "chappy_outer_attack_ticket_settlement_report_v1");

const normalizedRaw = settlement.normalizeOfficialResult(rawOfficialResult());
assert.equal(normalizedRaw.valid, true);
assert.equal(normalizedRaw.raceKey, "20260831-05-7");
assert.equal(normalizedRaw.ticket, "1-4-3");
assert.equal(normalizedRaw.payoutPer100Yen, 1500);
assert.deepEqual(normalizedRaw.finishers, [1, 4, 3]);
assert.match(normalizedRaw.fingerprint, /^fnv1a32:/);

const normalizedStored = settlement.normalizeOfficialResult(officialResult());
assert.equal(normalizedStored.valid, true);
assert.equal(normalizedStored.ticket, "1-4-3");
assert.equal(normalizedStored.payoutPer100Yen, 1500);

assert.equal(
  settlement.normalizeOfficialResult({ ...rawOfficialResult(), resultAvailable: false }).reason,
  "result-not-available"
);
assert.equal(
  settlement.normalizeOfficialResult({ ...rawOfficialResult(), source: "manual-input" }).reason,
  "source-not-official"
);
assert.equal(
  settlement.normalizeOfficialResult({ ...rawOfficialResult(), finishers: [1, 1, 3] }).reason,
  "finishers-invalid"
);
assert.equal(
  settlement.normalizeOfficialResult({ ...rawOfficialResult(), trifecta: { combination: "1-3-4", payout: 1500 } }).reason,
  "ticket-finishers-mismatch"
);
assert.equal(
  settlement.normalizeOfficialResult({ ...rawOfficialResult(), trifecta: { combination: "1-4-3", payout: 0 } }).reason,
  "payout-missing"
);

const prediction = activePrediction();
const predictionBefore = JSON.stringify(prediction);
const snapshot = shadow.buildSnapshot(prediction, { now: "2026-08-31T04:31:00.000Z" });
const built = settlement.buildSettlement(snapshot, normalizedStored, { now: "2026-08-31T05:01:00.000Z" });
assert.equal(JSON.stringify(prediction), predictionBefore, "照合で現行予想を変更しない");
assert.equal(built.status, "settled-shadow-only");
assert.equal(built.productionChanged, false);
assert.equal(built.automaticApplication, false);
assert.equal(built.captureOrder, "prediction-before-result");
assert.equal(built.comparison.a.hit, false);
assert.equal(built.comparison.a.investmentYen, 900);
assert.equal(built.comparison.variants.cover.status, "ready");
assert.equal(built.comparison.variants.cover.outcome.hit, true);
assert.equal(built.comparison.variants.cover.outcome.returnYen, 1500);
assert.equal(built.comparison.variants.cover.outcome.profitYen, 600);
assert.equal(built.comparison.variants.cover.outcome.roiPercent, 166.7);
assert.deepEqual(built.eligibleVariantKeys, ["cover", "flow", "hole"]);

const root = memoryRoot();
assert.equal(shadow.installStorageHook(root), true);
assert.equal(settlement.installStorageHooks(root), true);
assert.equal(settlement.installStorageHooks(root), false, "settlement hookを二重装着しない");

const hookPrediction = activePrediction();
const hookPredictionBefore = JSON.stringify(hookPrediction);
const savedPrediction = root.ChappyStorage.upsertPrediction(hookPrediction);
assert.equal(savedPrediction.persistedPrediction, true);
assert.equal(JSON.stringify(hookPrediction), hookPredictionBefore, "prediction hookで入力を変更しない");
assert.equal(settlement.readSettlements(root).length, 0);

const hookResult = officialResult();
const hookResultBefore = JSON.stringify(hookResult);
const savedResult = root.ChappyStorage.upsertResult(hookResult);
assert.equal(savedResult.persistedResult, true);
assert.equal(JSON.stringify(hookResult), hookResultBefore, "result hookで入力を変更しない");
let stored = settlement.readSettlements(root);
assert.equal(stored.length, 1);
assert.equal(stored[0].sourceRaceKey, "20260831-05-7");
assert.equal(stored[0].shadowCaptureKey, snapshot.captureKey);
assert.equal(stored[0].comparison.variants.cover.outcome.hit, true);
assert.equal(settlement.readReport(root).settlementCount, 1);
assert.equal(settlement.readReport(root).cohorts.forward.sampleCount, 1);

root.ChappyStorage.upsertResult(officialResult());
assert.equal(settlement.readSettlements(root).length, 1, "同じ公式結果を二重集計しない");
assert.equal(settlement.readSettlements(root)[0].revision, 1);

root.ChappyStorage.upsertResult(officialResult(7, "1-4-3", 1600));
stored = settlement.readSettlements(root);
assert.equal(stored.length, 1, "公式訂正も同一レース1件を維持する");
assert.equal(stored[0].revision, 2);
assert.equal(stored[0].official.payoutPer100Yen, 1600);
assert.equal(stored[0].comparison.variants.cover.outcome.returnYen, 1600);
assert.equal(stored[0].shadowCaptureKey, snapshot.captureKey, "公式訂正でA/Bスナップショットを差し替えない");

const resultFirstRoot = memoryRoot();
shadow.installStorageHook(resultFirstRoot);
settlement.installStorageHooks(resultFirstRoot);
resultFirstRoot.ChappyStorage.upsertResult(
  officialResult(8, "1-4-3", 1500, "2026-08-31T05:00:00.000Z")
);
assert.equal(settlement.readSettlements(resultFirstRoot).length, 0);
resultFirstRoot.ChappyStorage.upsertPrediction(
  activePrediction(8, "2026-08-31T06:00:00.000Z")
);
assert.equal(settlement.readSettlements(resultFirstRoot).length, 1, "結果→予想の保存順でも照合する");
assert.equal(settlement.readSettlements(resultFirstRoot)[0].captureOrder, "result-before-prediction");
assert.equal(settlement.readReport(resultFirstRoot).cohorts.resultFirst.sampleCount, 1);
assert.equal(settlement.readReport(resultFirstRoot).cohorts.forward.sampleCount, 0);

const noBackfillRoot = memoryRoot();
const preloadSnapshot = shadow.buildSnapshot(activePrediction(9), { now: "2026-08-31T04:31:00.000Z" });
noBackfillRoot.localStorage.setItem(shadow.STORAGE_KEY, JSON.stringify([preloadSnapshot]));
noBackfillRoot._results.set("20260831-05-9", officialResult(9));
settlement.installStorageHooks(noBackfillRoot);
assert.equal(settlement.readSettlements(noBackfillRoot).length, 0, "hook装着だけでは過去分を遡及確定しない");
noBackfillRoot.ChappyStorage.upsertResult(officialResult(9));
assert.equal(settlement.readSettlements(noBackfillRoot).length, 1, "新しい保存イベントでのみ確定する");

const failingRoot = memoryRoot({ throwOnKey: settlement.STORAGE_KEY });
shadow.installStorageHook(failingRoot);
settlement.installStorageHooks(failingRoot);
failingRoot.ChappyStorage.upsertPrediction(activePrediction(10));
const unaffectedResult = failingRoot.ChappyStorage.upsertResult(officialResult(10));
assert.equal(unaffectedResult.persistedResult, true, "shadow別保存失敗を本番結果保存へ伝播させない");

function directSettlement(raceNo, ticket, payout) {
  const snap = shadow.buildSnapshot(activePrediction(raceNo), { now: "2026-08-31T04:31:00.000Z" });
  const official = settlement.normalizeOfficialResult(officialResult(raceNo, ticket, payout));
  return settlement.buildSettlement(snap, official, { now: `2026-08-31T05:${raceNo}:00.000Z` });
}

const report = settlement.aggregateSettlements([
  directSettlement(7, "1-4-3", 1500),
  directSettlement(8, "1-2-4", 900),
  directSettlement(9, "1-5-2", 2000)
], { now: "2026-08-31T07:00:00.000Z" });

assert.equal(report.primaryCohort, "prediction-before-result");
assert.equal(report.settlementCount, 3);
assert.equal(report.cohorts.forward.sampleCount, 3);
assert.deepEqual(report.cohorts.forward.variants.cover.pairOutcomes, {
  bothHit: 1,
  aOnlyHit: 1,
  bOnlyHit: 1,
  neitherHit: 0
});
assert.deepEqual(report.cohorts.forward.variants.cover.a, {
  sampleCount: 3,
  hitCount: 2,
  hitRatePercent: 66.7,
  investmentYen: 2700,
  returnYen: 2900,
  profitYen: 200,
  roiPercent: 107.4
});
assert.deepEqual(report.cohorts.forward.variants.cover.b, {
  sampleCount: 3,
  hitCount: 2,
  hitRatePercent: 66.7,
  investmentYen: 2700,
  returnYen: 2400,
  profitYen: -300,
  roiPercent: 88.9
});
assert.deepEqual(report.cohorts.forward.variants.cover.deltaVsA, {
  hitCountDelta: 0,
  hitRatePointDelta: 0,
  returnYenDelta: -500,
  profitYenDelta: -500,
  roiPointDelta: -18.5
});
assert.equal(report.cohorts.forward.variants.cover.byTargetBoatNo["3"].a.sampleCount, 3);
assert.equal(report.cohorts.forward.variants.cover.byTargetPosition["3"].b.sampleCount, 3);

const loader = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");
assert.match(loader, /groups\.race\.splice\(2,0,"js\/outer-attack-ticket-shadow\.js"\)/);
assert.match(loader, /groups\.race\.splice\(3,0,"js\/outer-attack-ticket-settlement\.js"\)/);

console.log("outer attack ticket settlement tests passed");
