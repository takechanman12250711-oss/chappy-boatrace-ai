// scripts/test-match-predictions.js
"use strict";

const assert = require("node:assert/strict");
const {
  normalizeTicket,
  classifyMiss,
  shadowV2ScoreBand,
  matchPredictions
} = require("./match-predictions");

assert.equal(normalizeTicket("2→1→4"), "2-1-4");
assert.equal(classifyMiss(["2-1-4"], "2-1-4"), "的中");
assert.equal(classifyMiss(["1-2-4"], "2-1-4"), "頭外れ");
assert.equal(classifyMiss(["2-4-1"], "2-1-4"), "着順違い");
assert.equal(classifyMiss(["2-1-5"], "2-1-4"), "相手抜け");
assert.equal(classifyMiss(["2-5-6"], "2-1-4"), "完全抜け");

const matched = matchPredictions(
  {
    date: "20260719",
    predictions: [{
      raceKey: "20260719-01-1",
      prediction: {
        raceFlow: { title: "2差し本線" },
        mainSheet: { honmei: { boatNo: 2 } },
        practicalTickets: [{ ticket: "2-1-4", category: "本線" }]
      }
    }],
    verificationPredictions: [{
      raceKey: "20260719-01-1",
      scoreBand: "70_plus",
      selection: { score: 74 },
      prediction: {
        raceFlow: { title: "2差し本線" },
        mainSheet: { honmei: { boatNo: 2 } },
        practicalTickets: [{ ticket: "2-1-4", category: "本線" }]
      }
    }, {
      raceKey: "20260719-01-2",
      scoreBand: "60_69",
      selection: { score: 65 },
      prediction: {
        raceFlow: { title: "1逃げ本線" },
        mainSheet: { honmei: { boatNo: 1 } },
        practicalTickets: [{ ticket: "1-2-3", category: "本線" }]
      }
    }, {
      raceKey: "20260719-01-3",
      scoreBand: "under_60",
      selection: { score: 59 },
      prediction: {
        raceFlow: { title: "1逃げ本線" },
        mainSheet: { honmei: { boatNo: 1 } },
        practicalTickets: [{ ticket: "1-2-3", category: "本線" }]
      }
    }],
    shadowV2Predictions: [{
      recordKey: "20260719-01-1:logic-a:ref-a:config-a",
      raceKey: "20260719-01-1",
      cohortKey: "logic-a:ref-a:v2:config-a:prediction:core",
      capturedAt: "2026-07-19T01:00:00Z",
      complete: true,
      calibrationEligible: true,
      evaluation: {
        totalScore: 75,
        scenario: { label: "2コース差し" }
      },
      versions: {
        logicFingerprint: "logic-a",
        evaluator: "v2",
        configHash: "config-a",
        prediction: "prediction",
        aiCore: "core"
      },
      selectionReference: {
        score: 58,
        qualified: false
      },
      predictionReference: {
        raceFlow: { title: "2差し本線" },
        marks: {
          honmei: { boatNo: 2 }
        },
        practicalTickets: [{
          ticket: "2-1-4",
          category: "本線"
        }]
      },
      snapshot: {
        weather: { windSpeed: 2 }
      },
      officialResultUsedForEvaluation: false
    }, {
      recordKey: "20260719-01-2:logic-a:ref-a:config-a",
      raceKey: "20260719-01-2",
      cohortKey: "logic-a:ref-a:v2:config-a:prediction:core",
      capturedAt: "2026-07-19T01:01:00Z",
      complete: true,
      calibrationEligible: true,
      evaluation: {
        totalScore: 65,
        scenario: { label: "1号艇逃げ" }
      },
      versions: {
        logicFingerprint: "logic-a",
        evaluator: "v2",
        configHash: "config-a",
        prediction: "prediction",
        aiCore: "core"
      },
      selectionReference: {
        score: 80,
        qualified: true
      },
      predictionReference: {
        raceFlow: { title: "1逃げ本線" },
        marks: {
          honmei: { boatNo: 1 }
        },
        practicalTickets: [{
          ticket: "1-2-3",
          category: "本線"
        }]
      },
      officialResultUsedForEvaluation: false
    }, {
      recordKey: "20260719-01-3:logic-a:ref-a:config-a",
      raceKey: "20260719-01-3",
      cohortKey: "logic-a:ref-a:v2:config-a:prediction:core",
      capturedAt: "2026-07-19T01:02:00Z",
      complete: true,
      calibrationEligible: true,
      evaluation: {
        totalScore: 59
      },
      versions: {
        logicFingerprint: "logic-a",
        evaluator: "v2",
        configHash: "config-a",
        prediction: "prediction",
        aiCore: "core"
      },
      predictionReference: {
        raceFlow: { title: "1逃げ本線" },
        marks: {
          honmei: { boatNo: 1 }
        },
        practicalTickets: [{
          ticket: "1-2-3",
          category: "本線"
        }]
      },
      officialResultUsedForEvaluation: false
    }]
  },
  {
    date: "20260719",
    races: [{
      jcd: "01",
      raceNo: 1,
      resultAvailable: true,
      winningMethod: "差し",
      trifecta: {
        combination: "2-1-4",
        payout: 4080,
        popularity: 14
      }
    }, {
      jcd: "01",
      raceNo: 2,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-3-2",
        payout: 1250,
        popularity: 5
      }
    }, {
      jcd: "01",
      raceNo: 3,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-2-3",
        payout: 980,
        popularity: 3
      }
    }]
  }
);

assert.equal(matched.resultSummary.settledCount, 1);
assert.equal(matched.resultSummary.practicalHits, 1);
assert.equal(matched.predictions[0].result.practicalHit, true);
assert.equal(matched.predictions[0].result.payout, 4080);
assert.equal(matched.predictions[0].result.scenarioMatched, true);
assert.equal(matched.predictions[0].result.hitCategory, "本線");
assert.equal(matched.predictions[0].result.priorityReview.primaryStage, "的中");
assert.equal(matched.predictions[0].result.verification.marks[0].finishLabel, "1着");
assert.equal(matched.resultSummary.scenarioMatchRate, 100);
assert.equal(matched.resultSummary.simulatedStake, 100);
assert.equal(matched.resultSummary.simulatedReturn, 4080);
assert.equal(matched.verificationPredictions.length, 3);
assert.equal(matched.verificationResultSummary.score70Plus.settledCount, 1);
assert.equal(matched.verificationResultSummary.score60To69.settledCount, 1);
assert.equal(matched.verificationResultSummary.under60.settledCount, 1);
assert.equal(matched.verificationResultSummary.under70.settledCount, 2);
assert.equal(
  matched.shadowV2VerificationSummary
    .score70Plus.settledCount,
  1
);
assert.equal(
  matched.shadowV2VerificationSummary
    .score60To69.settledCount,
  1
);
assert.equal(
  matched.shadowV2VerificationSummary
    .referenceUnder60.settledCount,
  1
);
assert.equal(
  matched.shadowV2Predictions[0]
    .verificationResult.practicalHit,
  true
);
assert.equal(
  matched.shadowV2Predictions[0]
    .selectionReference.score,
  58,
  "V2結果照合で旧選定点をV2点へ上書きしない"
);
assert.equal(
  matched.shadowV2Predictions[0]
    .evaluation.totalScore,
  75
);
assert.equal(
  matched.shadowV2Predictions[0]
    .cohortKey,
  "logic-a:ref-a:v2:config-a:prediction:core"
);
assert.equal(
  matched.shadowV2Predictions[0]
    .officialResultUsedForEvaluation,
  false,
  "公式結果はV2採点後の照合だけに使う"
);
assert.equal(
  shadowV2ScoreBand({
    calibrationEligible: true,
    evaluation: { totalScore: null }
  }),
  "ineligible",
  "欠損点を0点扱いしない"
);

const rematched = matchPredictions(
  matched,
  {
    date: "20260719",
    races: [{
      jcd: "01",
      raceNo: 1,
      resultAvailable: true,
      winningMethod: "差し",
      trifecta: {
        combination: "2-1-4",
        payout: 4080,
        popularity: 14
      }
    }, {
      jcd: "01",
      raceNo: 2,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-3-2",
        payout: 1250,
        popularity: 5
      }
    }, {
      jcd: "01",
      raceNo: 3,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-2-3",
        payout: 980,
        popularity: 3
      }
    }]
  }
);
assert.deepEqual(
  rematched.shadowV2Predictions,
  matched.shadowV2Predictions,
  "再照合でV2点・選定状態・コホート・照合結果を変更しない"
);

const corrected = matchPredictions(
  matched,
  {
    date: "20260719",
    races: [{
      jcd: "01",
      raceNo: 1,
      resultAvailable: true,
      winningMethod: "差し",
      trifecta: {
        combination: "2-1-4",
        payout: 4280,
        popularity: 13
      }
    }, {
      jcd: "01",
      raceNo: 2,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-3-2",
        payout: 1250,
        popularity: 5
      }
    }, {
      jcd: "01",
      raceNo: 3,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-2-3",
        payout: 980,
        popularity: 3
      }
    }]
  }
);
assert.equal(
  corrected.shadowV2Predictions[0]
    .verificationResult.payout,
  4280,
  "同じ3連単でも公式払戻の訂正を再照合する"
);
assert.equal(
  corrected.shadowV2Predictions[0]
    .verificationResult.popularity,
  13
);
assert.equal(
  corrected.shadowV2Predictions[0]
    .evaluation.totalScore,
  75,
  "公式訂正でも保存済みV2点は変更しない"
);

console.log("自動予想・公式結果照合テスト: 合格");
