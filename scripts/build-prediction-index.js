"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIMIT = 500;
const VERIFICATION_LIMIT = 1500;

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
      preRaceConditions: prediction.preRaceConditions || null
    }
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
  });

  runs.sort((a, b) => String(b?.checkedAt || "").localeCompare(String(a?.checkedAt || "")));
  predictions.sort((a, b) => String(b?.selectedAt || "").localeCompare(String(a?.selectedAt || "")));
  verificationPredictions.sort((a, b) =>
    String(b?.selectedAt || "").localeCompare(String(a?.selectedAt || ""))
  );

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    runs: runs.slice(0, limit),
    predictions: predictions.slice(0, limit),
    verificationPredictions: verificationPredictions.slice(
      0,
      Math.max(limit, VERIFICATION_LIMIT)
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
    `自動予想索引を更新：採用${index.predictions.length}件／検証${index.verificationPredictions.length}件／実行${index.runs.length}件`
  );
}

if (require.main === module) main();

module.exports = {
  buildPredictionIndex,
  compactIndexVerification,
  writePredictionIndex
};
