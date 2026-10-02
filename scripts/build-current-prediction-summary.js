"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildPredictionSummary
} = require("./build-prediction-summaries");

function getArgument(
  name,
  argv = process.argv.slice(2)
) {
  const prefix = `--${name}=`;
  const argument = argv.find(value =>
    String(value || "").startsWith(prefix)
  );
  return argument
    ? String(argument).slice(prefix.length).trim()
    : "";
}

function getJstDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(now)
    .replaceAll("-", "");
}

function normalizeDate(rawDate) {
  const date = String(rawDate || "")
    .trim()
    .replaceAll("-", "")
    .replaceAll("/", "");

  if (!/^\d{8}$/.test(date)) {
    throw new Error(
      `日付はYYYYMMDD形式で指定してください：${rawDate}`
    );
  }

  return date;
}

function resolveTargetDate({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date()
} = {}) {
  return normalizeDate(
    getArgument("date", argv) ||
    env.PREDICT_DATE ||
    getJstDate(now)
  );
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function writeJson(filePath, data) {
  fs.mkdirSync(
    path.dirname(filePath),
    { recursive: true }
  );
  const payload = `${JSON.stringify(data)}\n`;
  fs.writeFileSync(
    filePath,
    payload,
    "utf8"
  );
  return Buffer.byteLength(payload);
}

function emptyPredictionDay(date) {
  return {
    schemaVersion: 3,
    date,
    updatedAt: "",
    runs: [],
    predictions: [],
    verificationPredictions: [],
    shadowV2Predictions: []
  };
}

function buildCurrentPredictionSummary({
  rootDirectory = process.cwd(),
  date = "",
  now = new Date()
} = {}) {
  const targetDate = normalizeDate(
    date || getJstDate(now)
  );
  const predictionDirectory = path.join(
    rootDirectory,
    "data",
    "predictions"
  );
  const sourcePath = path.join(
    predictionDirectory,
    `${targetDate}.json`
  );
  const outputPath = path.join(
    predictionDirectory,
    "summaries",
    `${targetDate}.json`
  );
  const sourceExists = fs.existsSync(sourcePath);
  const source = sourceExists
    ? readJson(sourcePath)
    : emptyPredictionDay(targetDate);
  const summary = buildPredictionSummary(
    source,
    targetDate
  );
  const bytes = writeJson(
    outputPath,
    summary
  );

  return {
    date: targetDate,
    sourcePath,
    outputPath,
    sourceExists,
    bytes,
    summary
  };
}

function main() {
  const result = buildCurrentPredictionSummary({
    date: resolveTargetDate()
  });
  console.log(
    `当日予想要約：${result.date}・${result.bytes} bytes` +
    (result.sourceExists
      ? ""
      : "（予想原本未生成のため空要約）")
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  getArgument,
  getJstDate,
  normalizeDate,
  resolveTargetDate,
  emptyPredictionDay,
  buildCurrentPredictionSummary
};
