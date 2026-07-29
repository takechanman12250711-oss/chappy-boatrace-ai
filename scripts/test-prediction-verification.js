"use strict";

const assert = require("node:assert/strict");
const verification = require("../js/prediction-verification");

const GENERATION_V1 = {
  logicFingerprint:
    "evaluated-scenarios-v1",
  confidenceDefinitionVersion:
    "internal-score-v1",
  ticketPolicyVersion:
    "practical-5-7-10-v1"
};
const THEORY_SET_V1 =
  "structured-ticket-support-v1:flow+holdPickup";

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
    theorySchemaVersion: 1,
    theorySetFingerprint:
      THEORY_SET_V1,
    generation: GENERATION_V1,
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
  5
);
assert.deepEqual(
  hit.supportIdentity,
  {
    roleSchemaVersion: 1,
    theorySchemaVersion: 1,
    theorySetFingerprint:
      THEORY_SET_V1,
    generation: GENERATION_V1
  },
  "検証結果へ正規化した支持根拠の世代識別子を保存する"
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
const attackPerformance =
  summary.rolePerformanceSummary
    .find(
      row =>
        row.key === "attack"
    );
assert.deepEqual(
  {
    key:
      attackPerformance.key,
    label:
      attackPerformance.label,
    raceCount:
      attackPerformance
        .raceCount,
    ticketCount:
      attackPerformance
        .ticketCount,
    hitTickets:
      attackPerformance
        .hitTickets,
    stake:
      attackPerformance.stake,
    return:
      attackPerformance.return,
    profit:
      attackPerformance.profit,
    recoveryRate:
      attackPerformance
        .recoveryRate,
    supportCohort:
      attackPerformance
        .supportCohort,
    overlappingCohort:
      attackPerformance
        .overlappingCohort,
    notAdditive:
      attackPerformance
        .notAdditive
  },
  {
    key: "attack",
    label: "攻め・頭",
    raceCount: 2,
    ticketCount: 2,
    hitTickets: 1,
    stake: 200,
    return: 4080,
    profit: 3880,
    recoveryRate: 2040,
    supportCohort: true,
    overlappingCohort: true,
    notAdditive: true
  },
  "役割が支持した買い目群の投資・払戻を買い目単位で集計する"
);
assert.deepEqual(
  attackPerformance
    .supportIdentity,
  hit.supportIdentity
);
assert.equal(
  attackPerformance
    .roleSchemaVersion,
  1
);
assert.equal(
  attackPerformance
    .supportIdentityKey,
  verification
    .supportIdentityKey(
      hit.supportIdentity
    )
);
assert.equal(
  summary.theoryPerformanceSummary.status,
  "collecting_pre_race_attribution",
  "旧履歴へ理論を結果後に推測して付けない"
);
assert.deepEqual(
  summary.theoryPerformanceSummary.rows,
  []
);
assert.equal(
  summary
    .theoryPerformanceSummary
    .omittedCount,
  0
);

const theoryClaimsV1 = [{
  theoryKey: "flow",
  label: "展開",
  theoryVersion:
    "evaluated-scenarios-v1",
  formal: true,
  source:
    "structured-purchase-branch"
}, {
  theoryKey: "temporary",
  label: "暫定理論",
  theoryVersion: "draft-v1",
  formal: false,
  source: "provisional-branch"
}, {
  theoryKey: "missing-source",
  label: "出典なし",
  theoryVersion: "v1",
  formal: true,
  source: ""
}, {
  theoryKey: "missing-version",
  label: "版なし",
  theoryVersion: "",
  formal: true,
  source: "structured-branch"
}];
const theorySupported = verification.verifyPrediction({
  ...prediction,
  practicalTickets: [{
    ticket: "2-1-4",
    category: "本線",
    theoryClaims: theoryClaimsV1
  }],
  verificationEvidence: {
    ...prediction.verificationEvidence,
    tickets: [{
      ticket: "2-1-4",
      categories: ["本線"],
      roleClaims:
        prediction
          .verificationEvidence
          .tickets[0]
          .roleClaims,
      theoryClaims: theoryClaimsV1
    }]
  }
}, {
  resultAvailable: true,
  winningMethod: "差し",
  trifecta: {
    combination: "2-1-4",
    payout: 4080
  }
});
theorySupported.supportIdentity =
  verification
    .normalizeSupportIdentity({
      ...theorySupported
        .supportIdentity,
      evaluator:
        "shadow-selection-v2",
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      selectorCohortKey:
        "selector-cohort-v1",
      logicFingerprint:
        "selector-logic-v1",
      theoryInputVersion:
        "theory-input-v1"
    });
const theorySummary = verification.buildSummary([
  theorySupported
]).theoryPerformanceSummary;
assert.equal(theorySummary.status, "available");
assert.equal(
  theorySummary.rows[0].key,
  "flow",
  "既存利用側との互換性のためkeyはtheoryKeyを維持する"
);
assert.equal(theorySummary.rows[0].stake, 100);
assert.equal(theorySummary.rows[0].return, 4080);
assert.equal(theorySummary.rows[0].notAdditive, true);
assert.equal(
  theorySummary.rows[0].version,
  "evaluated-scenarios-v1"
);
assert.equal(
  theorySummary.rows[0].source,
  "structured-purchase-branch"
);
assert.equal(
  theorySummary.rows[0].formal,
  true
);
assert.equal(
  theorySummary.rows[0]
    .theorySetFingerprint,
  THEORY_SET_V1
);
assert.deepEqual(
  theorySummary.rows[0]
    .supportIdentity,
  theorySupported.supportIdentity
);
assert.equal(
  theorySummary.omittedCount,
  3,
  "暫定・版なし・出典なしの理論主張を除外件数として明示する"
);
assert.equal(
  theorySummary.rows.some(
    row =>
      row.key === "temporary"
  ),
  false,
  "暫定理論を正式な理論別回収率へ混ぜない"
);
const supportIdentityV2 =
  verification
    .normalizeSupportIdentity({
      roleSchemaVersion: 1,
      theorySchemaVersion: 1,
      theorySetFingerprint:
        "structured-ticket-support-v2:flow+holdPickup",
      generation: {
        ...GENERATION_V1,
        logicFingerprint:
          "evaluated-scenarios-v2"
      },
      evaluator:
        "automatic-selection",
      evaluatorVersion:
        "selector-v2",
      selectorCohortKey:
        "selector-cohort-v2",
      logicFingerprint:
        "selector-logic-v2",
      theoryInputVersion:
        "theory-input-v2"
    });
assert.equal(
  supportIdentityV2
    .selectorCohortKey,
  "selector-cohort-v2",
  "照合側が追加する選定器の識別子を正規化時に失わない"
);
assert.equal(
  supportIdentityV2
    .theoryInputVersion,
  "theory-input-v2"
);
const theorySupportedV2 = {
  ...theorySupported,
  supportIdentity:
    supportIdentityV2,
  practicalRows:
    theorySupported
      .practicalRows
      .map(row => ({
        ...row,
        theoryClaims: [{
          theoryKey: "flow",
          label: "展開",
          version:
            "evaluated-scenarios-v2",
          formal: true,
          source:
            "structured-purchase-branch-v2"
        }]
      }))
};
const theoryVersionSplit =
  verification
    .buildTheoryPerformanceSummary([
      theorySupported,
      theorySupportedV2
    ]);
assert.deepEqual(
  theoryVersionSplit.rows
    .map(row => row.key),
  ["flow", "flow"],
  "同名理論の互換keyを保ったまま別行にする"
);
assert.deepEqual(
  theoryVersionSplit.rows
    .map(row => row.version)
    .sort(),
  [
    "evaluated-scenarios-v1",
    "evaluated-scenarios-v2"
  ],
  "同名理論でも版が違えば実績を分離する"
);
assert.deepEqual(
  theoryVersionSplit.rows
    .map(
      row =>
        row
          .theorySetFingerprint
    )
    .sort(),
  [
    THEORY_SET_V1,
    "structured-ticket-support-v2:flow+holdPickup"
  ].sort(),
  "理論セットの指紋が違う実績を混ぜない"
);
assert.deepEqual(
  theoryVersionSplit.rows
    .map(row => row.source)
    .sort(),
  [
    "structured-purchase-branch",
    "structured-purchase-branch-v2"
  ]
);
assert.ok(
  theoryVersionSplit.rows
    .every(
      row =>
        row.ticketCount === 1
    ),
  "別世代の支持買い目を同じ集計行へ合算しない"
);

const identityOnlySplit =
  verification
    .buildTheoryPerformanceSummary([
      theorySupported,
      {
        ...theorySupported,
        supportIdentity:
          supportIdentityV2
      }
    ]);
assert.equal(
  identityOnlySplit.rows.length,
  2,
  "理論名・版・出典が同じでも理論セットの指紋が違えば別行にする"
);
assert.ok(
  identityOnlySplit.rows
    .every(
      row =>
        row.version ===
          "evaluated-scenarios-v1" &&
        row.source ===
          "structured-purchase-branch"
    )
);

const sourceOnlySplit =
  verification
    .buildTheoryPerformanceSummary([
      theorySupported,
      {
        ...theorySupported,
        practicalRows:
          theorySupported
            .practicalRows
            .map(row => ({
              ...row,
              theoryClaims: [{
                theoryKey: "flow",
                label: "展開",
                version:
                  "evaluated-scenarios-v1",
                formal: true,
                source:
                  "independent-source"
              }]
            }))
      }
    ]);
assert.equal(
  sourceOnlySplit.rows.length,
  2,
  "同一世代・同一版でも出典が違う理論支持を別行にする"
);

const splitRoleRows =
  verification
    .buildRolePerformanceSummary([
      theorySupported,
      theorySupportedV2
    ])
    .filter(
      row =>
        row.key === "attack"
    );
assert.equal(
  splitRoleRows.length,
  2,
  "同じ役割でも支持根拠・選定器の世代が違えば別行にする"
);
assert.ok(
  splitRoleRows.every(
    row =>
      row.ticketCount === 1
  )
);
assert.notEqual(
  splitRoleRows[0]
    .supportIdentityKey,
  splitRoleRows[1]
    .supportIdentityKey
);

const selectorIdentityA =
  verification
    .normalizeSupportIdentity({
      ...theorySupported
        .supportIdentity,
      evaluator:
        "automatic-selection",
      evaluatorVersion:
        "selector-v2",
      selectorCohortKey:
        "selector-a",
      logicFingerprint:
        "selector-logic",
      theoryInputVersion:
        "theory-input-v2"
    });
const selectorIdentityB =
  verification
    .normalizeSupportIdentity({
      ...selectorIdentityA,
      selectorCohortKey:
        "selector-b"
    });
const selectorSplitRoleRows =
  verification
    .buildRolePerformanceSummary([
      {
        ...theorySupported,
        supportIdentity:
          selectorIdentityA
      },
      {
        ...theorySupported,
        supportIdentity:
          selectorIdentityB
      }
    ])
    .filter(
      row =>
        row.key === "attack"
    );
assert.equal(
  selectorSplitRoleRows.length,
  2,
  "同じ予想世代でも選定器コホートが違う役割実績を混ぜない"
);
assert.deepEqual(
  selectorSplitRoleRows
    .map(
      row =>
        row
          .supportIdentity
          .selectorCohortKey
    )
    .sort(),
  [
    "selector-a",
    "selector-b"
  ]
);

const invalidIdentitySummary =
  verification
    .buildTheoryPerformanceSummary([{
      ...theorySupported,
      supportIdentity: {
        ...theorySupported
          .supportIdentity,
        generation: {
          logicFingerprint:
            "incomplete"
        }
      }
    }]);
assert.equal(
  invalidIdentitySummary.status,
  "collecting_pre_race_attribution"
);
assert.deepEqual(
  invalidIdentitySummary.rows,
  []
);
assert.equal(
  invalidIdentitySummary
    .omittedCount,
  theoryClaimsV1.length,
  "世代識別が不完全な理論主張を正式実績へ含めない"
);
[
  "evaluator",
  "evaluatorVersion",
  "selectorCohortKey",
  "logicFingerprint",
  "theoryInputVersion"
].forEach(key => {
  const incomplete =
    verification
      .buildTheoryPerformanceSummary([{
        ...theorySupported,
        supportIdentity: {
          ...theorySupported
            .supportIdentity,
          [key]: ""
        }
      }]);

  assert.deepEqual(
    incomplete.rows,
    [],
    `${key}がない理論帰属を正式実績へ含めない`
  );
  assert.equal(
    incomplete.omittedCount,
    theoryClaimsV1.length,
    `${key}不足を除外件数へ含める`
  );
});

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
