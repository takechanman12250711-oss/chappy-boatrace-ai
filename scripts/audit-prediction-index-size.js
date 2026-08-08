"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_SHARD_BYTES,
  currentShardDescriptors,
  retainedShardDescriptors,
  reconstructIndex
} = require(
  "./build-prediction-index-shards"
);

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "data", "predictions", "index.json");
const manifestPath = path.join(
  root,
  "data",
  "predictions",
  "index-manifest.json"
);

if (!fs.existsSync(indexPath)) {
  throw new Error("data/predictions/index.json がありません");
}

const usingManifest =
  fs.existsSync(manifestPath);
const sourcePath = usingManifest
  ? manifestPath
  : indexPath;
const raw = fs.readFileSync(
  sourcePath,
  "utf8"
);
const manifest = usingManifest
  ? JSON.parse(raw)
  : null;
const parsed = usingManifest
  ? reconstructIndex(manifestPath)
  : JSON.parse(raw);
const shardDescriptors = usingManifest
  ? currentShardDescriptors(manifest)
  : [];
const retainedDescriptors = usingManifest
  ? retainedShardDescriptors(manifest)
  : [];
const storedShardDescriptors = [
  ...shardDescriptors,
  ...retainedDescriptors
].filter(
  (descriptor, index, all) =>
    all.findIndex(item =>
      item.path === descriptor.path
    ) === index
);
const shardBytes =
  storedShardDescriptors.reduce(
    (sum, descriptor) =>
      sum + Number(
        descriptor?.bytes || 0
      ),
    0
  );
const manifestBytes = usingManifest
  ? Buffer.byteLength(raw, "utf8")
  : 0;
const largestShardBytes = Math.max(
  0,
  ...storedShardDescriptors.map(
    descriptor =>
      Number(descriptor?.bytes || 0)
  )
);
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

function nestedObjects(rows, parentKey) {
  return rows
    .map(row => row?.[parentKey])
    .filter(value => value && typeof value === "object" && !Array.isArray(value));
}

function nestedFieldBreakdown(rows, parentKey) {
  return fieldBreakdown(nestedObjects(rows, parentKey));
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
const verificationPredictionObjects = nestedObjects(verificationPredictions, "prediction");
const verificationEvidenceObjects = nestedObjects(
  verificationPredictionObjects,
  "verificationEvidence"
);
const verificationResultObjects = nestedObjects(verificationPredictions, "result");

const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  source: usingManifest
    ? "data/predictions/index-manifest.json"
    : "data/predictions/index.json",
  storageFormat: usingManifest
    ? "manifest-and-byte-bound-shards"
    : "legacy-single-index",
  totalBytes: usingManifest
    ? manifestBytes + shardBytes
    : Buffer.byteLength(raw, "utf8"),
  manifestBytes,
  shardCount:
    storedShardDescriptors.length,
  currentShardCount:
    shardDescriptors.length,
  retainedShardCount:
    retainedDescriptors.length,
  shardBytes,
  largestShardBytes,
  limitBytes: usingManifest
    ? MAX_SHARD_BYTES
    : 3000000,
  overLimitBytes: usingManifest
    ? Math.max(
        0,
        largestShardBytes -
          MAX_SHARD_BYTES
      )
    : Math.max(
        0,
        Buffer.byteLength(raw, "utf8") -
          3000000
      ),
  predictionRows: predictions.length,
  verificationPredictionRows: verificationPredictions.length,
  topLevel,
  largestPredictionFields: fieldBreakdown(predictions).slice(0, 30),
  largestRows: largestRows(predictions),
  verificationFields: fieldBreakdown(verificationPredictions),
  verificationPredictionFields: fieldBreakdown(verificationPredictionObjects),
  verificationEvidenceFields: fieldBreakdown(verificationEvidenceObjects),
  verificationResultFields: fieldBreakdown(verificationResultObjects),
  largestVerificationRows: largestRows(verificationPredictions, 30),
  safeReductionRule: "正本の日次JSONに保持される項目のみをindex軽量化候補とし、結果画面・成績集計・校正・理論評価で参照される項目は削除候補にしない。",
  note: usingManifest
    ? "容量の内訳監査のみ。旧indexはfallbackとして凍結し、manifestと各shardを監査する。保持件数・予想ロジック・買い目・UI・理論重みは変更しない。"
    : "容量の内訳監査のみ。保持件数・3MB上限・予想ロジック・買い目・UI・理論重みは変更しない。"
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
