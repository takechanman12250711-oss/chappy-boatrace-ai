"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "data", "predictions", "index.json");

if (!fs.existsSync(indexPath)) {
  throw new Error("data/predictions/index.json がありません");
}

const raw = fs.readFileSync(indexPath, "utf8");
const parsed = JSON.parse(raw);
const byteLength = value => Buffer.byteLength(JSON.stringify(value), "utf8");
const prettyByteLength = value => Buffer.byteLength(JSON.stringify(value, null, 2) + "\n", "utf8");

function fieldBreakdown(rows) {
  const fields = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [key, value] of Object.entries(row)) {
      const bytes = byteLength(value);
      if (!fields[key]) fields[key] = { key, bytes: 0, present: 0 };
      fields[key].bytes += bytes;
      fields[key].present += 1;
    }
  }
  return Object.values(fields)
    .sort((a, b) => b.bytes - a.bytes)
    .map(item => ({
      ...item,
      avgBytesWhenPresent: item.present ? Math.round(item.bytes / item.present) : 0
    }));
}

function nestedFieldBreakdown(rows, parentKey) {
  return fieldBreakdown(
    rows
      .map(row => row?.[parentKey])
      .filter(value => value && typeof value === "object" && !Array.isArray(value))
  );
}

function largestRows(rows, limit = 20) {
  return rows
    .map(row => ({
      raceKey: row?.raceKey || "",
      date: row?.date || "",
      place: row?.place || "",
      raceNo: row?.raceNo || 0,
      bytes: byteLength(row)
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

const topLevel = Object.entries(parsed).map(([key, value]) => ({
  key,
  bytes: byteLength(value),
  prettyBytes: prettyByteLength(value),
  rows: Array.isArray(value) ? value.length : null
})).sort((a, b) => b.bytes - a.bytes);

const predictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];
const verificationPredictions = Array.isArray(parsed.verificationPredictions)
  ? parsed.verificationPredictions
  : [];

const verificationPredictionFields = nestedFieldBreakdown(
  verificationPredictions,
  "prediction"
);
const verificationResultFields = nestedFieldBreakdown(
  verificationPredictions,
  "result"
);

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: "data/predictions/index.json",
  totalBytes: Buffer.byteLength(raw, "utf8"),
  limitBytes: 3000000,
  overLimitBytes: Math.max(0, Buffer.byteLength(raw, "utf8") - 3000000),
  predictionRows: predictions.length,
  verificationPredictionRows: verificationPredictions.length,
  topLevel,
  largestPredictionFields: fieldBreakdown(predictions).slice(0, 30),
  largestRows: largestRows(predictions),
  verificationFields: fieldBreakdown(verificationPredictions),
  verificationPredictionFields,
  verificationResultFields,
  largestVerificationRows: largestRows(verificationPredictions, 30),
  safeReductionRule: "正本の日次JSONに保持される項目のみをindex軽量化候補とし、結果画面・成績集計・校正・理論評価で参照される項目は削除候補にしない。",
  note: "容量の内訳監査のみ。保持件数・3MB上限・予想ロジック・買い目・UI・理論重みは変更しない。"
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
