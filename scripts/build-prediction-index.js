"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIMIT = 500;
const VERIFICATION_LIMIT = 1500;
const SHADOW_V2_LIMIT = 1000;

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

function compactIndexVerification(record) {
  const prediction = record?.prediction || {};
  return {
    ...record,
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
        ? prediction.practicalTickets
        : [],
      verificationEvidence:
        prediction.verificationEvidence ||
        null,
      internalEvaluation:
        prediction.internalEvaluation ||
        null,
      preRaceConditions: prediction.preRaceConditions || null
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
    verificationMode:
      String(
        record?.verificationMode ||
        "shadow_v2"
      ),
    capturedAt:
      String(record?.capturedAt || ""),
    deadlineAt:
      String(record?.deadlineAt || ""),
    timing: record?.timing || null,
    status:
      String(record?.status || ""),
    complete:
      record?.complete === true,
    calibrationEligible:
      record?.calibrationEligible === true,
    readiness: record?.readiness || null,
    availability:
      record?.availability || null,
    missingReasonCodes:
      Array.isArray(
        record?.missingReasonCodes
      )
        ? record.missingReasonCodes
        : [],
    eligibilityReasonCodes:
      Array.isArray(
        record?.eligibilityReasonCodes
      )
        ? record.eligibilityReasonCodes
        : [],
    profile: record?.profile || null,
    evaluation: {
      totalScore:
        evaluation?.totalScore ?? null,
      priority:
        Array.isArray(evaluation?.priority)
          ? evaluation.priority
          : [],
      axisBoatNo:
        Number(evaluation?.axisBoatNo || 0) ||
        null,
      scenario:
        evaluation?.scenario || null,
      components:
        (
          Array.isArray(
            evaluation?.components
          )
            ? evaluation.components
            : []
        ).map(component => ({
          key:
            String(component?.key || ""),
          label:
            String(component?.label || ""),
          score:
            component?.score ?? null,
          source:
            String(component?.source || ""),
          focusBoatNo:
            Number(
              component?.focusBoatNo || 0
            ) || null,
          focusBoatNos:
            component?.focusBoatNos || null,
          formal:
            component?.formal === true,
          weight:
            Number(component?.weight || 0),
          contribution:
            component?.contribution ?? null
        }))
    },
    versions: record?.versions || null,
    cohortKey:
      String(record?.cohortKey || ""),
    selectionReference:
      record?.selectionReference || null,
    officialResultUsedForEvaluation:
      record
        ?.officialResultUsedForEvaluation ===
      true
  };
}

function buildPredictionIndex(directory, limit = DEFAULT_LIMIT) {
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory)
        .filter(name => /^\d{8}\.json$/.test(name))
        .sort()
    : [];

  const runs = [];
  const predictions = [];
  const verificationPredictions = [];
  const shadowV2Predictions = [];

  files.forEach(name => {
    const data = readJson(path.join(directory, name));
    const date = String(data?.date || name.slice(0, 8));

    (Array.isArray(data?.runs) ? data.runs : []).forEach(run => {
      runs.push({
        date,
        runKey: run?.runKey || "",
        checkedAt: run?.checkedAt || "",
        threshold: Number(run?.threshold || 0),
        selected: Boolean(run?.selected),
        collectionHealth: run?.collectionHealth || null,
        best: run?.best
          ? {
              jcd: run.best.jcd || "",
              place: run.best.place || "",
              raceNo: Number(run.best.raceNo || 0),
              type: run.best.type || "",
              score: Number(run.best.score || 0)
            }
          : null
      });
    });

    (Array.isArray(data?.predictions) ? data.predictions : []).forEach(prediction => {
      predictions.push({ ...prediction, date: String(prediction?.date || date) });
    });

    (Array.isArray(data?.verificationPredictions)
      ? data.verificationPredictions
      : []).forEach(prediction => {
      verificationPredictions.push(compactIndexVerification({
        ...prediction,
        date: String(prediction?.date || date)
      }));
    });

    (Array.isArray(data?.shadowV2Predictions)
      ? data.shadowV2Predictions
      : []).forEach(prediction => {
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
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    runs: runs.slice(0, limit),
    predictions: predictions.slice(0, limit),
    verificationPredictions: verificationPredictions.slice(
      0,
      Math.max(limit, VERIFICATION_LIMIT)
    ),
    shadowV2Predictions:
      shadowV2Predictions.slice(
        0,
        Math.max(limit, SHADOW_V2_LIMIT)
      )
  };
}

function writePredictionIndex(directory, outputPath) {
  const index = buildPredictionIndex(directory);
  if (fs.existsSync(outputPath)) {
    const existing = readJson(outputPath);
    const comparable = value => JSON.stringify({ ...value, generatedAt: "" });
    if (comparable(existing) === comparable(index)) return existing;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2) + "\n", "utf8");
  return index;
}

function main() {
  const directory = path.join(process.cwd(), "data", "predictions");
  const outputPath = path.join(directory, "index.json");
  const index = writePredictionIndex(directory, outputPath);
  console.log(
    `自動予想索引を更新：採用${index.predictions.length}件／検証${index.verificationPredictions.length}件／` +
    `V2シャドー${index.shadowV2Predictions.length}件／実行${index.runs.length}件`
  );
}

if (require.main === module) main();

module.exports = {
  buildPredictionIndex,
  compactIndexVerification,
  compactShadowV2,
  writePredictionIndex
};
