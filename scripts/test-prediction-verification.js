"use strict";

const assert = require("node:assert/strict");
const verification = require("../js/prediction-verification");

const prediction = {
  raceFlow: { title: "2差し本線" },
  internalEvaluation: {
    mode: "main",
    label: "AI評価",
    score: 75,
    probability: false
  },
  verificationEvidence: {
    roleSchemaVersion: 1,
    generation: {
      logicFingerprint:
        "evaluated-scenarios-v1",
      confidenceDefinitionVersion:
        "internal-score-v1",
      ticketPolicyVersion:
        "practical-5-7-10-v1"
    },
    mainScenario: {
      label: "2差し本線",
      headBoatNo: 2,
      attackerBoatNo: 2
    },
    roleClaims: [
      {
        role: "attack",
        boatNo: 2,
        expectedPositions: [1]
      },
      {
        role: "continuation",
        boatNo: 1,
        expectedPositions: [2]
      },
      {
        role: "hold",
        boatNo: 1,
        expectedPositions: [2]
      },
      {
        role: "pickup",
        boatNo: 4,
        expectedPositions: [3]
      }
    ],
    tickets: [{
      ticket: "2-1-4",
      categories: [
        "本線",
        "本命",
        "独立展開",
        "展開候補"
      ],
      roleClaims: [
        {
          role: "attack",
          boatNo: 2,
          expectedPositions: [1]
        },
        {
          role: "hold",
          boatNo: 1,
          expectedPositions: [2]
        },
        {
          role: "pickup",
          boatNo: 4,
          expectedPositions: [3]
        }
      ]
    }]
  },
  mainSheet: {
    honmei: { boatNo: 2 },
    taikou: { boatNo: 1 },
    ana: { boatNo: 4 },
    osae: { boatNo: 3 }
  },
  practicalTickets: [
    { ticket: "2-1-4", category: "本線" },
    { ticket: "2-4-1", category: "押さえ" },
    { ticket: "2-1-5", category: "流し" },
    { ticket: "4-2-1", category: "万舟・穴" },
    { ticket: "1-2-4", category: "本線" }
  ]
};

const hit = verification.verifyPrediction(prediction, {
  resultAvailable: true,
  winningMethod: "差し",
  trifecta: {
    combination: "2→1→4",
    payout: 4080,
    popularity: 14
  }
});

assert.equal(hit.settled, true);
assert.equal(hit.scenarioTitle, "2差し本線");
assert.equal(hit.expectedMethod, "差し");
assert.equal(hit.scenarioMatched, true);
assert.equal(hit.practicalHit, true);
assert.equal(hit.hitCategory, "本線");
assert.equal(hit.marks.find(item => item.symbol === "◎").finishLabel, "1着");
assert.equal(hit.marks.find(item => item.symbol === "○").finishLabel, "2着");
assert.equal(hit.marks.find(item => item.symbol === "▲").finishLabel, "3着");
assert.equal(hit.marks.find(item => item.symbol === "△").finishLabel, "4着以下");
assert.equal(hit.simulatedStake, 500);
assert.equal(hit.simulatedReturn, 4080);
assert.equal(hit.simulatedRecoveryRate, 816);
assert.equal(hit.priorityReview.primaryStage, "的中");
assert.equal(
  hit.schemaVersion,
  4
);
assert.equal(
  hit
    .scenarioVerification
    .status,
  "matched"
);
assert.equal(
  hit.roleResults.length,
  4
);
assert.ok(
  hit.roleResults.every(
    item =>
      item.status ===
      "matched"
  )
);
assert.deepEqual(
  hit.hitCategories,
  [
    "本線",
    "独立展開"
  ]
);
assert.equal(
  hit
    .ticketCategoryResults
    .find(
      item =>
        item.label ===
        "独立展開"
    ).status,
  "matched"
);

const miss = verification.verifyPrediction(prediction, {
  resultAvailable: true,
  winningMethod: "逃げ",
  trifecta: { combination: "1-3-4", payout: 2110 }
});

assert.equal(miss.scenarioMatched, false);
assert.equal(miss.practicalHit, false);
assert.equal(miss.missType, "相手抜け");
assert.equal(miss.simulatedReturn, 0);
assert.equal(miss.priorityReview.primaryStage, "展開");
assert.equal(
  miss
    .scenarioVerification
    .status,
  "missed"
);

[
  "抜き",
  "恵まれ"
].forEach(winningMethod => {
  const knownMethodMiss =
    verification.verifyPrediction(
      prediction,
      {
        resultAvailable: true,
        winningMethod,
        trifecta: {
          combination: "2-1-4"
        }
      }
    );

  assert.equal(
    knownMethodMiss
      .scenarioVerification
      .positionMatched,
    true
  );
  assert.equal(
    knownMethodMiss
      .scenarioVerification
      .methodMatched,
    false
  );
  assert.equal(
    knownMethodMiss
      .scenarioVerification
      .status,
    "missed",
    `公式決まり手「${winningMethod}」を比較不能として校正母数から落とさない`
  );
  assert.equal(
    knownMethodMiss.scenarioMatched,
    false
  );
});

[
  "",
  "決まり手不明"
].forEach(winningMethod => {
  const unknownMethod =
    verification.verifyPrediction(
      prediction,
      {
        resultAvailable: true,
        winningMethod,
        trifecta: {
          combination: "2-1-4"
        }
      }
    );

  assert.equal(
    unknownMethod
      .scenarioVerification
      .status,
    "not_comparable",
    "決まり手の欠損・未知だけを比較不能にする"
  );
  assert.equal(
    unknownMethod
      .scenarioVerification
      .methodMatched,
    null
  );
});
assert.deepEqual(
  miss.priorityReview.stages.map(item => item.stage),
  verification.PRIORITY_STAGES
);

const summary = verification.buildSummary([hit, miss]);
assert.equal(summary.settledCount, 2);
assert.equal(summary.practicalHits, 1);
assert.equal(summary.practicalHitRate, 50);
assert.equal(summary.scenarioMatchRate, 50);
assert.equal(summary.totalStake, 1000);
assert.equal(summary.totalReturn, 4080);
assert.equal(summary.simulatedRecoveryRate, 408);
assert.equal(
  summary.priorityStageSummary.find(item => item.label === "展開").count,
  1
);
assert.equal(
  summary.categorySummary.find(item => item.label === "本線").count,
  1
);
assert.equal(
  summary.roleSummary
    .find(
      item =>
        item.key === "attack"
    ).attempts,
  2
);
assert.equal(
  summary.roleSummary
    .find(
      item =>
        item.key === "attack"
    ).matched,
  1
);
assert.equal(
  summary.ticketCategorySummary
    .find(
      item =>
        item.label ===
        "独立展開"
    ).attempts,
  2
);
assert.equal(
  summary.ticketCategorySummary
    .find(
      item =>
        item.label ===
        "独立展開"
    ).matched,
  1
);
assert.equal(
  summary
    .structuredScenarioComparableCount,
  2
);
assert.equal(
  summary
    .structuredScenarioMatchRate,
  50
);

const legacy = verification.verifyPrediction(
  {
    ...prediction,
    verificationEvidence: null
  },
  {
    resultAvailable: true,
    winningMethod: "差し",
    trifecta: {
      combination: "2-1-4"
    }
  }
);
assert.equal(
  legacy
    .scenarioVerification
    .status,
  "not_comparable",
  "旧保存形式を新しい役割検証の外れに数えない"
);
assert.deepEqual(
  legacy.roleResults,
  []
);

assert.equal(verification.expectedWinningMethod("3まくり差し"), "まくり差し");
assert.equal(verification.expectedWinningMethod("4カドまくり"), "まくり");
assert.equal(
  verification.expectedWinningMethod("3コース攻め"),
  "まくり／まくり差し"
);
assert.equal(verification.classifyMiss(["2-4-1"], "2-1-4"), "着順違い");

console.log("AI予想・公式結果の詳細照合テスト: 合格");
