"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIMIT = 500;
const DEFAULT_VERIFICATION_LIMIT = 1500;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildPredictionIndex(directory, limit = DEFAULT_LIMIT) {
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory)
        .filter(name => /^\d{8}\.json$/.test(name))
        .sort()
    : [];

  const runs = [];
  const predictions = [];
  const candidatePredictions = [];
  const shadowPredictions = [];

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
    (Array.isArray(data?.candidatePredictions) ? data.candidatePredictions : [])
      .forEach(prediction => {
        candidatePredictions.push({
          ...prediction,
          date: String(prediction?.date || date)
        });
      });
    (Array.isArray(data?.shadowPredictions) ? data.shadowPredictions : [])
      .forEach(prediction => {
        shadowPredictions.push({
          ...prediction,
          date: String(prediction?.date || date)
        });
      });
  });

  runs.sort((a, b) => String(b?.checkedAt || "").localeCompare(String(a?.checkedAt || "")));
  predictions.sort((a, b) => String(b?.selectedAt || "").localeCompare(String(a?.selectedAt || "")));
  const sortCaptured = (a, b) =>
    String(b?.capturedAt || "").localeCompare(String(a?.capturedAt || ""));
  candidatePredictions.sort(sortCaptured);
  shadowPredictions.sort(sortCaptured);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    runs: runs.slice(0, limit),
    predictions: predictions.slice(0, limit),
    candidatePredictions: candidatePredictions.slice(0, DEFAULT_VERIFICATION_LIMIT),
    shadowPredictions: shadowPredictions.slice(0, DEFAULT_VERIFICATION_LIMIT)
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
    `自動予想索引を更新：採用${index.predictions.length}件／` +
    `候補検証${index.candidatePredictions.length}件／` +
    `シャドー${index.shadowPredictions.length}件／実行${index.runs.length}件`
  );
}

if (require.main === module) main();

module.exports = { buildPredictionIndex, writePredictionIndex };
