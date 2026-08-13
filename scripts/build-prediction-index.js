"use strict";

const fs = require("node:fs");
const path = require("node:path");
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

function raceKeyOf(value, fallbackDate = "") {
  const direct = String(
    value?.raceKey || ""
  ).trim();
  if (direct) return direct;

  const date = String(
    value?.date || fallbackDate || ""
  ).trim();
  const jcd = String(
    value?.jcd || ""
  ).padStart(2, "0");
  const raceNo = Number(
    value?.raceNo || 0
  );

  return date && jcd !== "00" && raceNo
    ? `${date}-${jcd}-${raceNo}`
    : "";
}

function quarantinedRaceKeys(
  data,
  fallbackDate = ""
) {
  const keys = new Set();
  [
    data?.predictions,
    data?.verificationPredictions,
    data?.shadowV2Predictions
  ].forEach(source => {
    (Array.isArray(source) ? source : [])
      .filter(isBoatIdentityQuarantined)
      .forEach(record => {
        const raceKey = raceKeyOf(
          record,
          fallbackDate
        );
        if (raceKey) keys.add(raceKey);
      });
  });
  return keys;
}

/*
  index.json は結果画面の初期表示用キャッシュで、完全履歴の正本ではない。
  完全な予想・結果・検証根拠は日次JSONへ残し、初期表示には直近分だけを載せる。

  1件の検証レコードは結果確定後に着順・ST明細が増えるため、件数上限を
  分けないと、正常な結果収集だけで3MBの配信上限を超えて保存処理が止まる。
*/
const RUN_LIMIT = 100;
const PREDICTION_LIMIT = 100;
const VERIFICATION_LIMIT = 300;
const SHADOW_V2_LIMIT = 600;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function compactMark(value) {
  if (!value || typeof value !== "object") return null;
  return {
    boatNo: Number(value.boatNo || value.no || value.boat || 0),
    name: String(value.name || value.playerName || "")
  };
}

function compactCollectionTarget(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    raceKey:
      String(value.raceKey || ""),
    jcd:
      String(value.jcd || ""),
    place:
      String(value.place || ""),
    status:
      String(value.status || ""),
    missingReasons:
      Array.isArray(
        value.missingReasons
      )
        ? value.missingReasons
            .map(String)
        : [],
    recoveryState:
      String(
        value.recoveryState || ""
      )
  };
}

function compactCollectionHealth(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const numericKeys = [
    "targetCount",
    "savedCount",
    "insufficientDataCount",
    "invalidBoatIdentityCount",
    "failedCount",
    "recoveredCount",
    "retryingCount",
    "finalUncollectedCount"
  ];
  const compact = {
    checkedAt:
      String(value.checkedAt || ""),
    complete:
      value.complete === true,
    v2:
      value.v2 &&
      typeof value.v2 === "object"
        ? {
            evaluatedCount:
              Number(
                value.v2
                  .evaluatedCount || 0
              ),
            readyCount:
              Number(
                value.v2
                  .readyCount || 0
              ),
            qualifiedCount:
              Number(
                value.v2
                  .qualifiedCount || 0
              ),
            selectedCount:
              Number(
                value.v2
                  .selectedCount || 0
              ),
            belowThresholdCount:
              Number(
                value.v2
                  .belowThresholdCount || 0
              ),
            notReadyCount:
              Number(
                value.v2
                  .notReadyCount || 0
              ),
            readinessRate:
              Number(
                value.v2
                  .readinessRate || 0
              ),
            missingReasons:
              Array.isArray(
                value.v2
                  .missingReasons
              )
                ? value.v2
                    .missingReasons
                    .map(reason => ({
                      code:
                        String(
                          reason?.code || ""
                        ),
                      label:
                        String(
                          reason?.label || ""
                        ),
                      count:
                        Number(
                          reason?.count || 0
                        )
                    }))
                : []
          }
        : null,
    targets:
      (
        Array.isArray(value.targets)
          ? value.targets
          : []
      )
        .map(
          compactCollectionTarget
        )
        .filter(Boolean)
  };

  numericKeys.forEach(key => {
    compact[key] =
      Number(value[key] || 0);
  });

  return compact;
}

function compactRun(date, run) {
  return {
    date,
    runKey:
      String(run?.runKey || ""),
    checkedAt:
      String(run?.checkedAt || ""),
    threshold:
      Number(run?.threshold || 0),
    selected:
      run?.selected === true,
    collectionHealth:
      compactCollectionHealth(
        run?.collectionHealth
      ),
    best: run?.best
      ? {
          jcd:
            String(run.best.jcd || ""),
          place:
            String(run.best.place || ""),
          raceNo:
            Number(run.best.raceNo || 0),
          type:
            String(run.best.type || ""),
          score:
            Number(run.best.score || 0)
        }
      : null
  };
}

function compactSelection(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    evaluator:
      String(value.evaluator || ""),
    label:
      String(value.label || ""),
    type:
      String(value.type || ""),
    scenarioLabel:
      String(
        value.scenarioLabel || ""
      ),
    score:
      value.score ?? null,
    threshold:
      Number(value.threshold || 0),
    ready:
      value.ready === true,
    qualified:
      value.qualified === true,
    selected:
      value.selected === true,
    status:
      String(value.status || ""),
    eligibilityReasonCodes:
      Array.isArray(
        value
          .eligibilityReasonCodes
      )
        ? value
            .eligibilityReasonCodes
        : []
  };
}

function compactRoleClaim(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    role:
      String(value.role || ""),
    boatNo:
      Number(value.boatNo || 0),
    expectedPositions:
      Array.isArray(
        value.expectedPositions
      )
        ? value.expectedPositions
            .map(Number)
        : []
  };
}

function compactTheoryClaim(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    theoryKey:
      String(
        value.theoryKey ||
        value.key ||
        ""
      ),
    label:
      String(
        value.label ||
        value.theoryLabel ||
        ""
      ),
    theoryVersion:
      String(
        value.theoryVersion ||
        value.version ||
        ""
      ),
    formal:
      value.formal === true,
    source:
      String(value.source || "")
  };
}

function compactClaims(
  values,
  mapper
) {
  return (
    Array.isArray(values)
      ? values
      : []
  )
    .map(mapper)
    .filter(Boolean);
}

function compactPracticalTicket(value) {
  const row =
    typeof value === "string"
      ? { ticket: value }
      : value || {};

  const category =
    String(row.category || "");
  const displayCategory =
    [
      "順位ゲート補完",
      "候補補完",
      "独立展開"
    ].includes(category)
      ? category
      : category === "流し"
        ? "フォーメーション"
        : String(
            row.displayCategory ||
            category ||
            ""
          ).replace(
            /^流し$/,
            "フォーメーション"
          );

  return {
    ticket:
      String(
        row.ticket ||
        row.line ||
        row.formation ||
        ""
      ),
    category,
    displayCategory,
    role:
      String(row.role || ""),
    categories:
      Array.isArray(row.categories)
        ? row.categories
        : [],
    selectionTier:
      String(
        row.selectionTier || ""
      ),
    roleClaims:
      compactClaims(
        row.roleClaims,
        compactRoleClaim
      ),
    theoryClaims:
      compactClaims(
        row.theoryClaims,
        compactTheoryClaim
      )
  };
}

function compactVerificationEvidence(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    roleSchemaVersion:
      Number(
        value.roleSchemaVersion || 0
      ),
    theorySchemaVersion:
      Number(
        value.theorySchemaVersion ||
        0
      ),
    theorySetFingerprint:
      String(
        value.theorySetFingerprint ||
        ""
      ),
    generation:
      value.generation || null,
    mainScenario:
      value.mainScenario || null,
    roleClaims:
      compactClaims(
        value.roleClaims,
        compactRoleClaim
      ),
    theoryClaims:
      compactClaims(
        value.theoryClaims,
        compactTheoryClaim
      ),
    tickets:
      (
        Array.isArray(
          value.tickets
        )
          ? value.tickets
          : []
      ).map(
        compactPracticalTicket
      )
  };
}

function compactPreRaceConditions(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const weather =
    value.weather || {};

  return {
    schemaVersion:
      Number(
        value.schemaVersion || 0
      ),
    sourceTiming:
      value.sourceTiming || null,
    officialResultUsed:
      value.officialResultUsed ===
        true,
    newEngineMode:
      value.newEngineMode === true,
    weather: {
      windSpeed:
        weather.windSpeed ?? null,
      waveHeight:
        weather.waveHeight ?? null,
      venueTideInfluence:
        weather
          .venueTideInfluence ??
        null
    },
    boats:
      (
        Array.isArray(value.boats)
          ? value.boats
          : []
      ).map(boat => ({
        boatNo:
          Number(boat?.boatNo || 0),
        exhibitionST:
          boat?.exhibitionST ?? null,
        currentST:
          boat?.currentST ?? null,
        avgST:
          boat?.avgST ?? null,
        exhibitionTime:
          boat?.exhibitionTime ?? null,
        className:
          String(
            boat?.className || ""
          ),
        nationalWinRate:
          boat?.nationalWinRate ??
          null,
        motor2Rate:
          boat?.motor2Rate ?? null
      }))
  };
}

function compactResult(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const verification =
    value.verification || value;
  const supportIdentity =
    verification
      ?.supportIdentity ||
    value?.supportIdentity ||
    null;

  return {
    schemaVersion:
      Number(
        verification
          ?.schemaVersion ||
        value?.schemaVersion ||
        0
      ),
    settled:
      value.settled === true,
    resultTicket:
      String(
        value.resultTicket || ""
      ),
    winningMethod:
      String(
        value.winningMethod || ""
      ),
    payout:
      Number(value.payout || 0),
    popularity:
      Number(
        value.popularity || 0
      ),
    finishers:
      (
        Array.isArray(value.finishers)
          ? value.finishers
          : []
      ).map(row => ({
        rank:
          Number(row?.rank || 0),
        boat:
          Number(
            row?.boat ||
            row?.boatNo ||
            0
          )
      })),
    starts:
      (
        Array.isArray(value.starts)
          ? value.starts
          : []
      ).map(row => ({
        course:
          Number(row?.course || 0),
        boat:
          Number(
            row?.boat ||
            row?.boatNo ||
            0
          ),
        st:
          row?.st !== null &&
          row?.st !== undefined &&
          row?.st !== "" &&
          Number.isFinite(Number(row.st))
            ? Number(row.st)
            : null,
        falseStart:
          row?.falseStart === true,
        lateStart:
          row?.lateStart === true
      })),
    settledAt:
      String(value.settledAt || ""),
    supportIdentity:
      supportIdentity
        ? {
            roleSchemaVersion:
              Number(
                supportIdentity
                  .roleSchemaVersion ||
                0
              ),
            theorySchemaVersion:
              Number(
                supportIdentity
                  .theorySchemaVersion ||
                0
              ),
            theorySetFingerprint:
              String(
                supportIdentity
                  .theorySetFingerprint ||
                ""
              ),
            generation:
              supportIdentity
                .generation ||
              null,
            evaluator:
              String(
                supportIdentity
                  .evaluator ||
                ""
              ),
            evaluatorVersion:
              String(
                supportIdentity
                  .evaluatorVersion ||
                ""
              ),
            selectorCohortKey:
              String(
                supportIdentity
                  .selectorCohortKey ||
                ""
              ),
            logicFingerprint:
              String(
                supportIdentity
                  .logicFingerprint ||
                ""
              ),
            theoryInputVersion:
              String(
                supportIdentity
                  .theoryInputVersion ||
                ""
              )
          }
        : null,
    verificationInputFingerprint:
      String(
        verification
          ?.verificationInputFingerprint ||
        value
          ?.verificationInputFingerprint ||
        ""
      ),
    scenarioVerification:
      verification
        ?.scenarioVerification ||
      null
  };
}

function compactInternalEvaluation(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    mode:
      String(value.mode || ""),
    label:
      String(value.label || ""),
    score:
      value.score ?? null,
    probability:
      value.probability === true
  };
}

function compactShadowV2Reference(
  value
) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    recordKey:
      String(value.recordKey || ""),
    cohortKey:
      String(value.cohortKey || ""),
    evaluatorVersion:
      String(
        value.evaluatorVersion || ""
      ),
    logicFingerprint:
      String(
        value.logicFingerprint || ""
      ),
    theoryInputVersion:
      String(
        value.theoryInputVersion || ""
      )
  };
}

function compactIndexVerification(record) {
  const prediction = record?.prediction || {};
  return {
    raceKey:
      String(record?.raceKey || ""),
    date:
      String(record?.date || ""),
    jcd:
      String(record?.jcd || ""),
    place:
      String(record?.place || ""),
    raceNo:
      Number(record?.raceNo || 0),
    deadlineAt:
      String(
        record?.deadlineAt || ""
      ),
    selectedAt:
      String(
        record?.selectedAt || ""
      ),
    capturedAt:
      String(
        record?.capturedAt || ""
      ),
    verificationMode:
      String(
        record
          ?.verificationMode || ""
      ),
    scoreBand:
      String(
        record?.scoreBand || ""
      ),
    isRetrospective:
      record?.isRetrospective ===
        true,
    officialResultUsedForEvaluation:
      record
        ?.officialResultUsedForEvaluation ===
      true,
    complete:
      record?.complete === true,
    calibrationEligible:
      record?.calibrationEligible ===
        true,
    timing:
      record?.timing || null,
    selection:
      compactSelection(
        record?.selection
      ),
    shadowV2Reference:
      compactShadowV2Reference(
        record
          ?.shadowV2Reference
      ),
    result:
      compactResult(
        record?.result
      ),
    prediction: {
      version: prediction.version || "",
      predictionMode: prediction.predictionMode || "server_pre_deadline_shadow",
      raceFlow: {
        title: prediction?.raceFlow?.title || "",
        summary: prediction?.raceFlow?.summary || "",
        scenario: prediction?.raceFlow?.scenario?.title
          ? { title: prediction.raceFlow.scenario.title }
          : null
      },
      confidence: prediction.confidence || null,
      manshuPower: prediction.manshuPower || null,
      mainSheet: {
        honmei: compactMark(prediction?.mainSheet?.honmei),
        taikou: compactMark(prediction?.mainSheet?.taikou),
        ana: compactMark(prediction?.mainSheet?.ana),
        osae: compactMark(prediction?.mainSheet?.osae)
      },
      practicalTickets: Array.isArray(prediction.practicalTickets)
        ? prediction
            .practicalTickets
            .map(
              compactPracticalTicket
            )
        : [],
      verificationEvidence:
        compactVerificationEvidence(
          prediction
            .verificationEvidence
        ),
      internalEvaluation:
        compactInternalEvaluation(
          prediction
            .internalEvaluation
        ),
      preRaceConditions:
        compactPreRaceConditions(
          prediction
            .preRaceConditions
        ),
      isRetrospective:
        prediction
          .isRetrospective === true
    }
  };
}

function compactShadowV2(record) {
  const evaluation =
    record?.evaluation || {};

  return {
    schemaVersion:
      Number(record?.schemaVersion || 0),
    evaluatorVersion:
      String(record?.evaluatorVersion || ""),
    recordKey:
      String(record?.recordKey || ""),
    raceKey:
      String(record?.raceKey || ""),
    date:
      String(record?.date || ""),
    jcd:
      String(record?.jcd || ""),
    place:
      String(record?.place || ""),
    raceNo:
      Number(record?.raceNo || 0),
    capturedAt:
      String(record?.capturedAt || ""),
    complete:
      record?.complete === true,
    calibrationEligible:
      record?.calibrationEligible === true,
    readiness:
      record?.readiness &&
      typeof record.readiness ===
        "object"
        ? {
            allComponentsFormal:
              record.readiness
                .allComponentsFormal ===
              true
          }
        : null,
    evaluation: {
      totalScore:
        evaluation?.totalScore ?? null
    },
    versions:
      record?.versions &&
      typeof record.versions ===
        "object"
        ? {
            logicFingerprint:
              String(
                record.versions
                  .logicFingerprint || ""
              )
          }
        : null,
    cohortKey:
      String(record?.cohortKey || ""),
    officialResultUsedForEvaluation:
      record
        ?.officialResultUsedForEvaluation ===
      true
  };
}

function buildPredictionIndex(directory) {
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory)
        .filter(name => /^\d{8}\.json$/.test(name))
        .sort()
    : [];

  const runs = [];
  const predictions = [];
  const verificationPredictions = [];
  const shadowV2Predictions = [];
  const quarantinedRecordCounts = {
    predictions: 0,
    verificationPredictions: 0,
    shadowV2Predictions: 0
  };

  files.forEach(name => {
    const data = readJson(path.join(directory, name));
    const date = String(data?.date || name.slice(0, 8));
    const quarantined =
      quarantinedRaceKeys(data, date);

    (Array.isArray(data?.runs) ? data.runs : []).forEach(run => {
      if (
        quarantined.has(
          raceKeyOf(run?.best, date)
        )
      ) {
        return;
      }
      runs.push(
        compactRun(date, run)
      );
    });

    (Array.isArray(data?.predictions) ? data.predictions : []).forEach(prediction => {
      if (
        isBoatIdentityQuarantined(
          prediction
        )
      ) {
        quarantinedRecordCounts
          .predictions += 1;
        return;
      }
      predictions.push(
        compactIndexVerification({
          ...prediction,
          date:
            String(
              prediction?.date ||
              date
            )
        })
      );
    });

    (Array.isArray(data?.verificationPredictions)
      ? data.verificationPredictions
      : []).forEach(prediction => {
      if (
        isBoatIdentityQuarantined(
          prediction
        )
      ) {
        quarantinedRecordCounts
          .verificationPredictions += 1;
        return;
      }
      verificationPredictions.push(compactIndexVerification({
        ...prediction,
        date: String(prediction?.date || date)
      }));
    });

    (Array.isArray(data?.shadowV2Predictions)
      ? data.shadowV2Predictions
      : []).forEach(prediction => {
      if (
        isBoatIdentityQuarantined(
          prediction
        )
      ) {
        quarantinedRecordCounts
          .shadowV2Predictions += 1;
        return;
      }
      shadowV2Predictions.push(
        compactShadowV2({
        ...prediction,
        date: String(prediction?.date || date)
        })
      );
    });
  });

  runs.sort((a, b) => String(b?.checkedAt || "").localeCompare(String(a?.checkedAt || "")));
  predictions.sort((a, b) => String(b?.selectedAt || "").localeCompare(String(a?.selectedAt || "")));
  verificationPredictions.sort((a, b) =>
    String(b?.selectedAt || "").localeCompare(String(a?.selectedAt || ""))
  );
  shadowV2Predictions.sort((a, b) =>
    String(b?.capturedAt || "").localeCompare(String(a?.capturedAt || ""))
  );

  return {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    sourceRecordCounts: {
      runs: runs.length,
      predictions:
        predictions.length,
      verificationPredictions:
        verificationPredictions.length,
      shadowV2Predictions:
        shadowV2Predictions.length
    },
    quarantinedRecordCounts,
    retentionLimits: {
      runs: RUN_LIMIT,
      predictions:
        PREDICTION_LIMIT,
      verificationPredictions:
        VERIFICATION_LIMIT,
      shadowV2Predictions:
        SHADOW_V2_LIMIT
    },
    runs:
      runs.slice(0, RUN_LIMIT),
    predictions:
      predictions.slice(
        0,
        PREDICTION_LIMIT
      ),
    verificationPredictions:
      verificationPredictions.slice(
        0,
        VERIFICATION_LIMIT
      ),
    shadowV2Predictions:
      shadowV2Predictions.slice(
        0,
        SHADOW_V2_LIMIT
      )
  };
}

function writePredictionIndex(directory, outputPath) {
  const frozenLegacyPath = path.resolve(
    __dirname,
    "..",
    "data",
    "predictions",
    "index.json"
  );
  if (
    path.resolve(outputPath) ===
    frozenLegacyPath
  ) {
    throw new Error(
      "legacy indexはfallback用に凍結済みです"
    );
  }
  const index = buildPredictionIndex(directory);
  if (fs.existsSync(outputPath)) {
    const existing = readJson(outputPath);
    const comparable = value => JSON.stringify({ ...value, generatedAt: "" });
    if (comparable(existing) === comparable(index)) return existing;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(index) + "\n",
    "utf8"
  );
  return index;
}

function main() {
  throw new Error(
    "legacy indexはfallback用に凍結済みです。" +
    "scripts/build-prediction-index-shards.js を実行してください"
  );
}

if (require.main === module) main();

module.exports = {
  RUN_LIMIT,
  PREDICTION_LIMIT,
  VERIFICATION_LIMIT,
  SHADOW_V2_LIMIT,
  buildPredictionIndex,
  raceKeyOf,
  quarantinedRaceKeys,
  compactCollectionTarget,
  compactCollectionHealth,
  compactRun,
  compactSelection,
  compactPracticalTicket,
  compactVerificationEvidence,
  compactPreRaceConditions,
  compactResult,
  compactShadowV2Reference,
  compactIndexVerification,
  compactShadowV2,
  writePredictionIndex
};
