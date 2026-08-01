// scripts/test-match-predictions.js
"use strict";

const assert = require("node:assert/strict");
const {
  normalizeTicket,
  classifyMiss,
  buildSelectionCohorts,
  matchPredictions
} = require("./match-predictions");

const currentGeneration = {
  logicFingerprint:
    "evaluated-scenarios-v1",
  confidenceDefinitionVersion:
    "internal-score-v1",
  ticketPolicyVersion:
    "practical-5-7-10-v1"
};
const currentEvidence = {
  roleSchemaVersion: 1,
  theorySchemaVersion: 1,
  theorySetFingerprint:
    "structured-ticket-support-v1:flow+holdPickup",
  generation:
    currentGeneration
};
const currentShadowReference = {
  recordKey:
    "record-current",
  cohortKey:
    "selector-cohort-current",
  evaluatorVersion:
    "shadow-selection-v2.0.0",
  logicFingerprint:
    "selector-logic-current",
  theoryInputVersion:
    "theory-input-v1.0.0"
};

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
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: 74,
        threshold: 70,
        ready: true,
        status: "ready"
      },
      shadowV2Reference:
        currentShadowReference,
      prediction: {
        raceFlow: { title: "2差し本線" },
        mainSheet: { honmei: { boatNo: 2 } },
        practicalTickets: [{ ticket: "2-1-4", category: "本線" }],
        verificationEvidence: {
          ...currentEvidence
        }
      }
    }, {
      raceKey: "20260719-01-2",
      scoreBand: "under_70",
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: 66,
        threshold: 70,
        ready: true,
        status: "ready"
      },
      shadowV2Reference:
        currentShadowReference,
      prediction: {
        raceFlow: { title: "1逃げ本線" },
        mainSheet: { honmei: { boatNo: 1 } },
        practicalTickets: [{ ticket: "1-2-3", category: "本線" }],
        verificationEvidence: {
          ...currentEvidence
        }
      }
    }],
    shadowV2Predictions: [{
      recordKey: "20260719-01-1:logic-a:config-a",
      raceKey: "20260719-01-1",
      capturedAt: "2026-07-19T01:00:00Z",
      calibrationEligible: true,
      evaluation: {
        totalScore: 61.2
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
assert.equal(matched.verificationPredictions.length, 2);
assert.equal(matched.verificationResultSummary.score70Plus.settledCount, 1);
assert.equal(matched.verificationResultSummary.score60To69.settledCount, 1);
assert.equal(matched.verificationResultSummary.under70.settledCount, 1);
assert.equal(matched.verificationResultSummary.under70.practicalHits, 0);
assert.equal(matched.verificationResultSummary.readyBelow60.settledCount, 0);
assert.equal(matched.verificationResultSummary.notReady.settledCount, 0);
assert.equal(matched.verificationResultSummary.legacy.settledCount, 0);
assert.equal(
  matched
    .verificationResultSummary
    .missingGeneration
    .settledCount,
  0
);
assert.equal(
  matched
    .verificationResultSummary
    .otherGeneration
    .settledCount,
  0
);
assert.deepEqual(
  matched.shadowV2Predictions,
  [{
    recordKey: "20260719-01-1:logic-a:config-a",
    raceKey: "20260719-01-1",
    capturedAt: "2026-07-19T01:00:00Z",
    calibrationEligible: true,
    evaluation: {
      totalScore: 61.2
    },
    officialResultUsedForEvaluation: false
  }],
  "V2シャドーは現行の結果照合から独立して保持する"
);
assert.deepEqual(
  matchPredictions(
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
      }]
    }
  ),
  matched,
  "同じ公式結果を再照合しても保存内容と時刻を変えない"
);

const enrichedOfficial = {
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
    },
    finishers: [{
      rank: 1,
      boatNo: 2
    }],
    starts: [{
      boatNo: 2,
      st: 0.08
    }]
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
  }]
};
const enriched =
  matchPredictions(
    matched,
    enrichedOfficial
  );
assert.deepEqual(
  enriched
    .predictions[0]
    .result
    .finishers,
  [{
    rank: 1,
    boatNo: 2
  }],
  "後から補完された着順明細で再照合する"
);
assert.deepEqual(
  enriched
    .predictions[0]
    .result
    .starts,
  [{
    boatNo: 2,
    st: 0.08
  }],
  "後から補完されたST明細で理論検証を更新する"
);
assert.deepEqual(
  matchPredictions(
    enriched,
    enrichedOfficial
  ),
  enriched,
  "補完済み明細も同一なら再保存しない"
);

const cohorts =
  buildSelectionCohorts([
    {
      raceKey: "ready-65",
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: 65,
        threshold: 70,
        ready: true,
        status: "ready"
      },
      shadowV2Reference:
        currentShadowReference,
      prediction: {
        verificationEvidence: {
          ...currentEvidence
        }
      }
    },
    {
      raceKey: "not-ready",
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: null,
        threshold: 70,
        ready: false,
        status: "incomplete"
      },
      shadowV2Reference:
        currentShadowReference,
      prediction: {
        verificationEvidence: {
          ...currentEvidence
        }
      }
    },
    {
      raceKey: "legacy-80",
      selection: {
        score: 80,
        ready: true
      }
    }
  ]);
assert.equal(cohorts.score60To69.length, 1);
assert.equal(cohorts.score70Plus.length, 0);
assert.equal(cohorts.notReady.length, 1);
assert.equal(cohorts.legacy.length, 1);
assert.equal(
  cohorts.legacy[0].raceKey,
  "legacy-80",
  "旧評価80点をV2の70点以上へ混ぜない"
);
assert.equal(
  buildSelectionCohorts([{
    raceKey:
      "v2-without-generation",
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 75,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }]).missingGeneration.length,
  1,
  "世代不明のV2記録を70点以上へ混ぜない"
);

const splitCohorts =
  buildSelectionCohorts([
    {
      raceKey: "support-v1",
      selectedAt:
        "2026-07-29T01:00:00Z",
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: 75,
        threshold: 70,
        ready: true,
        status: "ready"
      },
      shadowV2Reference:
        currentShadowReference,
      prediction: {
        verificationEvidence: {
          ...currentEvidence
        }
      }
    },
    {
      raceKey: "support-v2",
      selectedAt:
        "2026-07-29T02:00:00Z",
      selection: {
        evaluator:
          "shadow-selection-v2",
        score: 76,
        threshold: 60,
        ready: true,
        status: "ready"
      },
      shadowV2Reference: {
        ...currentShadowReference,
        cohortKey:
          "selector-cohort-next"
      },
      prediction: {
        verificationEvidence: {
          ...currentEvidence,
          theorySetFingerprint:
            "structured-ticket-support-v2"
        }
      }
    }
  ]);
assert.equal(
  splitCohorts.score70Plus.length,
  1,
  "理論帰属または評価器世代が違うV2を同じ70点以上母集団へ混ぜない"
);
assert.equal(
  splitCohorts.otherGeneration.length,
  1
);

const sameOfficial = {
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
  }]
};
const evidenceUpdated =
  JSON.parse(
    JSON.stringify(matched)
  );
evidenceUpdated
  .verificationPredictions[0]
  .prediction
  .verificationEvidence
  .theorySetFingerprint =
  "structured-ticket-support-v2";
const rematched =
  matchPredictions(
    evidenceUpdated,
    sameOfficial
  );
assert.notEqual(
  rematched
    .verificationPredictions[0]
    .result
    .verificationInputFingerprint,
  matched
    .verificationPredictions[0]
    .result
    .verificationInputFingerprint,
  "公式結果が同じでも事前理論根拠が更新されたら照合をやり直す"
);
assert.equal(
  rematched
    .verificationPredictions[0]
    .result
    .supportIdentity
    .theorySetFingerprint,
  "structured-ticket-support-v2"
);
assert.deepEqual(
  matchPredictions(
    rematched,
    sameOfficial
  ),
  rematched,
  "事前根拠と公式結果が同一なら再照合時刻を変えない"
);

const karatsuBoats = [
  [1, "濱本優一"],
  [2, "末永祐輝"],
  [3, "島田一生"],
  [4, "竹内来"],
  [5, "梶原正"],
  [6, "加藤政彦"]
].map(([boatNo, racerName]) => ({
  boatNo,
  racerName
}));
const invalidKaratsuPrediction = {
  raceKey: "20260801-23-2",
  selection: {
    evaluator:
      "shadow-selection-v2",
    score: 79.5,
    threshold: 70,
    ready: true,
    status: "ready"
  },
  shadowV2Reference:
    currentShadowReference,
  prediction: {
    preRaceConditions: {
      boats: karatsuBoats
    },
    mainSheet: {
      taikou: {
        boatNo: 1,
        name: "梶原正"
      }
    },
    practicalTickets: [{
      ticket: "2-1-3",
      category: "本線"
    }],
    verificationEvidence: {
      ...currentEvidence
    }
  }
};
const quarantined = matchPredictions(
  {
    date: "20260801",
    predictions: [
      invalidKaratsuPrediction
    ],
    verificationPredictions: [
      invalidKaratsuPrediction
    ]
  },
  {
    date: "20260801",
    races: [{
      jcd: "23",
      raceNo: 2,
      resultAvailable: true,
      trifecta: {
        combination: "2-1-3",
        payout: 1000,
        popularity: 1
      }
    }]
  }
);
assert.equal(
  quarantined.predictions[0].result,
  undefined,
  "既存の艇番不整合予想を結果で上書きせず隔離する"
);
assert.equal(
  quarantined.resultSummary
    .sourcePredictionCount,
  1
);
assert.equal(
  quarantined.resultSummary
    .predictionCount,
  0,
  "隔離予想を精度集計の分母へ入れない"
);
assert.equal(
  quarantined.resultSummary
    .quarantinedCount,
  1
);
assert.equal(
  quarantined
    .verificationResultSummary
    .all
    .quarantinedCount,
  1
);
assert.equal(
  quarantined
    .verificationResultSummary
    .score70Plus
    .predictionCount,
  0,
  "79.5点でも艇番不整合なら70点以上の精度母集団へ入れない"
);

console.log("自動予想・公式結果照合テスト: 合格");
