"use strict";

const assert =
  require("node:assert/strict");
const fs =
  require("node:fs");
const os =
  require("node:os");
const path =
  require("node:path");
const calibration =
  require("../js/prediction-calibration");
const improvementReview =
  require("../js/improvement-review");
const charter = require(
  "../config/chappy-charter.json"
);
const {
  assertProposalOnly,
  buildFromDirectory,
  collectPredictionRecords,
  selectShadowV2Snapshot
} = require(
  "./build-improvement-review"
);

const GENERATION_A = {
  logicFingerprint:
    "review-logic-a",
  confidenceDefinitionVersion:
    "review-score-v1",
  ticketPolicyVersion:
    "review-ticket-v1"
};
const GENERATION_B = {
  logicFingerprint:
    "review-logic-b",
  confidenceDefinitionVersion:
    "review-score-v1",
  ticketPolicyVersion:
    "review-ticket-v1"
};
const GENERATED_AT =
  "2026-07-29T00:00:00.000Z";
const ACTIVE_SELECTION_THRESHOLD =
  charter.shadowSelectionV2.selectionThreshold;

function reviewRecord(
  index,
  options = {}
) {
  const generation =
    options.generation ||
    GENERATION_A;
  const matched =
    options.matched ??
    index % 5 === 0;
  const selectedAt =
    new Date(
      Date.parse(
        "2026-07-01T00:00:00.000Z"
      ) +
      index * 60_000 +
      Number(
        options.timeOffset || 0
      )
    );
  const deadlineAt =
    new Date(
      selectedAt.getTime() +
      10 * 60_000
    );
  const raceKey =
    options.raceKey ||
    `${options.prefix || "race"}-` +
    String(index)
      .padStart(4, "0");
  const roleStatus =
    matched
      ? "matched"
      : "missed";

  return {
    raceKey,
    date: "20260729",
    jcd: "03",
    raceNo:
      index % 12 + 1,
    place:
      options.place ||
      "江戸川",
    selectedAt:
      selectedAt.toISOString(),
    deadlineAt:
      deadlineAt.toISOString(),
    verificationMode:
      "selected",
    selection: {
      evaluator:
        options.evaluator ||
        "shadow-selection-v2",
      ready: true,
      qualified:
        options.qualified ??
        true,
      selected: true,
      status: "ready",
      score:
        Number(
          options.score ?? 75
        ),
      threshold:
        Number(
          options.threshold ??
          ACTIVE_SELECTION_THRESHOLD
        )
    },
    shadowV2: {
      verificationMode:
        "shadow_v2",
      cohortKey:
        options
          .selectorCohort ||
        "review-selector-a",
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      complete:
        options.shadowComplete ??
        true,
      calibrationEligible:
        options
          .calibrationEligible ??
        true,
      officialResultUsedForEvaluation:
        options
          .shadowResultUsed ??
        false,
      status:
        options.shadowStatus ||
        "ready"
    },
    prediction: {
      predictionMode:
        "server_pre_deadline",
      officialResultUsedForPrediction:
        false,
      internalEvaluation: {
        mode:
          options.mode ||
          "main",
        label: "AI評価",
        score:
          Number(
            options.score ?? 75
          ),
        probability: false
      },
      verificationEvidence: {
        roleSchemaVersion:
          Number(
            options
              .roleSchemaVersion ??
            1
          ),
        theorySchemaVersion:
          Number(
            options
              .theorySchemaVersion ??
            1
          ),
        theorySetFingerprint:
          String(
            options
              .theorySetFingerprint ??
            "structured-ticket-support-v1:flow+holdPickup"
          ),
        generation
      },
      raceFlow: {
        title: "1号艇逃げ"
      }
    },
    result: {
      settled:
        options.settled ??
        true,
      settledAt:
        new Date(
          deadlineAt.getTime() +
          60 * 60_000
        ).toISOString(),
      verification: {
        schemaVersion: 4,
        settled:
          options.settled ??
          true,
        scenarioTitle:
          "1号艇逃げ",
        scenarioVerification: {
          status:
            options
              .scenarioStatus ||
            (
              matched
                ? "matched"
                : "missed"
            )
        },
        practicalPointCount: 5,
        practicalHit:
          matched,
        hitCategory:
          matched
            ? "本線"
            : "",
        missType:
          matched
            ? "的中"
            : "頭外れ",
        simulatedStake: 500,
        simulatedReturn:
          matched
            ? 1000
            : 0,
        roleResults: [{
          role: "attack",
          label: "攻め",
          status:
            roleStatus,
          matched,
          top3: matched
        }],
        ticketCategoryResults: [{
          label: "本線",
          status:
            roleStatus,
          matched
        }],
        priorityReview: {
          primaryStage:
            matched
              ? "的中"
              : "展開"
        }
      }
    }
  };
}

function selectedRecords(
  count,
  options = {}
) {
  return Array.from(
    { length: count },
    (_, index) =>
      reviewRecord(
        index + 1,
        {
          ...options,
          prefix:
            options.prefix ||
            "race"
        }
      )
  );
}

function build(
  records,
  generation =
    GENERATION_A
) {
  return improvementReview
    .buildImprovementReview(
      records,
      {
        activeGeneration:
          generation,
        generatedAt:
          GENERATED_AT
      }
    );
}

function buildWithArchive(
  records,
  generation =
    GENERATION_A
) {
  return improvementReview
    .buildImprovementReview(
      records,
      {
        activeGeneration:
          generation,
        generatedAt:
          GENERATED_AT,
        includeArchiveReports:
          true
      }
    );
}

const review99 =
  build(
    selectedRecords(99)
  );
assert.equal(
  review99
    .progress
    .completedReviewCount,
  0,
  "99Rではレビューを作らない"
);
assert.equal(
  review99.reports.length,
  0
);
assert.equal(
  review99
    .progress
    .remainingToNext,
  1
);

const records100 =
  selectedRecords(100);
const review100 =
  build(records100);
assert.equal(
  review100
    .progress
    .completedReviewCount,
  1,
  "100Rで最初のレビューを作る"
);
assert.equal(
  review100.reports.length,
  1
);
assert.equal(
  review100.reports[0]
    .range.fromRace,
  1
);
assert.equal(
  review100.reports[0]
    .range.toRace,
  100
);
assert.ok(
  review100.reports[0]
    .proposals.length > 0,
  "100Rの弱点から改善候補を作る"
);

const chaosAssessment =
  improvementReview
    .assessReviewRecord(
      reviewRecord(
        999,
        {
          mode: "chaos",
          prefix:
            "chaos-selected"
        }
      )
    );
assert.equal(
  chaosAssessment.eligible,
  true,
  "完成済みの波乱入口評価も正式100Rへ含める"
);
assert.equal(
  chaosAssessment
    .sample
    .mode,
  "chaos"
);

const nonComparableAssessment =
  improvementReview
    .assessReviewRecord(
      reviewRecord(
        1000,
        {
          scenarioStatus:
            "not_comparable",
          prefix:
            "non-comparable"
        }
      )
    );
assert.equal(
  nonComparableAssessment
    .eligible,
  true,
  "展開一致を比較できない正式レースも回収率・100R母数へ含める"
);
assert.equal(
  nonComparableAssessment
    .sample
    .scenarioComparable,
  false
);
const reviewWithNonComparable =
  build([
    ...selectedRecords(99),
    reviewRecord(
      100,
      {
        raceKey:
          "formal-non-comparable",
        scenarioStatus:
          "not_comparable"
      }
    )
  ]);
assert.equal(
  reviewWithNonComparable
    .source
    .eligibleCount,
  100
);
assert.equal(
  reviewWithNonComparable
    .reports[0]
    .window
    .accuracy
    .count,
  100
);
assert.equal(
  reviewWithNonComparable
    .reports[0]
    .window
    .accuracy
    .scenarioComparable,
  99,
  "展開一致率だけ比較可能99Rを分母にする"
);

[
  {
    evaluator:
      "legacy-selector",
    expectedReason:
      "unsupportedEvaluator"
  },
  {
    shadowComplete: false,
    expectedReason:
      "incompleteShadowV2"
  },
  {
    calibrationEligible:
      false,
    expectedReason:
      "incompleteShadowV2"
  },
  {
    shadowResultUsed:
      true,
    expectedReason:
      "officialResultLeakage"
  },
  {
    theorySetFingerprint: "",
    expectedReason:
      "missingTheorySetFingerprint"
  },
  {
    qualified: false,
    expectedReason:
      "incompleteInput"
  },
  {
    score: 69,
    threshold: 70,
    expectedReason:
      "invalidSelectionDecision"
  },
  {
    threshold: "not-a-number",
    expectedReason:
      "invalidSelectionDecision"
  }
].forEach(
  ({
    expectedReason,
    ...options
  }, index) => {
    const assessment =
      improvementReview
        .assessReviewRecord(
          reviewRecord(
            1100 + index,
            {
              ...options,
              prefix:
                "strict-formal-gate"
            }
          )
        );
    assert.equal(
      assessment.eligible,
      false
    );
    assert.equal(
      assessment.reason,
      expectedReason,
      "V2原本が正式でない記録を100Rへ混ぜない"
    );
  }
);

const review199 =
  build(
    selectedRecords(199)
  );
assert.equal(
  review199.reports.length,
  1,
  "199Rでは100R報告だけを保持する"
);
assert.equal(
  review199
    .progress
    .currentWindowCount,
  99
);
assert.equal(
  review199
    .progress
    .remainingToNext,
  1
);

const review200 =
  buildWithArchive(
    selectedRecords(200)
  );
assert.equal(
  review200.reports.length,
  1,
  "画面用JSONは200R時点でも最新報告だけにする"
);
assert.deepEqual(
  review200.archiveReports.map(
    report =>
      report.milestone
  ),
  [100, 200]
);
assert.equal(
  review200
    .progress
    .currentWindowCount,
  0
);
assert.equal(
  review200
    .progress
    .remainingToNext,
  100
);
assert.deepEqual(
  review200.archiveReports.map(
    report =>
      report.proposalBasis
  ),
  [
    "latest-100-race-window",
    "latest-100-race-window"
  ],
  "改善提案は各100R区間だけを根拠にする"
);

const changedTrendReview =
  buildWithArchive([
    ...selectedRecords(
      100,
      {
        matched: false,
        prefix: "weak-window"
      }
    ),
    ...selectedRecords(
      100,
      {
        matched: true,
        prefix: "strong-window",
        timeOffset:
          24 * 60 * 60 * 1000
      }
    )
  ]);
assert.ok(
  changedTrendReview
    .archiveReports[0]
    .proposals.length > 0,
  "弱い最初の100Rから提案を作る"
);
assert.equal(
  changedTrendReview
    .archiveReports[1]
    .proposals.length,
  0,
  "改善済みの次100Rへ過去区間の弱点を持ち越さない"
);
assert.equal(
  changedTrendReview
    .archiveReports[1]
    .window
    .accuracy
    .scenarioMatchRate,
  100
);
assert.equal(
  changedTrendReview
    .archiveReports[1]
    .cumulative
    .accuracy
    .scenarioMatchRate,
  50,
  "累積実績は参考値として別に保持する"
);

const review600 =
  build(
    selectedRecords(600)
  );
assert.equal(
  review600.reports.length,
  1,
  "画面用の詳細報告は最新1件へ抑える"
);
assert.equal(
  review600
    .reportHistory
    .length,
  6,
  "600R以降も全100R節目の承認履歴を失わない"
);
assert.deepEqual(
  review600
    .reportHistory
    .map(
      report =>
        report.milestone
    ),
  [
    100,
    200,
    300,
    400,
    500,
    600
  ]
);
assert.equal(
  review600
    .reportRetention
    .history,
  "latest_milestones_metadata"
);
assert.equal(
  review600
    .reportHistory[0]
    .proposals,
  undefined,
  "初期表示用JSONへ過去提案の全文を重複保存しない"
);
assert.match(
  review600
    .reportHistory[0]
    .archivePath,
  /^improvement-reviews\/review-1-[a-f0-9]{8}\.json$/,
  "各100R節目の提案全文は個別archiveを参照する"
);
assert.match(
  review600
    .reportHistory[0]
    .proposalDigest,
  /^[a-f0-9]{8}$/,
  "履歴要約から提案全文の同一性を監査できる"
);
assert.ok(
  Buffer.byteLength(
    JSON.stringify(
      review600
    ) + "\n",
    "utf8"
  ) < 20000,
  "600R到達後も初期表示用レビューJSONを20KB未満に保つ"
);

const deterministic =
  build([
    ...records100
  ].reverse());
assert.equal(
  deterministic.reports[0]
    .batchId,
  review100.reports[0]
    .batchId,
  "入力順やgeneratedAtでbatch IDを変えない"
);
assert.equal(
  new Set(
    review200.archiveReports.map(
      report =>
        report.batchId
    )
  ).size,
  2,
  "100R窓ごとに一意のbatch IDを付ける"
);

const mixedGeneration =
  build([
    ...selectedRecords(
      60,
      {
        generation:
          GENERATION_A,
        prefix: "a-mixed"
      }
    ),
    ...selectedRecords(
      40,
      {
        generation:
          GENERATION_B,
        prefix: "b-mixed"
      }
    )
  ]);
assert.equal(
  mixedGeneration
    .source
    .eligibleCount,
  60
);
assert.equal(
  mixedGeneration.reports.length,
  0,
  "別世代の60R+40Rを100Rへ合算しない"
);
assert.equal(
  mixedGeneration
    .source
    .excluded
    .nonActiveGeneration,
  40
);

const mixedSelectorCohort =
  improvementReview
    .buildImprovementReview(
      [
        ...selectedRecords(
          60,
          {
            selectorCohort:
              "selector-a",
            prefix:
              "selector-a"
          }
        ),
        ...selectedRecords(
          40,
          {
            selectorCohort:
              "selector-b",
            prefix:
              "selector-b"
          }
        )
      ],
      {
        activeGeneration:
          GENERATION_A,
        activeSelectorCohortKey:
          "selector-a",
        generatedAt:
          GENERATED_AT
      }
    );
assert.equal(
  mixedSelectorCohort
    .source
    .eligibleCount,
  60
);
assert.equal(
  mixedSelectorCohort
    .reports.length,
  0,
  "異なる自動選定V2世代の60R+40Rを100Rへ合算しない"
);
assert.equal(
  mixedSelectorCohort
    .source
    .excluded
    .nonActiveGeneration,
  40
);

const mixedTheoryCohort =
  improvementReview
    .buildImprovementReview(
      [
        ...selectedRecords(
          60,
          {
            theorySetFingerprint:
              "formal-theory-set-a",
            prefix:
              "theory-a"
          }
        ),
        ...selectedRecords(
          40,
          {
            theorySetFingerprint:
              "formal-theory-set-b",
            prefix:
              "theory-b"
          }
        )
      ],
      {
        activeGeneration:
          GENERATION_A,
        activeSelectorCohortKey:
          "review-selector-a",
        activeTheorySetFingerprint:
          "formal-theory-set-a",
        generatedAt:
          GENERATED_AT
      }
    );
assert.equal(
  mixedTheoryCohort
    .source
    .eligibleCount,
  60,
  "異なる正式理論セットの60R+40Rを100Rへ合算しない"
);
assert.equal(
  mixedTheoryCohort
    .source
    .excluded
    .nonActiveGeneration,
  40
);

const mixedThresholdCohort =
  improvementReview
    .buildImprovementReview(
      [
        ...selectedRecords(
          60,
          {
            threshold: 70,
            score: 75,
            prefix:
              "threshold-70"
          }
        ),
        ...selectedRecords(
          40,
          {
            threshold: 60,
            score: 65,
            prefix:
              "threshold-60"
          }
        )
      ],
      {
        activeGeneration:
          GENERATION_A,
        activeSelectorCohortKey:
          "review-selector-a",
        activeTheorySetFingerprint:
          "structured-ticket-support-v1:flow+holdPickup",
        activeSelectionThreshold:
          70,
        generatedAt:
          GENERATED_AT
      }
    );
assert.equal(
  mixedThresholdCohort
    .source
    .eligibleCount,
  60,
  "選定基準70点の60Rと60点の40Rを同じ100Rへ合算しない"
);
assert.equal(
  mixedThresholdCohort
    .source
    .excluded
    .nonActiveGeneration,
  40
);
assert.equal(
  mixedThresholdCohort
    .activeSelectionThreshold,
  70,
  "現行の正式選定基準を母集団識別へ保存する"
);

const hundredEach = [
  ...selectedRecords(
    100,
    {
      generation:
        GENERATION_A,
      prefix: "a-only"
    }
  ),
  ...selectedRecords(
    100,
    {
      generation:
        GENERATION_B,
      prefix: "b-only"
    }
  )
];
const generationAReview =
  build(
    hundredEach,
    GENERATION_A
  );
const generationBReview =
  build(
    hundredEach,
    GENERATION_B
  );
assert.equal(
  generationAReview
    .source
    .eligibleCount,
  100
);
assert.equal(
  generationBReview
    .source
    .eligibleCount,
  100
);
assert.notEqual(
  generationAReview
    .reports[0]
    .batchId,
  generationBReview
    .reports[0]
    .batchId,
  "世代ごとにbatch IDを分ける"
);

const shadow =
  reviewRecord(
    9001,
    {
      raceKey:
        "shadow-race"
    }
  );
shadow.verificationMode =
  "shadow";
shadow.selection.selected =
  false;
shadow.prediction
  .predictionMode =
  "server_pre_deadline_shadow";

const withShadow =
  build([
    ...selectedRecords(99),
    shadow
  ]);
assert.equal(
  withShadow
    .source
    .eligibleCount,
  99
);
assert.equal(
  withShadow
    .source
    .shadowCount,
  1
);
assert.equal(
  withShadow.reports.length,
  0,
  "shadowを100R到達件数へ含めない"
);

const beforeFirstShadow =
  reviewRecord(
    0,
    {
      raceKey:
        "shadow-before-first",
      matched: true
    }
  );
beforeFirstShadow
  .verificationMode =
  "shadow";
beforeFirstShadow
  .selection
  .selected = false;
beforeFirstShadow
  .prediction
  .predictionMode =
  "server_pre_deadline_shadow";

const betweenWindowsShadow =
  reviewRecord(
    100,
    {
      raceKey:
        "shadow-between-windows",
      matched: true,
      timeOffset: 30_000
    }
  );
betweenWindowsShadow
  .verificationMode =
  "shadow";
betweenWindowsShadow
  .selection
  .selected = false;
betweenWindowsShadow
  .prediction
  .predictionMode =
  "server_pre_deadline_shadow";

const shadowWindowReview =
  buildWithArchive([
    ...selectedRecords(200),
    beforeFirstShadow,
    betweenWindowsShadow
  ]);
assert.equal(
  shadowWindowReview
    .archiveReports[0]
    .window
    .selectionComparison
    .shadow
    .count,
  1,
  "世代開始から最初の選定までの見送り検証を第1区間へ含める"
);
assert.equal(
  shadowWindowReview
    .archiveReports[1]
    .window
    .selectionComparison
    .shadow
    .count,
  1,
  "前回100R到達後から次の選定までの見送り検証を次区間へ含める"
);

const legacy =
  reviewRecord(9101);
legacy.prediction
  .verificationEvidence
  .roleSchemaVersion = 0;
const legacyTheory =
  reviewRecord(9106);
legacyTheory.prediction
  .verificationEvidence
  .theorySchemaVersion = 0;
const extraLegacyRecords =
  [9107, 9108, 9109, 9110]
    .map(index => {
      const record =
        reviewRecord(index);
      record.prediction
        .verificationEvidence
        .roleSchemaVersion = 0;
      return record;
    });
const incomplete =
  reviewRecord(9102);
incomplete.selection.ready =
  false;
const postDeadline =
  reviewRecord(9103);
postDeadline.selectedAt =
  "2026-07-29T04:01:00.000Z";
postDeadline.deadlineAt =
  "2026-07-29T04:00:00.000Z";
const leaked =
  reviewRecord(9104);
leaked.prediction
  .officialResultUsedForPrediction =
  true;
const unsettled =
  reviewRecord(9105);
unsettled.result.settled =
  false;
unsettled.result
  .verification
  .settled = false;
const duplicate =
  reviewRecord(
    9999,
    {
      raceKey:
        records100[0]
          .raceKey,
      timeOffset:
        100_000_000
    }
  );
const exclusions =
  build([
    ...records100,
    shadow,
    legacy,
    legacyTheory,
    ...extraLegacyRecords,
    incomplete,
    postDeadline,
    leaked,
    unsettled,
    duplicate
  ]);

assert.equal(
  exclusions
    .source
    .eligibleCount,
  100,
  "無効行と重複を100Rへ足さない"
);
assert.equal(
  exclusions
    .source
    .shadowCount,
  1
);
assert.equal(
  exclusions
    .source
    .excluded
    .legacySchema,
  6
);
assert.deepEqual(
  exclusions
    .source
    .excludedExamples
    .legacySchema,
  [
    legacy.raceKey,
    legacyTheory.raceKey,
    extraLegacyRecords[0]
      .raceKey
  ],
  "除外理由ごとの代表例は先頭3レースまでに制限する"
);
assert.deepEqual(
  exclusions
    .source
    .excludedExamples
    .notSettled,
  [unsettled.raceKey],
  "正式100Rへ入らない理由を代表raceKeyで追跡できる"
);
assert.deepEqual(
  exclusions
    .source
    .excludedExamples
    .duplicateRace,
  [duplicate.raceKey],
  "重複除外も代表raceKeyを保持する"
);
assert.equal(
  exclusions
    .source
    .excluded
    .incompleteInput,
  1
);
assert.equal(
  exclusions
    .source
    .excluded
    .preDeadlineUnconfirmed,
  1
);
assert.equal(
  exclusions
    .source
    .excluded
    .officialResultLeakage,
  1
);
assert.equal(
  exclusions
    .source
    .excluded
    .notSettled,
  1
);
assert.equal(
  exclusions
    .source
    .excluded
    .duplicateRace,
  1
);

assert.equal(
  assertProposalOnly(
    review100
  ),
  review100
);
assert.throws(
  () =>
    assertProposalOnly({
      ...review100,
      safety: {
        ...review100.safety,
        autoApply: true
      }
    }),
  /提案専用ロック/
);

[
  review100,
  review100.safety,
  review100.reports[0],
  ...review100
    .reports[0]
    .proposals
].forEach(row => {
  assert.equal(
    row.action,
    "proposal_only"
  );
  assert.equal(
    row.approvalRequired,
    true
  );
  assert.equal(
    row.autoApply,
    false
  );
  assert.equal(
    row.applicationLock,
    true
  );
  assert.equal(
    row.decision,
    "pending"
  );
  assert.equal(
    row.applied,
    false
  );
});

const temporaryDirectory =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "chappy-improvement-review-"
    )
  );

try {
  const dailyPath =
    path.join(
      temporaryDirectory,
      "20260729.json"
    );
  const outputPath =
    path.join(
      temporaryDirectory,
      "improvement-review.json"
    );
  const strippedRecords =
    records100.map(
      record => {
        const {
          shadowV2,
          ...stored
        } = record;
        const recordKey =
          `shadow-${record.raceKey}`;
        return {
          record: {
            ...stored,
            shadowV2Reference: {
              recordKey,
              cohortKey:
                "review-cohort-a",
              capturedAt:
                record.selectedAt,
              evaluatorVersion:
                "shadow-selection-v2.0.0",
              totalScore:
                record.selection.score
            }
          },
          snapshot: {
            ...shadowV2,
            recordKey,
            cohortKey:
              "review-cohort-a",
            evaluatorVersion:
              "shadow-selection-v2.0.0",
            raceKey:
              record.raceKey,
            capturedAt:
              record.selectedAt,
            evaluation: {
              totalScore:
                record.selection.score
            },
            officialResultUsedForEvaluation:
              false
          }
        };
      }
    );
  const daily = {
    schemaVersion: 3,
    date: "20260729",
    predictions:
      strippedRecords
        .slice(0, 50)
        .map(row => row.record),
    verificationPredictions:
      strippedRecords
        .slice(50)
        .map(row => row.record),
    shadowV2Predictions:
      strippedRecords.map(
        row => row.snapshot
      )
  };
  const quarantineBoats = [
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
  daily.predictions.push({
    raceKey: "20260801-23-2",
    prediction: {
      preRaceConditions: {
        boats: quarantineBoats
      },
      mainSheet: {
        taikou: {
          boatNo: 1,
          name: "梶原正"
        }
      }
    }
  });
  daily.shadowV2Predictions.push({
    raceKey: "20260801-23-2",
    snapshot: {
      boats: quarantineBoats
    },
    predictionReference: {
      marks: {
        taikou: {
          boatNo: 1,
          name: "梶原正"
        }
      }
    }
  });

  fs.writeFileSync(
    dailyPath,
    JSON.stringify(daily),
    "utf8"
  );

  const collected =
    collectPredictionRecords(
      temporaryDirectory
    );
  assert.equal(
    collected.records.length,
    100,
    "艇番不整合予想を改善レビュー母集団へ入れない"
  );
  assert.equal(
    collected.shadowSnapshots.length,
    100,
    "艇番不整合V2を改善レビュー進捗へ入れない"
  );

  const first =
    buildFromDirectory({
      inputDirectory:
        temporaryDirectory,
      outputPath,
      activeGeneration:
        GENERATION_A,
      generatedAt:
        "2026-07-29T01:00:00.000Z"
    });
  assert.equal(
    first.files.length,
    1
  );
  assert.equal(
    first.result
      .source
      .fileCount,
    1
  );
  assert.equal(
    first.result
      .source
      .eligibleCount,
    100,
    "別配列のV2原本を厳密に結合して正式100Rを進める"
  );
  assert.equal(
    first.result
      .generatedAt,
    "2026-07-29T01:00:00.000Z"
  );
  assert.equal(
    first.archivePaths.length,
    1,
    "100R節目ごとの提案全文archiveを作る"
  );
  const archived =
    JSON.parse(
      fs.readFileSync(
        first.archivePaths[0],
        "utf8"
      )
    );
  assert.deepEqual(
    archived
      .report
      .proposals,
    first.result
      .reports[0]
      .proposals,
    "最新JSONを軽量化しても提案全文を節目別archiveへ保持する"
  );

  const second =
    buildFromDirectory({
      inputDirectory:
        temporaryDirectory,
      outputPath,
      activeGeneration:
        GENERATION_A,
      generatedAt:
        "2026-07-29T02:00:00.000Z"
    });
  assert.equal(
    second.result
      .generatedAt,
    first.result
      .generatedAt,
    "内容不変ならgeneratedAtを維持する"
  );
  assert.equal(
    second.result
      .reports[0]
      .batchId,
    first.result
      .reports[0]
      .batchId
  );

  const added =
    reviewRecord(101);
  const {
    shadowV2:
      addedShadow,
    ...addedStored
  } = added;
  const addedRecordKey =
    `shadow-${added.raceKey}`;
  daily
    .verificationPredictions
    .push({
      ...addedStored,
      shadowV2Reference: {
        recordKey:
          addedRecordKey,
        cohortKey:
          "review-cohort-a",
        capturedAt:
          added.selectedAt,
        evaluatorVersion:
          "shadow-selection-v2.0.0",
        totalScore:
          added.selection.score
      }
    });
  daily
    .shadowV2Predictions
    .push({
      ...addedShadow,
      recordKey:
        addedRecordKey,
      cohortKey:
        "review-cohort-a",
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      raceKey:
        added.raceKey,
      capturedAt:
        added.selectedAt,
      evaluation: {
        totalScore:
          added.selection.score
      },
      officialResultUsedForEvaluation:
        false
    });
  fs.writeFileSync(
    dailyPath,
    JSON.stringify(daily),
    "utf8"
  );

  const third =
    buildFromDirectory({
      inputDirectory:
        temporaryDirectory,
      outputPath,
      activeGeneration:
        GENERATION_A,
      generatedAt:
        "2026-07-29T03:00:00.000Z"
    });
  assert.equal(
    third.result
      .generatedAt,
    "2026-07-29T03:00:00.000Z",
    "母集団が変わったときだけgeneratedAtを更新する"
  );
  assert.equal(
    third.result
      .progress
      .currentWindowCount,
    1
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        outputPath,
        "utf8"
      )
    ),
    third.result
  );

  const switchedGeneration =
    buildFromDirectory({
      inputDirectory:
        temporaryDirectory,
      outputPath,
      activeGeneration:
        GENERATION_B,
      generatedAt:
        "2026-07-29T04:00:00.000Z"
    });
  assert.equal(
    switchedGeneration
      .result
      .reports.length,
    0,
    "新世代は旧世代の100R進捗を引き継がない"
  );
  assert.equal(
    switchedGeneration
      .result
      .reportHistory.length,
    1,
    "世代切替後も旧世代の承認待ち100R報告を失わない"
  );
  assert.equal(
    switchedGeneration
      .result
      .reportHistory[0]
      .generationKey,
    first.result
      .activeGenerationKey
  );
  assert.ok(
    archived
      .report
      .proposals
      .every(proposal =>
        proposal.what &&
        proposal.why &&
        proposal.how &&
        proposal.impact
      ),
    "旧世代の提案全文を節目別archiveで承認可能な状態に保つ"
  );
  assert.equal(
    switchedGeneration
      .result
      .reportHistory[0]
      .proposals,
    undefined,
    "世代切替後も初期表示用履歴はメタデータだけにする"
  );
  assert.equal(
    switchedGeneration
      .result
      .reportRetention
      .retainedGenerationCount,
    1
  );
} finally {
  fs.rmSync(
    temporaryDirectory,
    {
      recursive: true,
      force: true
    }
  );
}

assert.equal(
  selectShadowV2Snapshot(
    [{
      recordKey: "wrong",
      raceKey: "join-test",
      capturedAt:
        "2026-07-29T01:00:00.000Z",
      evaluation: {
        totalScore: 70
      }
    }],
    {
      raceKey: "join-test",
      selectedAt:
        "2026-07-29T01:00:00.000Z",
      selection: {
        score: 75
      }
    }
  ),
  null,
  "同時刻でも評価点が違うV2原本を誤結合しない"
);

const repositoryRoot =
  path.resolve(
    __dirname,
    ".."
  );
[
  "js/ai-core.js",
  "js/practical-selection.js",
  "js/shadow-selection-v2.js",
  "js/evaluated-scenario-candidates.js",
  "js/note-generator.js",
  "scripts/collect-predictions.js"
].forEach(relativePath => {
  const filePath =
    path.join(
      repositoryRoot,
      relativePath
    );
  if (!fs.existsSync(filePath)) {
    return;
  }
  const source =
    fs.readFileSync(
      filePath,
      "utf8"
    );
  assert.doesNotMatch(
    source,
    /improvement-review\.json|ChappyImprovementReview|build-improvement-review/,
    `${relativePath}から改善提案を予想計算へ読み込まない`
  );
});

assert.equal(
  calibration
    .generationKey(
      review100
        .activeGeneration
    ),
  review100
    .activePredictionGenerationKey
);
assert.equal(
  review100
    .activeGenerationKey,
  improvementReview
    .reviewGenerationKey(
      review100
        .activePredictionGenerationKey,
      review100
        .activeSelectorCohortKey,
      review100
        .activeTheorySetFingerprint,
      review100
        .activeSelectionThreshold
    ),
  "予想世代と自動選定世代を結合した母集団だけで100Rを区切る"
);

console.log(
  "100R改善レビュー生成テスト: 合格"
);
