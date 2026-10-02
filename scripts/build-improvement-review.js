"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const calibration = require("../js/prediction-calibration");
const improvementReview = require("../js/improvement-review");
const practicalSelection = require("../js/practical-selection");
const charter = require("../config/chappy-charter.json");
const boatIdentity = require(
  "../js/boat-identity"
);

function isBoatIdentityQuarantined(record) {
  const inspection =
    boatIdentity.inspectPrediction(record);
  return (
    inspection.checked === true &&
    inspection.valid === false
  );
}

const DAILY_FILE_PATTERN = /^\d{8}\.json$/;
const DEFAULT_OUTPUT_NAME =
  "improvement-review.json";
const REVIEW_OUTPUT_LIMIT =
  20000;
const ARCHIVE_DIRECTORY =
  "improvement-reviews";

function getArgument(name) {
  const prefix = `--${name}=`;
  const argument =
    process.argv.find(value =>
      value.startsWith(prefix)
    );
  return argument
    ? argument
        .slice(prefix.length)
        .trim()
    : "";
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}

function writeJsonAtomic(
  filePath,
  value
) {
  const directory =
    path.dirname(filePath);
  const temporaryPath =
    `${filePath}.${process.pid}.` +
    `${Date.now()}.tmp`;

  fs.mkdirSync(
    directory,
    { recursive: true }
  );

  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(value) + "\n",
      "utf8"
    );
    fs.renameSync(
      temporaryPath,
      filePath
    );
  } finally {
    if (
      fs.existsSync(
        temporaryPath
      )
    ) {
      fs.unlinkSync(
        temporaryPath
      );
    }
  }
}

function shadowTimestamp(
  value
) {
  return Date.parse(
    value?.capturedAt ||
    value?.selectedAt ||
    ""
  ) || 0;
}

function selectShadowV2Snapshot(
  snapshots,
  record
) {
  const source =
    Array.isArray(snapshots)
      ? snapshots.filter(Boolean)
      : [];
  if (!source.length) {
    return null;
  }

  const selectionScore =
    Number(
      record?.selection?.score
    );
  const scoreMatches =
    snapshot => {
      if (
        !Number.isFinite(
          selectionScore
        )
      ) {
        return false;
      }
      const snapshotScore =
        Number(
          snapshot
            ?.evaluation
            ?.totalScore
        );
      return (
        Number.isFinite(
          snapshotScore
        ) &&
        Math.abs(
          snapshotScore -
          selectionScore
        ) < 0.000001
      );
    };
  const reference =
    record
      ?.shadowV2Reference ||
    {};
  const referenceRecordKey =
    String(
      reference
        ?.recordKey || ""
    );
  if (referenceRecordKey) {
    const matched =
      source.find(
        snapshot =>
          String(
            snapshot
              ?.recordKey || ""
          ) ===
          referenceRecordKey
      ) ||
      null;
    if (!matched) {
      return null;
    }

    const expectedCapturedAt =
      String(
        reference
          ?.capturedAt || ""
      );
    const expectedCohortKey =
      String(
        reference
          ?.cohortKey || ""
      );
    const expectedEvaluator =
      String(
        reference
          ?.evaluatorVersion || ""
      );
    if (
      (
        expectedCapturedAt &&
        String(
          matched
            ?.capturedAt || ""
        ) !==
          expectedCapturedAt
      ) ||
      (
        expectedCohortKey &&
        String(
          matched
            ?.cohortKey || ""
        ) !==
          expectedCohortKey
      ) ||
      (
        expectedEvaluator &&
        String(
          matched
            ?.evaluatorVersion ||
          ""
        ) !==
          expectedEvaluator
      )
    ) {
      return null;
    }

    return matched;
  }

  const recordTimestamp =
    Date.parse(
      record?.selectedAt ||
      record?.capturedAt ||
      ""
    );
  const exact =
    Number.isFinite(
      recordTimestamp
    )
      ? source.find(
          snapshot =>
            shadowTimestamp(
              snapshot
            ) ===
              recordTimestamp &&
            scoreMatches(
              snapshot
            )
        )
      : null;
  if (exact) {
    return exact;
  }

  return null;
}


function compactVerificationDetail(
  detail
) {
  if (
    !detail ||
    typeof detail !== "object"
  ) {
    return null;
  }

  return {
    settled:
      detail.settled === true,
    resultTicket:
      detail.resultTicket,
    scenarioTitle:
      detail.scenarioTitle,
    scenarioMatched:
      detail.scenarioMatched,
    practicalRows:
      detail.practicalRows,
    practicalPointCount:
      detail.practicalPointCount,
    practicalHit:
      detail.practicalHit === true,
    hitCategory:
      detail.hitCategory,
    missType:
      detail.missType,
    payoutPer100:
      detail.payoutPer100,
    simulatedStake:
      detail.simulatedStake,
    simulatedReturn:
      detail.simulatedReturn,
    scenarioVerification:
      detail.scenarioVerification,
    roleResults:
      detail.roleResults,
    ticketCategoryResults:
      detail.ticketCategoryResults,
    supportIdentity:
      detail.supportIdentity,
    marks:
      detail.marks,
    priorityReview:
      detail.priorityReview
  };
}

function compactResult(
  result
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  return {
    settled:
      result.settled === true,
    settledAt:
      result.settledAt,
    verification:
      compactVerificationDetail(
        result.verification ||
        result.automaticVerification ||
        result
      )
  };
}

function compactEvidence(
  evidence
) {
  if (
    !evidence ||
    typeof evidence !== "object"
  ) {
    return null;
  }

  return {
    roleSchemaVersion:
      evidence.roleSchemaVersion,
    theorySchemaVersion:
      evidence.theorySchemaVersion,
    theorySetFingerprint:
      evidence.theorySetFingerprint,
    generation:
      evidence.generation
  };
}

function compactShadowV2Snapshot(
  snapshot
) {
  if (
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    return null;
  }

  return {
    recordKey:
      snapshot.recordKey,
    raceKey:
      snapshot.raceKey,
    cohortKey:
      snapshot.cohortKey,
    capturedAt:
      snapshot.capturedAt,
    selectedAt:
      snapshot.selectedAt,
    evaluatorVersion:
      snapshot.evaluatorVersion,
    complete:
      snapshot.complete === true,
    calibrationEligible:
      snapshot.calibrationEligible ===
      true,
    status:
      snapshot.status,
    officialResultUsedForEvaluation:
      snapshot
        .officialResultUsedForEvaluation ===
      true,
    evaluation:
      snapshot.evaluation
        ? {
            totalScore:
              snapshot
                .evaluation
                .totalScore
          }
        : undefined
  };
}

function compactPredictionRecord(
  record,
  shadowV2,
  source
) {
  const prediction =
    record?.prediction || {};
  const evidence =
    compactEvidence(
      prediction
        .verificationEvidence
    );
  const practicalEvidence =
    compactEvidence(
      prediction
        .practicalSelection
        ?.verificationEvidence
    );
  const conditionFlags =
    value =>
      value &&
      typeof value === "object"
        ? {
            officialResultUsed:
              value
                .officialResultUsed ===
              true
          }
        : undefined;
  const timing =
    value =>
      value &&
      typeof value === "object"
        ? {
            beforeDeadline:
              value.beforeDeadline ===
              true,
            preDeadline:
              value.preDeadline ===
              true
          }
        : undefined;

  return {
    raceKey:
      record?.raceKey,
    date:
      record?.date,
    jcd:
      record?.jcd,
    raceNo:
      record?.raceNo,
    place:
      record?.place,
    selectedAt:
      record?.selectedAt,
    capturedAt:
      record?.capturedAt,
    deadlineAt:
      record?.deadlineAt,
    timing:
      timing(record?.timing),
    verificationMode:
      record?.verificationMode,
    predictionMode:
      record?.predictionMode,
    isRetrospective:
      record?.isRetrospective ===
      true,
    officialResultUsedForEvaluation:
      record
        ?.officialResultUsedForEvaluation ===
      true,
    officialResultUsedForPrediction:
      record
        ?.officialResultUsedForPrediction ===
      true,
    preRaceConditions:
      conditionFlags(
        record?.preRaceConditions
      ),
    selection:
      record?.selection
        ? {
            evaluator:
              record.selection
                .evaluator,
            ready:
              record.selection.ready ===
              true,
            qualified:
              record.selection
                .qualified === true,
            selected:
              record.selection
                .selected === true,
            status:
              record.selection.status,
            score:
              record.selection.score,
            threshold:
              record.selection
                .threshold
          }
        : undefined,
    shadowV2:
      compactShadowV2Snapshot(
        shadowV2 ||
        record?.shadowV2
      ),
    prediction: {
      predictionMode:
        prediction.predictionMode,
      head:
        prediction.head,
      tickets:
        prediction.tickets,
      finalTickets:
        prediction.finalTickets,
      practicalTickets:
        prediction.practicalTickets,
      timing:
        timing(prediction.timing),
      isRetrospective:
        prediction.isRetrospective ===
        true,
      officialResultUsedForEvaluation:
        prediction
          .officialResultUsedForEvaluation ===
        true,
      officialResultUsedForPrediction:
        prediction
          .officialResultUsedForPrediction ===
        true,
      preRaceConditions:
        conditionFlags(
          prediction
            .preRaceConditions
        ),
      internalEvaluation:
        prediction.internalEvaluation
          ? {
              mode:
                prediction
                  .internalEvaluation
                  .mode
            }
          : undefined,
      verificationEvidence:
        evidence,
      practicalSelection:
        prediction.practicalSelection
          ? {
              tickets:
                prediction
                  .practicalSelection
                  .tickets,
              verificationEvidence:
                practicalEvidence ||
                undefined
            }
          : undefined
    },
    result:
      compactResult(
        record?.result ||
        record?.officialResult
      ),
    improvementReviewSource:
      source
  };
}

function collectPredictionRecords(
  inputDirectory
) {
  if (
    !fs.existsSync(
      inputDirectory
    )
  ) {
    return {
      files: [],
      records: [],
      shadowSnapshots: []
    };
  }

  const files =
    fs.readdirSync(
      inputDirectory
    )
      .filter(fileName =>
        DAILY_FILE_PATTERN.test(
          fileName
        )
      )
      .sort();
  const records = [];
  const shadowSnapshots = [];

  files.forEach(fileName => {
    const filePath =
      path.join(
        inputDirectory,
        fileName
      );
    const data =
      readJson(filePath);
    const shadowByRace =
      new Map();

    (
      Array.isArray(
        data
          ?.shadowV2Predictions
      )
        ? data
            .shadowV2Predictions
        : []
    ).forEach(snapshot => {
      if (
        isBoatIdentityQuarantined(
          snapshot
        )
      ) {
        return;
      }
      const compactSnapshot =
        compactShadowV2Snapshot(
          snapshot
        );
      shadowSnapshots.push(
        compactSnapshot
      );
      const raceKey =
        String(
          compactSnapshot
            ?.raceKey || ""
        );
      if (!raceKey) return;
      if (
        !shadowByRace.has(
          raceKey
        )
      ) {
        shadowByRace.set(
          raceKey,
          []
        );
      }
      shadowByRace
        .get(raceKey)
        .push(compactSnapshot);
    });

    [
      [
        "predictions",
        data?.predictions
      ],
      [
        "verificationPredictions",
        data
          ?.verificationPredictions
      ]
    ].forEach(
      ([
        collection,
        source
      ]) => {
        if (
          !Array.isArray(
            source
          )
        ) {
          return;
        }

        source.forEach(record => {
          if (
            isBoatIdentityQuarantined(
              record
            )
          ) {
            return;
          }
          const raceKey =
            String(
              record
                ?.raceKey || ""
            );
          const shadowV2 =
            record?.shadowV2 ||
            selectShadowV2Snapshot(
              shadowByRace.get(
                raceKey
              ),
              record
            );
          records.push(
            compactPredictionRecord(
              record,
              shadowV2,
              {
                fileName,
                collection
              }
            )
          );
        });
      }
    );
  });

  return {
    files,
    records,
    shadowSnapshots
  };
}

function preserveGeneratedAtWhenUnchanged(
  outputPath,
  next
) {
  if (
    !fs.existsSync(
      outputPath
    )
  ) {
    return next;
  }

  let current;
  try {
    current =
      readJson(outputPath);
  } catch (_) {
    return next;
  }

  const withoutGeneratedAt =
    value => ({
      ...value,
      generatedAt: ""
    });

  return (
    JSON.stringify(
      withoutGeneratedAt(
        current
      )
    ) ===
    JSON.stringify(
      withoutGeneratedAt(
        next
      )
    )
  )
    ? current
    : next;
}

function historicalReportsOf(
  value
) {
  const history =
    Array.isArray(
      value?.reportHistory
    )
      ? value.reportHistory
      : [];
  if (history.length) {
    return history;
  }

  return Array.isArray(
    value?.reports
  )
    ? value.reports
    : [];
}

function proposalDigestOf(
  report
) {
  const existing =
    String(
      report
        ?.proposalDigest || ""
    );
  if (existing) {
    return existing;
  }

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Array.isArray(
          report?.proposals
        )
          ? report.proposals
          : []
      )
    )
    .digest("hex")
    .slice(0, 16);
}

function compactHistoryReport(
  report,
  fallbackGenerationKey
) {
  const batchId =
    String(
      report?.batchId || ""
    );
  const generationKey =
    String(
      report?.generationKey ||
      fallbackGenerationKey ||
      ""
    );
  if (
    !batchId ||
    !generationKey ||
    !/^[a-zA-Z0-9._-]+$/.test(
      batchId
    )
  ) {
    return null;
  }
  const proposals =
    Array.isArray(
      report?.proposals
    )
      ? report.proposals
      : [];
  const proposalTargets =
    Array.isArray(
      report?.proposalTargets
    )
      ? report.proposalTargets
      : proposals.map(proposal => ({
          category:
            String(
              proposal?.category ||
              ""
            ),
          target:
            String(
              proposal?.target ||
              ""
            ),
          priority:
            String(
              proposal?.priority ||
              ""
            )
        }));

  return {
    batchId,
    generationKey,
    reviewNo:
      Number(report?.reviewNo || 0),
    milestone:
      Number(report?.milestone || 0),
    range:
      report?.range || null,
    proposalBasis:
      String(
        report?.proposalBasis || ""
      ),
    status:
      String(report?.status || ""),
    action:
      String(report?.action || ""),
    approvalRequired:
      report
        ?.approvalRequired === true,
    autoApply:
      report?.autoApply === true,
    applicationLock:
      report
        ?.applicationLock === true,
    decision:
      String(report?.decision || ""),
    applied:
      report?.applied === true,
    proposalCount:
      Number(
        report?.proposalCount ??
        proposals.length
      ),
    proposalTargets,
    proposalDigest:
      proposalDigestOf(report),
    archivePath:
      `${ARCHIVE_DIRECTORY}/${batchId}.json`
  };
}

function mergeReportHistory(
  previous,
  next
) {
  const merged =
    new Map();
  const append = (
    report,
    fallbackGenerationKey
  ) => {
    const batchId =
      String(
        report?.batchId || ""
      );
    const generationKey =
      String(
        report?.generationKey ||
        fallbackGenerationKey ||
        ""
      );
    if (
      !batchId ||
      !generationKey
    ) {
      return;
    }
    const key =
      JSON.stringify([
        generationKey,
        batchId
      ]);
    const compact =
      compactHistoryReport(
        report,
        generationKey
      );
    if (!compact) {
      return;
    }
    merged.set(key, compact);
  };

  historicalReportsOf(
    previous
  ).forEach(report =>
    append(
      report,
      previous
        ?.activeGenerationKey
    )
  );
  historicalReportsOf(
    next
  ).forEach(report =>
    append(
      report,
      next
        ?.activeGenerationKey
    )
  );

  return {
    ...next,
    reportHistory: [
      ...merged.values()
    ].slice(
      -improvementReview
        .MAX_HISTORY
    ),
    reportRetention: {
      ...(next
        ?.reportRetention || {}),
      history:
        "latest_generations_milestones_metadata",
      historyLatest:
        improvementReview
          .MAX_HISTORY,
      proposalArchives:
        "all_milestones_full_reports",
      retainedGenerationCount:
        new Set(
          [
            ...merged.values()
          ].map(report =>
            String(
              report
                ?.generationKey ||
              ""
            )
          ).filter(Boolean)
        ).size
    }
  };
}

function assertProposalOnly(
  value
) {
  const safety =
    value?.safety || {};
  const rootSafe =
    value?.action ===
      "proposal_only" &&
    value?.approvalRequired ===
      true &&
    value?.autoApply ===
      false &&
    value?.applicationLock ===
      true &&
    value?.decision ===
      "pending" &&
    value?.applied ===
      false;
  const safe =
    safety.action ===
      "proposal_only" &&
    safety.proposalOnly ===
      true &&
    safety.approvalRequired ===
      true &&
    safety.autoApply ===
      false &&
    safety
      .applicationLock ===
      true &&
    safety.decision ===
      "pending" &&
    safety.applied ===
      false &&
    safety
      .predictionLogicChanged ===
      false &&
    safety
      .ticketSelectionChanged ===
      false;

  if (
    !rootSafe ||
    !safe
  ) {
    throw new Error(
      "100Rレビューの提案専用ロックが不足しています"
    );
  }

  const reports =
    Array.isArray(
      value?.reports
    )
      ? value.reports
      : [];
  const batchIds =
    new Set();

  reports.forEach(report => {
    const reportSafe =
      report?.action ===
        "proposal_only" &&
      report?.approvalRequired ===
        true &&
      report?.autoApply ===
        false &&
      report?.applicationLock ===
        true &&
      report?.decision ===
        "pending" &&
      report?.applied ===
        false;

    if (!reportSafe) {
      throw new Error(
        "100Rレビュー報告の承認ロックが不足しています"
      );
    }

    const batchId =
      String(
        report?.batchId || ""
      );
    if (
      !batchId ||
      batchIds.has(batchId)
    ) {
      throw new Error(
        "100Rレビューのbatch IDが不正です"
      );
    }
    batchIds.add(batchId);

    (
      Array.isArray(
        report?.proposals
      )
        ? report.proposals
        : []
    ).forEach(proposal => {
      const proposalSafe =
        proposal?.action ===
          "proposal_only" &&
        proposal
          ?.approvalRequired ===
          true &&
        proposal?.autoApply ===
          false &&
        proposal
          ?.applicationLock ===
          true &&
        proposal?.decision ===
          "pending" &&
        proposal?.applied ===
          false;

      if (!proposalSafe) {
        throw new Error(
          "改善提案の自動適用ロックが不足しています"
        );
      }
    });
  });

  (
    Array.isArray(
      value?.reportHistory
    )
      ? value.reportHistory
      : []
  ).forEach(report => {
    const historySafe =
      Boolean(
        report?.batchId
      ) &&
      Boolean(
        report?.generationKey
      ) &&
      report?.action ===
        "proposal_only" &&
      report?.approvalRequired ===
        true &&
      report?.autoApply ===
        false &&
      report?.applicationLock ===
        true &&
      report?.applied ===
        false;
    const proposals =
      Array.isArray(
        report?.proposals
      )
        ? report.proposals
        : [];
    const proposalsSafe =
      proposals.every(
        proposal =>
          proposal?.action ===
            "proposal_only" &&
          proposal
            ?.approvalRequired ===
            true &&
          proposal?.autoApply ===
            false &&
          proposal
            ?.applicationLock ===
            true &&
          proposal?.applied ===
            false
      );

    if (
      !historySafe ||
      !proposalsSafe
    ) {
      throw new Error(
        "100Rレビュー履歴の承認ロックが不足しています"
      );
    }
  });

  return value;
}

function buildFromDirectory(
  options = {}
) {
  const inputDirectory =
    path.resolve(
      options.inputDirectory ||
      path.join(
        process.cwd(),
        "data",
        "predictions"
      )
    );
  const outputPath =
    path.resolve(
      options.outputPath ||
      path.join(
        inputDirectory,
        DEFAULT_OUTPUT_NAME
      )
    );
  const collected =
    collectPredictionRecords(
      inputDirectory
    );
  const latestSelectorSnapshot =
    collected
      .shadowSnapshots
      .filter(
        snapshot =>
          String(
            snapshot
              ?.cohortKey || ""
          )
      )
      .sort(
        (left, right) =>
          shadowTimestamp(right) -
          shadowTimestamp(left)
      )[0] ||
    null;
  const builtWithArchives =
    improvementReview
      .buildImprovementReview(
        collected.records,
        {
          activeGeneration:
            options
              .activeGeneration ||
            calibration
              .DEFAULT_GENERATION,
          activeSelectorCohortKey:
            options
              .activeSelectorCohortKey ||
            latestSelectorSnapshot
              ?.cohortKey ||
            "",
          activeTheorySetFingerprint:
            options
              .activeTheorySetFingerprint ||
            practicalSelection
              .THEORY_SET_FINGERPRINT ||
            "",
          activeSelectionThreshold:
            options
              .activeSelectionThreshold ??
            charter
              ?.shadowSelectionV2
              ?.selectionThreshold,
          generatedAt:
            options.generatedAt ||
            new Date()
              .toISOString(),
          includeArchiveReports:
            true
        }
      );
  const archiveReports =
    Array.isArray(
      builtWithArchives
        ?.archiveReports
    )
      ? builtWithArchives
          .archiveReports
      : [];
  const {
    archiveReports:
      _archiveReports,
    ...built
  } = builtWithArchives;
  let previous = null;
  if (
    fs.existsSync(
      outputPath
    )
  ) {
    try {
      previous =
        readJson(outputPath);
    } catch (_) {
      previous = null;
    }
  }
  const archiveCandidates =
    new Map();
  const collectArchive = (
    report,
    fallbackGenerationKey
  ) => {
    if (
      !Array.isArray(
        report?.proposals
      )
    ) {
      return;
    }
    const compact =
      compactHistoryReport(
        report,
        fallbackGenerationKey
      );
    if (!compact) {
      return;
    }
    archiveCandidates.set(
      JSON.stringify([
        compact.generationKey,
        compact.batchId
      ]),
      {
        report,
        history: compact
      }
    );
  };
  (
    Array.isArray(
      previous?.reportHistory
    )
      ? previous.reportHistory
      : []
  ).forEach(report =>
    collectArchive(
      report,
      previous
        ?.activeGenerationKey
    )
  );
  (
    Array.isArray(
      previous?.reports
    )
      ? previous.reports
      : []
  ).forEach(report =>
    collectArchive(
      report,
      previous
        ?.activeGenerationKey
    )
  );
  archiveReports.forEach(report =>
    collectArchive(
      report,
      built
        .activeGenerationKey
    )
  );
  const next =
    assertProposalOnly(
      mergeReportHistory(
        previous,
        {
          ...built,
          source: {
            ...(built.source || {}),
            fileCount:
              collected.files.length
          }
        }
      )
    );
  const result =
    preserveGeneratedAtWhenUnchanged(
      outputPath,
      next
    );
  const outputBytes =
    Buffer.byteLength(
      JSON.stringify(result) +
      "\n",
      "utf8"
    );
  if (
    outputBytes >=
    REVIEW_OUTPUT_LIMIT
  ) {
    throw new Error(
      `100R精度検証JSONが${REVIEW_OUTPUT_LIMIT}バイト制限を超えています：${outputBytes}`
    );
  }

  writeJsonAtomic(
    outputPath,
    result
  );

  const archivePaths = [];
  archiveCandidates
    .forEach((candidate) => {
      assertProposalOnly({
        ...result,
        reportHistory: [],
        reports: [
          candidate.report
        ]
      });
      const archivePath =
        path.join(
          path.dirname(
            outputPath
          ),
          candidate
            .history
            .archivePath
        );
      writeJsonAtomic(
        archivePath,
        {
          schemaVersion:
            result.schemaVersion,
          target:
            result.target,
          generatedAt:
            result.generatedAt,
          action:
            "proposal_only",
          approvalRequired: true,
          autoApply: false,
          applicationLock: true,
          generationKey:
            candidate
              .history
              .generationKey,
          batchId:
            candidate
              .history
              .batchId,
          proposalDigest:
            candidate
              .history
              .proposalDigest,
          report:
            candidate.report
        }
      );
      archivePaths.push(
        archivePath
      );
    });

  return {
    inputDirectory,
    outputPath,
    files:
      collected.files,
    archivePaths,
    result
  };
}

function main() {
  const inputDirectory =
    getArgument("input-dir") ||
    path.join(
      process.cwd(),
      "data",
      "predictions"
    );
  const outputPath =
    getArgument("output") ||
    path.join(
      inputDirectory,
      DEFAULT_OUTPUT_NAME
    );
  const generatedAt =
    getArgument(
      "generated-at"
    ) ||
    new Date().toISOString();
  const built =
    buildFromDirectory({
      inputDirectory,
      outputPath,
      generatedAt
    });
  const source =
    built.result.source;

  console.log(
    "100R改善レビューJSONを更新：" +
    `${source.eligibleCount}/` +
    `${source.recordCount}件、` +
    `${built.result.reports.length}報告、` +
    path.relative(
      process.cwd(),
      built.outputPath
    )
  );
}

if (
  require.main === module
) {
  try {
    main();
  } catch (error) {
    console.error(
      error?.stack ||
      error?.message ||
      error
    );
    process.exitCode = 1;
  }
}

module.exports = {
  DAILY_FILE_PATTERN,
  DEFAULT_OUTPUT_NAME,
  compactVerificationDetail,
  compactResult,
  compactEvidence,
  compactShadowV2Snapshot,
  compactPredictionRecord,
  collectPredictionRecords,
  selectShadowV2Snapshot,
  preserveGeneratedAtWhenUnchanged,
  historicalReportsOf,
  mergeReportHistory,
  assertProposalOnly,
  buildFromDirectory
};
