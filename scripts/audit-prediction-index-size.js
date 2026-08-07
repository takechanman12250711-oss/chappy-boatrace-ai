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

const topLevel = Object.entries(parsed).map(([key, value]) => ({
  key,
  bytes: byteLength(value),
  prettyBytes: prettyByteLength(value),
  rows: Array.isArray(value) ? value.length : null
})).sort((a, b) => b.bytes - a.bytes);

const predictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];
const predictionFields = {};
for (const row of predictions) {
  if (!row || typeof row !== "object") continue;
  for (const [key, value] of Object.entries(row)) {
    const bytes = byteLength(value);
    if (!predictionFields[key]) predictionFields[key] = { key, bytes: 0, present: 0 };
    predictionFields[key].bytes += bytes;
    predictionFields[key].present += 1;
  }
}

const largestPredictionFields = Object.values(predictionFields)
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 30)
  .map(item => ({
    ...item,
    avgBytesWhenPresent: item.present ? Math.round(item.bytes / item.present) : 0
  }));

const largestRows = predictions
  .map(row => ({
    raceKey: row?.raceKey || "",
    date: row?.date || "",
    place: row?.place || "",
    raceNo: row?.raceNo || 0,
    bytes: byteLength(row)
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 20);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "data/predictions/index.json",
  totalBytes: Buffer.byteLength(raw, "utf8"),
  limitBytes: 3000000,
  overLimitBytes: Math.max(0, Buffer.byteLength(raw, "utf8") - 3000000),
  predictionRows: predictions.length,
  topLevel,
  largestPredictionFields,
  largestRows,
  note: "容量の内訳監査のみ。保持件数・3MB上限・予想ロジック・買い目・UI・理論重みは変更しない。"
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
