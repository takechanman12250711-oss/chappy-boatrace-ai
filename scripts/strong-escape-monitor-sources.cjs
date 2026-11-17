"use strict";

// Read the same canonical bytes as restore --all + the monitor's raw scan,
// without writing and reparsing the archive-backed daily JSON a second time.
const fs = require("node:fs");
const zlib = require("node:zlib");
const archiveApi = require("./daily-prediction-source-archive");

function readArchive(rootDirectory, date) {
  const sourcePath = archiveApi.sourcePathFor(rootDirectory, date);
  const archivePath = archiveApi.archivePathFor(rootDirectory, date);
  const metadataPath = archiveApi.metadataPathFor(rootDirectory, date);
  if (!fs.existsSync(archivePath) || !fs.existsSync(metadataPath)) {
    throw new Error("日次予想原本archiveの構成ファイルが不足しています：" + date);
  }
  const metadata = archiveApi.validateMetadata(JSON.parse(fs.readFileSync(metadataPath, "utf8")), date);
  const archive = fs.readFileSync(archivePath);
  if (archive.length !== Number(metadata.archiveBytes) || archiveApi.sha256(archive) !== metadata.archiveSha256) {
    throw new Error("日次予想原本archiveのfingerprintが不一致です：" + date);
  }
  const raw = zlib.gunzipSync(archive);
  if (raw.length !== Number(metadata.sourceBytes) || archiveApi.sha256(raw) !== metadata.sourceSha256) {
    throw new Error("復元した日次予想原本のfingerprintが不一致です：" + date);
  }
  return archiveApi.parsePredictionJson(raw, sourcePath);
}

function* readMonitorSources({rootDirectory = process.cwd(), startDate = "00000000"} = {}) {
  const archivedDates = new Set(archiveApi.archivedSourceDates(rootDirectory));
  const rawDates = fs.readdirSync(archiveApi.predictionDirectory(rootDirectory))
    .filter(name => /^\d{8}\.json$/.test(name)).map(name => name.slice(0, 8));
  const dates = [...new Set([...rawDates, ...archivedDates])].sort();
  for (const date of dates) {
    if (archivedDates.has(date)) {
      // restore --all also validates archives before the monitor's start date.
      // An archive takes precedence over a tracked raw copy, as restoration did.
      const data = readArchive(rootDirectory, date);
      if (date >= startDate) yield {date, data};
    } else if (date >= startDate) {
      const data = JSON.parse(fs.readFileSync(archiveApi.sourcePathFor(rootDirectory, date), "utf8"));
      yield {date, data};
    }
  }
}

module.exports = {readMonitorSources};
