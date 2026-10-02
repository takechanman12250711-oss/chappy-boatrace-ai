"use strict";
// Read-only discovery of raw/archived prediction sources. Never reconstruct a sidecar.
const fs = require("node:fs"), path = require("node:path"), zlib = require("node:zlib");
const archive = require("./daily-prediction-source-archive");
const input = require("./analysis-input-contract");
function dates(root, firstDate) {
  const daily = path.join(root, "data/predictions"), stored = path.join(daily, "source-archives");
  const names = dir => fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return [...new Set([...names(daily).filter(n => /^\d{8}\.json$/.test(n)),
    ...names(stored).filter(n => /^\d{8}\.(meta\.json|json\.gz)$/.test(n))]
    .map(n => n.slice(0, 8)))].filter(d => d >= firstDate).sort();
}
function readDay(root, date) {
  const sourcePath = archive.sourcePathFor(root, date), archivePath = archive.archivePathFor(root, date);
  const metadataPath = archive.metadataPathFor(root, date);
  const raw = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : null;
  let data = raw ? JSON.parse(raw.toString("utf8")) : null;
  let source = "raw";
  if (fs.existsSync(archivePath) || fs.existsSync(metadataPath)) {
    if (!fs.existsSync(archivePath) || !fs.existsSync(metadataPath)) throw Error("archive-pair-incomplete");
    const meta = archive.validateMetadata(JSON.parse(fs.readFileSync(metadataPath, "utf8")), date);
    const rawNewer = data && Number.isFinite(Date.parse(data.updatedAt)) &&
      Number.isFinite(Date.parse(meta.sourceUpdatedAt)) && Date.parse(data.updatedAt) > Date.parse(meta.sourceUpdatedAt);
    if (!rawNewer) {
      const compressed = fs.readFileSync(archivePath);
      if (compressed.length !== Number(meta.archiveBytes) || archive.sha256(compressed) !== meta.archiveSha256)
        throw Error("archive-fingerprint-mismatch");
      const restored = zlib.gunzipSync(compressed);
      if (restored.length !== Number(meta.sourceBytes) || archive.sha256(restored) !== meta.sourceSha256)
        throw Error("source-fingerprint-mismatch");
      data = JSON.parse(restored.toString("utf8")); source = "archive";
    }
  }
  if (!data || String(data.date) !== date || !Array.isArray(data.predictions) ||
      !Array.isArray(data.verificationPredictions)) throw Error("invalid-daily-source");
  return { data, source };
}
function load(root, firstDate) {
  const records = [], sources = [], errors = [];
  for (const date of dates(root, firstDate)) {
    try {
      const { data, source } = readDay(root, date);
      const canonical = input.mergePredictionSources(data.predictions, data.verificationPredictions);
      records.push(...canonical);
      sources.push({ date, source, updatedAt: data.updatedAt || null, canonicalRaces: canonical.length });
    } catch (error) { errors.push({ date, message: String(error.message).slice(0, 240) }); }
  }
  const captured = records.filter(r => r.practicalPriorityShadow?.eightTicketPromotionShadow);
  const capturedTimes = captured.map(r => Date.parse(r.selectedAt)).filter(Number.isFinite);
  return { records, diagnostics: { complete: errors.length === 0, sources, errors,
    canonicalRaces: records.length, capturedRaces: captured.length,
    withoutSnapshotRaces: records.length - captured.length,
    latestCapturedAt: capturedTimes.length ? new Date(Math.max(...capturedTimes)).toISOString() : null } };
}
module.exports = { dates, readDay, load };
