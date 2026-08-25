"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeIndex,
  classifySelectionCohort,
  buildResultHeadline,
  buildShadowV2Progress
} = require("../js/auto-stats");
const {
  buildSummary
} = require("../js/prediction-verification");

const normalized = normalizeIndex({
  runs: [{ selected: true }],
  predictions: [{
    raceKey: "20260722-08-1",
    date: "20260722",
    jcd: "08",
    place: "常滑",
    raceNo: 1,
    selectedAt: "2026-07-22T01:00:00Z",
    prediction: { ticketRanks: [{ ticket: "1-2-3", role: "本命" }] },
    result: {
      settled: true,
      resultTicket: "1→2→3",
      payout: 1230,
      popularity: 4,
      winningMethod: "逃げ",
      verification: {
        scenarioMatched: true,
        hitCategory: "本線"
      }
    }
  }],
  verificationPredictions: [{
    raceKey: "20260722-08-1",
    selection: { score: 72 },
    prediction: {}
  }, {
    raceKey: "20260722-12-2",
    date: "20260722",
    jcd: "12",
    place: "住之江",
    raceNo: 2,
    selectedAt: "2026-07-22T01:01:00Z",
    scoreBand: "under_70",
    selection: { score: 58, threshold: 70, qualified: false },
    prediction: { practicalTickets: [{ ticket: "1-2-3", category: "本線" }] },
    result: {
      settled: true,
      resultTicket: "1-3-2",
      payout: 980,
      verification: { scenarioMatched: false, practicalHit: false }
    }
  }],
  shadowV2Predictions: [{
    recordKey: "20260722-12-2:old",
    raceKey: "20260722-12-2",
    cohortKey: "logic-old:reference:v2:config",
    capturedAt: "2026-07-22T01:01:00Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: true
  }]
});

assert.equal(normalized.predictions.length, 2);
assert.equal(normalized.predictions[0].predictionSource, "automatic");
assert.equal(normalized.predictions[1].predictionSource, "automatic_shadow");
assert.equal(normalized.predictions[1].scoreBand, "legacy");
assert.equal(normalized.results[0].result, "1-2-3");
assert.equal(normalized.results[0].officialPayoutPer100, 1230);
assert.equal(normalized.results[0].automaticVerification.scenarioMatched, true);
assert.equal(normalized.results[0].automaticVerification.hitCategory, "本線");
assert.equal(normalized.runs.length, 1);
assert.equal(normalized.selectedCount, 1);
assert.equal(normalized.shadowCount, 1);
assert.equal(normalized.shadowV2Predictions.length, 1);

const karatsuBoats = [
  "濱本優一",
  "末永祐輝",
  "島田一生",
  "竹内来",
  "梶原正",
  "加藤政彦"
].map((racerName, index) => ({
  boatNo: index + 1,
  racerName
}));
const invalidKaratsu = {
  raceKey: "20260801-23-2",
  prediction: {
    preRaceConditions: {
      boats: karatsuBoats
    },
    mainSheet: {
      taikou: {
        boatNo: 1,
        name: "梶原正"
      }
    }
  },
  result: {
    settled: true,
    resultTicket: "2-1-3",
    payout: 1000
  }
};
const quarantinedIndex =
  normalizeIndex({
    predictions: [invalidKaratsu],
    verificationPredictions: [
      invalidKaratsu
    ],
    shadowV2Predictions: [{
      raceKey: "20260801-23-2",
      snapshot: {
        boats: karatsuBoats
      },
      predictionReference: {
        marks: {
          taikou: {
            boatNo: 1,
            name: "梶原正"
          }
        }
      }
    }]
  });
assert.equal(
  quarantinedIndex.predictions.length,
  0
);
assert.equal(
  quarantinedIndex.results.length,
  0,
  "艇番不整合の結果を成績・回収率へ混ぜない"
);
assert.equal(
  quarantinedIndex
    .shadowV2Predictions.length,
  0,
  "艇番不整合のV2記録を精度進捗へ混ぜない"
);

const activeGeneration = {
  logicFingerprint: "logic-v2",
  confidenceDefinitionVersion:
    "confidence-v1",
  ticketPolicyVersion:
    "tickets-v1"
};
const activeEvidence = {
  roleSchemaVersion: 1,
  theorySchemaVersion: 1,
  theorySetFingerprint:
    "structured-ticket-support-v1:flow+holdPickup",
  generation:
    activeGeneration
};
const activeShadowReference = {
  cohortKey:
    "selector-cohort-current",
  evaluatorVersion:
    "shadow-selection-v2.0.0",
  logicFingerprint:
    "selector-logic-current",
  theoryInputVersion:
    "theory-input-v1.0.0"
};
const activeGenerationKey =
  JSON.stringify([
    activeGeneration
      .logicFingerprint,
    activeGeneration
      .confidenceDefinitionVersion,
    activeGeneration
      .ticketPolicyVersion,
    "1",
    "1",
    activeEvidence
      .theorySetFingerprint,
    "shadow-selection-v2",
    activeShadowReference
      .evaluatorVersion,
    activeShadowReference
      .cohortKey,
    activeShadowReference
      .logicFingerprint,
    activeShadowReference
      .theoryInputVersion,
    "70"
  ]);
const generationRecord = {
  shadowV2Reference:
    activeShadowReference,
  prediction: {
    verificationEvidence: {
      ...activeEvidence
    }
  }
};
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    selection: {
      score: 80,
      ready: true
    }
  }, activeGenerationKey).key,
  "legacy",
  "旧評価80点をV2の70点以上へ混ぜない"
);
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 75,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_70_plus"
);
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 66,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_60_69"
);
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 75,
      threshold: 70,
      ready: false,
      status: "incomplete"
    }
  }, activeGenerationKey).key,
  "v2_not_ready"
);
assert.equal(
  classifySelectionCohort({
    shadowV2Reference:
      activeShadowReference,
    prediction: {
      verificationEvidence: {
        ...activeEvidence,
        generation: {
          ...activeGeneration,
          logicFingerprint:
            "other"
        }
      }
    },
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 82,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_other_generation"
);
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    shadowV2Reference: {
      ...activeShadowReference,
      cohortKey:
        "selector-cohort-next"
    },
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 82,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_other_generation",
  "評価器cohortが違うV2を同じ点数帯へ混ぜない"
);
assert.equal(
  classifySelectionCohort({
    ...generationRecord,
    prediction: {
      verificationEvidence: {
        ...activeEvidence,
        theorySetFingerprint:
          "structured-ticket-support-v2"
      }
    },
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 82,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_other_generation",
  "理論帰属集合が違うV2を同じ点数帯へ混ぜない"
);
assert.equal(
  classifySelectionCohort({
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 75,
      threshold: 70,
      ready: true,
      status: "ready"
    }
  }, activeGenerationKey).key,
  "v2_missing_generation"
);

const v2Progress = buildShadowV2Progress([
  {
    recordKey: "race-1:old",
    raceKey: "race-1",
    cohortKey: "logic-old:reference:v2:config",
    capturedAt: "2026-07-22T01:00:00Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: true
  },
  {
    recordKey: "race-1:new-incomplete",
    raceKey: "race-1",
    cohortKey: "logic-new:reference:v2:config",
    capturedAt: "2026-07-22T02:00:00Z",
    complete: false,
    calibrationEligible: false,
    officialResultUsedForEvaluation: false,
    versions: { logicFingerprint: "logic-new" }
  },
  {
    recordKey: "race-1:new-contaminated",
    raceKey: "race-1",
    cohortKey: "logic-new:reference:v2:config",
    capturedAt: "2026-07-22T02:01:00Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: true,
    versions: { logicFingerprint: "logic-new" }
  },
  {
    recordKey: "race-1:new-complete",
    raceKey: "race-1",
    cohortKey: "logic-new:reference:v2:config",
    capturedAt: "2026-07-22T02:01:30Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: false,
    versions: { logicFingerprint: "logic-new" }
  },
  {
    recordKey: "race-2:new",
    raceKey: "race-2",
    cohortKey: "logic-new:reference:v2:config",
    capturedAt: "2026-07-22T02:02:00Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: false,
    versions: { logicFingerprint: "logic-new" }
  }
]);

assert.equal(v2Progress.logicFingerprint, "logic-new");
assert.equal(v2Progress.recordCount, 2, "同じレースの再取得を重複計上しない");
assert.equal(v2Progress.completeCount, 2);
assert.equal(v2Progress.eligibleCount, 2);
assert.equal(v2Progress.resultJoinedCount, 0);
assert.equal(v2Progress.awaitingResultCount, 2);
assert.equal(v2Progress.nextMilestone, 100);
assert.equal(v2Progress.remainingToNext, 100);
assert.equal(v2Progress.progressPercent, 0);

const contaminatedProgress = buildShadowV2Progress([
  {
    recordKey: "race-3:contaminated",
    raceKey: "race-3",
    cohortKey: "logic-new:reference:v2:config",
    capturedAt: "2026-07-22T02:03:00Z",
    complete: true,
    calibrationEligible: true,
    officialResultUsedForEvaluation: true
  }
], {
  officialResultRaceKeys: ["race-3"]
});

assert.equal(
  contaminatedProgress.eligibleCount,
  0,
  "公式結果を評価入力へ使ったV2記録は校正対象へ含めない"
);
assert.equal(contaminatedProgress.resultJoinedCount, 0);

const resultJoinedProgress = buildShadowV2Progress(
  [
    {
      recordKey: "race-1:new",
      raceKey: "race-1",
      cohortKey: "logic-new:reference:v2:config",
      capturedAt: "2026-07-22T02:01:00Z",
      complete: true,
      calibrationEligible: true,
      officialResultUsedForEvaluation: false
    },
    {
      recordKey: "race-2:new",
      raceKey: "race-2",
      cohortKey: "logic-new:reference:v2:config",
      capturedAt: "2026-07-22T02:02:00Z",
      complete: true,
      calibrationEligible: true,
      officialResultUsedForEvaluation: false
    }
  ],
  {
    officialResultRaceKeys: ["race-2"]
  }
);

assert.equal(
  resultJoinedProgress.resultJoinedCount,
  1,
  "同一レースの公式結果が索引にあれば結果取得済み候補として数える"
);
assert.equal(resultJoinedProgress.awaitingResultCount, 1);

const verificationRows = Array.from({ length: 202 }, (_, index) => ({
  settled: true,
  practicalPointCount: index < 166 ? 7 : 6,
  practicalHit: index < 42,
  simulatedStake: index < 166 ? 700 : 600,
  simulatedReturn: index === 0 ? 86780 : 0,
  scenarioMatched: index < 75 ? true : index < 190 ? false : null,
  hitCategory: index < 42 ? "本線" : "",
  marks: []
}));
const headline = buildResultHeadline(buildSummary(verificationRows));

assert.deepEqual(
  headline,
  {
    practicalCount: 202,
    practicalHits: 42,
    practicalHitRate: 20.8,
    totalStake: 137800,
    totalReturn: 86780,
    simulatedRecoveryRate: 63,
    scenarioComparableCount: 190,
    scenarioHits: 75,
    scenarioMatchRate: 39.5
  },
  "結果分析の3指標は件数・投資額・払戻額の正しい分母で算出する"
);
assert.deepEqual(
  buildResultHeadline({
    practicalCount: 0,
    practicalHits: 0,
    totalStake: 0,
    totalReturn: 0,
    scenarioComparableCount: 0,
    scenarioHits: 0
  }),
  {
    practicalCount: 0,
    practicalHits: 0,
    practicalHitRate: 0,
    totalStake: 0,
    totalReturn: 0,
    simulatedRecoveryRate: 0,
    scenarioComparableCount: 0,
    scenarioHits: 0,
    scenarioMatchRate: 0
  },
  "買い目や比較対象が0件でも0除算しない"
);

const root = path.resolve(__dirname, "..");
const statsSource = fs.readFileSync(
  path.join(root, "js", "stats.js"),
  "utf8"
);
const styleSource = fs.readFileSync(
  path.join(root, "style.css"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(root, "index.html"),
  "utf8"
);
const compactSource = fs.readFileSync(
  path.join(root, "js", "hiyori-compact-dashboard.js"),
  "utf8"
);

assert.match(
  statsSource,
  /P\.loadPredictionIndex\(\{/,
  "成績分析が分割予想index loaderを使用していません"
);
assert.match(
  statsSource,
  /data\/predictions\/index-manifest\.json/,
  "成績分析のmanifest参照がありません"
);
assert.match(
  statsSource,
  /loaded\.source === "legacy"/,
  "分割index失敗時のlegacy fallback表示がありません"
);

assert.match(
  statsSource,
  /class="results-analysis-dashboard"/,
  "結果分析ダッシュボードが描画されていません"
);
assert.match(
  statsSource,
  /buildResultHeadline/,
  "シミュレーション回収率が結果分析へ接続されていません"
);
assert.match(
  statsSource,
  /buildShadowV2Progress/,
  "V2の100・250・500R進捗が結果分析へ接続されていません"
);
assert.equal(
  statsSource.includes("<table"),
  false,
  "結果分析へスマホで読みにくいテーブルが再追加されています"
);
assert.match(
  styleSource,
  /#resultSection \.result-dashboard-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
  "結果分析カードがデスクトップで全幅になっていません"
);
assert.match(
  styleSource,
  /\.result-race-list[\s\S]*grid-template-columns/,
  "最近の予想がカード表示になっていません"
);
assert.match(
  indexSource,
  /style\.css\?v=20260825-display-layout1/,
  "結果分析CSSのキャッシュ更新が不足しています"
);
assert.match(
  compactSource,
  /AUXILIARY_ROOT_IDS/,
  "補助分析の対象パネルが明示されていません"
);
assert.equal(
  compactSource.includes('card("official"'),
  false,
  "対象のない公式比較ボタンが再追加されています"
);

console.log("自動予想成績変換テスト: 合格");
