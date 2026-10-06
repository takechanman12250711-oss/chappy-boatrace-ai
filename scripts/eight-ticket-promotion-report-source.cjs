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
// Frozen-ledger lookup is deliberately separate from latest-source discovery above.
// A newer day file can contain a later capture of the same race, not its original.
function valueSha256(record) {
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
  }
  return archive.sha256(Buffer.from(JSON.stringify(stable(record))));
}
function frozenEvidence(record) {
  const prediction = record?.prediction || record || {};
  const pool = prediction.practicalSelection?.candidateOutcomes;
  const savedTickets = Array.isArray(prediction.practicalTickets) ? prediction.practicalTickets
    : prediction.practicalSelection?.tickets;
  // Preserve ticket/role evidence and order. Only these known odds-display fields
  // differ between primary and verification copies; hit-first never uses odds.
  const withoutOdds = item => {
    if (!item || typeof item !== "object") return item;
    const { odds, oddsText, hasOdds, ...evidence } = item;
    return evidence;
  };
  // See docs/frozen-ledger-capture-resolution.md for the explicit boundary.
  // Never synthesize a record: this projection is used only for conflict detection.
  return {
    raceKey: input.raceKey(record), selectedAt: record.selectedAt, capturedAt: record.capturedAt,
    createdAt: record.createdAt, deadlineAt: record.deadlineAt, deadline: record.deadline,
    verificationMode: record.verificationMode, predictionMode: prediction.predictionMode,
    recordFlags: [record.officialResultUsedForPrediction, record.officialResultUsedForEvaluation, record.isRetrospective],
    predictionFlags: [prediction.officialResultUsedForPrediction, prediction.officialResultUsedForEvaluation, prediction.isRetrospective],
    preRaceConditions: prediction.preRaceConditions || record.preRaceConditions || {},
    verificationEvidence: prediction.verificationEvidence || prediction.practicalSelection?.verificationEvidence || {},
    practicalTickets: Array.isArray(savedTickets)
      ? savedTickets.map(item => typeof item === "string" ? { ticket: item } : withoutOdds(item)) : null,
    candidatePool: Array.isArray(pool) ? pool.map(withoutOdds) : null
  };
}
function readFrozenDay(root, date, frozenRows) {
  const wanted = new Map(frozenRows.map(row => [row.raceKey, row.selectedAt]));
  const captures = new Map(), sources = [];
  function consume(bytes, source, archiveSha256 = null) {
    const data = JSON.parse(bytes.toString("utf8"));
    if (String(data?.date) !== date || !Array.isArray(data.predictions) ||
        !Array.isArray(data.verificationPredictions)) throw Error("invalid-daily-source");
    const sourceSha256 = archive.sha256(bytes);
    sources.push({ date, source, updatedAt: data.updatedAt || null, sourceSha256,
      ...(archiveSha256 ? { archiveSha256 } : {}) });
    // Match the capture before provenance precedence: later primary rows must not hide it.
    for (const sourceArray of ["predictions", "verificationPredictions"]) {
      data[sourceArray].forEach((record, index) => {
        const key = input.raceKey(record);
        if (!wanted.has(key) || (record?.selectedAt || record?.capturedAt) !== wanted.get(key)) return;
        const hash = valueSha256(frozenEvidence(record));
        const evidence = { source, sourceSha256, sourceArray, index,
          recordSha256: valueSha256(record), verifierEvidenceSha256: hash };
        const current = captures.get(key);
        if (!current) captures.set(key, { record, verifierEvidenceSha256: hash, conflict: false, evidence: [evidence] });
        else {
          // Do not choose among conflicting versions of the same frozen capture.
          current.conflict ||= current.verifierEvidenceSha256 !== hash;
          current.evidence.push(evidence);
        }
      });
    }
  }
  const sourcePath = archive.sourcePathFor(root, date), archivePath = archive.archivePathFor(root, date);
  const metadataPath = archive.metadataPathFor(root, date);
  if (fs.existsSync(sourcePath)) consume(fs.readFileSync(sourcePath), "raw");
  if (fs.existsSync(archivePath) || fs.existsSync(metadataPath)) {
    if (!fs.existsSync(archivePath) || !fs.existsSync(metadataPath)) throw Error("archive-pair-incomplete");
    const meta = archive.validateMetadata(JSON.parse(fs.readFileSync(metadataPath, "utf8")), date);
    const compressed = fs.readFileSync(archivePath);
    if (compressed.length !== Number(meta.archiveBytes) || archive.sha256(compressed) !== meta.archiveSha256)
      throw Error("archive-fingerprint-mismatch");
    const restored = zlib.gunzipSync(compressed);
    if (restored.length !== Number(meta.sourceBytes) || archive.sha256(restored) !== meta.sourceSha256)
      throw Error("source-fingerprint-mismatch");
    consume(restored, "archive", meta.archiveSha256);
  }
  if (!sources.length) throw Error("invalid-daily-source");
  return { captures, sources };
}
module.exports = { dates, readDay, load, readFrozenDay };
