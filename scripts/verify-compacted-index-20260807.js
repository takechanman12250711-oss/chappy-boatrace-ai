"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "data", "predictions", "index.json");
const raw = fs.readFileSync(indexPath);
const parsed = JSON.parse(raw.toString("utf8"));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  totalBytes: raw.length,
  gzipBytes: zlib.gzipSync(raw, { level: 9 }).length,
  under3MB: raw.length < 3000000,
  under300KBGzip: zlib.gzipSync(raw, { level: 9 }).length < 300000,
  verificationPredictionRows: Array.isArray(parsed.verificationPredictions)
    ? parsed.verificationPredictions.length
    : 0,
  verificationEvidenceTicketsRows: Array.isArray(parsed.verificationPredictions)
    ? parsed.verificationPredictions.filter(row => Array.isArray(row?.prediction?.verificationEvidence?.tickets) && row.prediction.verificationEvidence.tickets.length).length
    : 0
};

if (!report.under3MB) {
  throw new Error(`index is still over 3MB: ${report.totalBytes}`);
}
if (!report.under300KBGzip) {
  throw new Error(`index gzip is still over 300KB: ${report.gzipBytes}`);
}
if (report.verificationPredictionRows !== 300) {
  throw new Error(`verificationPredictions retention changed: ${report.verificationPredictionRows}`);
}
if (report.verificationEvidenceTicketsRows !== 0) {
  throw new Error(`duplicate verificationEvidence.tickets remain: ${report.verificationEvidenceTicketsRows}`);
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
