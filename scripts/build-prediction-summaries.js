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

function latest(items, key) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    String(b?.[key] || "").localeCompare(String(a?.[key] || ""))
  )[0] || null;
}

function compactReasons(reasons, limit) {
  return (
    Array.isArray(reasons)
      ? reasons
      : []
  )
    .slice(0, limit)
    .map(reason => String(reason || ""))
    .filter(Boolean);
}

function compactTrendSide(side, reasonLimit) {
  if (!side || typeof side !== "object") return null;
  return {
    score: Number(side.score || 0),
    level: String(side.level || ""),
    reasons: compactReasons(
      side.reasons,
      reasonLimit
    )
  };
}

function compactDataStatus(status) {
  if (!status || typeof status !== "object") return null;
  return {
    stage: String(status.stage || ""),
    label: String(status.label || ""),
    completeness: Number(status.completeness || 0)
  };
}

function compactEvaluation(
  evaluation,
  reasonLimit = 1
) {
  if (!evaluation || typeof evaluation !== "object") return null;
  return {
    ready: evaluation.ready === true,
    honmei: compactTrendSide(
      evaluation.honmei,
      reasonLimit
    ),
    manshu: compactTrendSide(
      evaluation.manshu,
      reasonLimit
    ),
    dataStatus: compactDataStatus(
      evaluation.dataStatus
    )
  };
}

function compactCompared(
  item,
  { reasonLimit = 1 } = {}
) {
  return {
    jcd: String(item?.jcd || ""),
    place: String(item?.place || ""),
    raceNo: Number(item?.raceNo || 0),
    deadlineAt: String(item?.deadlineAt || ""),
    type: String(item?.type || ""),
    score: Number(item?.score || 0),
    scoreSource: String(item?.scoreSource || ""),
    scenarioLabel: String(item?.scenarioLabel || ""),
    selectionReady:
      item?.selectionReady === true,
    selectionStatus: String(
      item?.selectionStatus || ""
    ),
    legacyType: String(item?.legacyType || ""),
    legacyScore: Number(
      item?.legacyScore || 0
    ),
    historySupport: Number(item?.historySupport || 0),
    evaluation: compactEvaluation(
      item?.evaluation,
      reasonLimit
    )
  };
}

function compactCollectionHealth(health) {
  if (!health || typeof health !== "object") return null;
  const v2 = health.v2 && typeof health.v2 === "object"
    ? health.v2
    : {};
  return {
    checkedAt: String(health.checkedAt || ""),
    targetCount: Number(health.targetCount || 0),
    savedCount: Number(health.savedCount || 0),
    insufficientDataCount: Number(
      health.insufficientDataCount || 0
    ),
    invalidBoatIdentityCount: Number(
      health.invalidBoatIdentityCount || 0
    ),
    failedCount: Number(health.failedCount || 0),
    recoveredCount: Number(health.recoveredCount || 0),
    finalUncollectedCount: Number(
      health.finalUncollectedCount || 0
    ),
    complete: health.complete === true,
    v2: {
      evaluatedCount: Number(v2.evaluatedCount || 0),
      readyCount: Number(v2.readyCount || 0),
      qualifiedCount: Number(v2.qualifiedCount || 0),
      selectedCount: Number(v2.selectedCount || 0),
      belowThresholdCount: Number(
        v2.belowThresholdCount || 0
      ),
      notReadyCount: Number(v2.notReadyCount || 0),
      readinessRate: Number(v2.readinessRate || 0),
      missingReasons: (
        Array.isArray(v2.missingReasons)
          ? v2.missingReasons
          : []
      )
        .slice(0, 20)
        .map(item => ({
          code: String(item?.code || ""),
          label: String(item?.label || ""),
          count: Number(item?.count || 0)
        }))
        .filter(item => item.code)
    }
  };
}

function compactRun(
  run,
  {
    date = "",
    quarantined = new Set()
  } = {}
) {
  if (!run) return null;
  return {
    runKey: String(run.runKey || ""),
    checkedAt: String(run.checkedAt || ""),
    threshold: Number(run.threshold || 70),
    selected: run.selected === true,
    collectionHealth: compactCollectionHealth(
      run.collectionHealth
    ),
    best: run.best
      ? compactCompared(
          run.best,
          { reasonLimit: 4 }
        )
      : null,
    compared: (Array.isArray(run.compared) ? run.compared : [])
      .filter(
        item =>
          !quarantined.has(
            raceKeyOf(item, date)
          )
      )
      .slice(0, 24)
      .map(item =>
        compactCompared(
          item,
          { reasonLimit: 0 }
        )
      )
  };
}

function compactSelection(selection) {
  if (!selection || typeof selection !== "object") return null;
  return {
    evaluator: String(selection.evaluator || ""),
    label: String(selection.label || ""),
    type: String(selection.type || ""),
    scenarioLabel: String(selection.scenarioLabel || ""),
    score: Number(selection.score || 0),
    threshold: Number(selection.threshold || 70),
    ready: selection.ready === true,
    qualified: selection.qualified === true,
    selected: selection.selected === true,
    status: String(selection.status || ""),
    eligibilityReasonCodes: (
      Array.isArray(selection.eligibilityReasonCodes)
        ? selection.eligibilityReasonCodes
        : []
    )
      .slice(0, 12)
      .map(code => String(code || ""))
      .filter(Boolean)
  };
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
  const scenarioType = String(
    row.scenarioType || ""
  )
    .replace(/流し候補/g, "フォーメーション候補")
    .replace(/流し展開/g, "フォーメーション")
    .replace(/流し/g, "フォーメーション");

  return {
    ticket: String(
      row.ticket ||
      row.bet ||
      row.mark ||
      row.combination ||
      row.line ||
      row.formation ||
      ""
    ),
    category,
    displayCategory,
    scenarioType,
    amount: Number(row.amount || 0)
  };
}

function compactPrediction(prediction) {
  if (!prediction) return null;
  return {
    raceKey: String(prediction.raceKey || ""),
    date: String(prediction.date || ""),
    jcd: String(prediction.jcd || ""),
    place: String(prediction.place || ""),
    raceNo: Number(prediction.raceNo || 0),
    deadlineAt: String(prediction.deadlineAt || ""),
    selectedAt: String(prediction.selectedAt || ""),
    selection: compactSelection(
      prediction.selection
    ),
    note: prediction.note
      ? {
          path: String(prediction.note.path || ""),
          title: String(prediction.note.title || ""),
          publishable: prediction.note.publishable === true,
          rejectionReasons: Array.isArray(prediction.note.rejectionReasons)
            ? prediction.note.rejectionReasons
                .slice(0, 8)
                .map(reason => String(reason || ""))
                .filter(Boolean)
            : []
        }
      : null,
    prediction: {
      practicalTickets: Array.isArray(
        prediction?.prediction?.practicalTickets
      )
        ? prediction.prediction.practicalTickets
            .slice(0, 10)
            .map(compactPracticalTicket)
            .filter(item => item.ticket)
        : []
    }
  };
}

function buildPredictionSummary(data, fallbackDate = "") {
  const date = String(
    data?.date || fallbackDate
  );
  const quarantined =
    quarantinedRaceKeys(data, date);
  const run = latest(
    (Array.isArray(data?.runs)
      ? data.runs
      : []
    ).filter(item =>
      !quarantined.has(
        raceKeyOf(item?.best, date)
      )
    ),
    "checkedAt"
  );
  const prediction = latest(
    (Array.isArray(data?.predictions)
      ? data.predictions
      : []
    ).filter(
      item =>
        !isBoatIdentityQuarantined(
          item
        )
    ),
    "selectedAt"
  );

  return {
    schemaVersion: 1,
    date,
    updatedAt: String(
      data?.updatedAt ||
      run?.checkedAt ||
      prediction?.selectedAt ||
      ""
    ),
    runs: run
      ? [compactRun(run, {
          date,
          quarantined
        })]
      : [],
    predictions: prediction
      ? [compactPrediction(prediction)]
      : []
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(data) + "\n";
  fs.writeFileSync(
    filePath,
    payload,
    "utf8"
  );
  return Buffer.byteLength(payload);
}

function buildPredictionSummaries(
  directory,
  outputDirectory = path.join(directory, "summaries")
) {
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory)
        .filter(name => /^\d{8}\.json$/.test(name))
        .sort()
    : [];

  return files.map(name => {
    const date = name.slice(0, 8);
    const sourcePath = path.join(directory, name);
    const outputPath = path.join(outputDirectory, name);
    const summary = buildPredictionSummary(
      readJson(sourcePath),
      date
    );
    const bytes = writeJson(
      outputPath,
      summary
    );
    return {
      date,
      outputPath,
      bytes
    };
  });
}

function main() {
  const directory = path.join(
    process.cwd(),
    "data",
    "predictions"
  );
  const outputs = buildPredictionSummaries(directory);
  const totalBytes = outputs.reduce(
    (sum, item) => sum + item.bytes,
    0
  );
  console.log(
    `軽量予想要約: ${outputs.length}日分・${totalBytes} bytes`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  latest,
  compactReasons,
  compactTrendSide,
  compactDataStatus,
  compactEvaluation,
  compactCompared,
  compactCollectionHealth,
  compactRun,
  compactSelection,
  compactPracticalTicket,
  compactPrediction,
  raceKeyOf,
  quarantinedRaceKeys,
  buildPredictionSummary,
  buildPredictionSummaries
};
