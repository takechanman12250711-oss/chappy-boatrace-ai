"use strict";

const fs = require("node:fs");
const path = require("node:path");

function latest(items, key) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
    String(b?.[key] || "").localeCompare(String(a?.[key] || ""))
  )[0] || null;
}

function compactEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return null;
  return {
    ready: evaluation.ready === true,
    honmei: evaluation.honmei || null,
    manshu: evaluation.manshu || null,
    dataStatus: evaluation.dataStatus || null
  };
}

function compactCompared(item) {
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
    evaluation: compactEvaluation(item?.evaluation)
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

function compactRun(run) {
  if (!run) return null;
  return {
    runKey: String(run.runKey || ""),
    checkedAt: String(run.checkedAt || ""),
    threshold: Number(run.threshold || 70),
    selected: run.selected === true,
    collectionHealth: compactCollectionHealth(
      run.collectionHealth
    ),
    best: run.best ? compactCompared(run.best) : null,
    compared: (Array.isArray(run.compared) ? run.compared : [])
      .map(compactCompared)
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
    selection: prediction.selection || null,
    note: prediction.note
      ? {
          path: String(prediction.note.path || ""),
          title: String(prediction.note.title || ""),
          publishable: prediction.note.publishable === true,
          rejectionReasons: Array.isArray(prediction.note.rejectionReasons)
            ? prediction.note.rejectionReasons
            : []
        }
      : null,
    prediction: {
      practicalTickets: Array.isArray(
        prediction?.prediction?.practicalTickets
      )
        ? prediction.prediction.practicalTickets.slice(0, 10)
        : []
    }
  };
}

function buildPredictionSummary(data, fallbackDate = "") {
  const run = latest(data?.runs, "checkedAt");
  const prediction = latest(data?.predictions, "selectedAt");

  return {
    schemaVersion: 1,
    date: String(data?.date || fallbackDate),
    updatedAt: String(
      data?.updatedAt ||
      run?.checkedAt ||
      prediction?.selectedAt ||
      ""
    ),
    runs: run ? [compactRun(run)] : [],
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
  compactEvaluation,
  compactCompared,
  compactCollectionHealth,
  compactRun,
  compactPrediction,
  buildPredictionSummary,
  buildPredictionSummaries
};
