"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const archiveApi = require("./daily-prediction-source-archive");
const reportBuilder = require("./build-practical-priority-shadow-report");
const reportApi = require("../js/practical-priority-shadow-report");

const ROOT = path.resolve(__dirname, "..");

function buildArchiveBackedReport({
  rootDirectory = ROOT,
  generatedAt,
  readArchive = archiveApi.readPredictionSourceArchive
} = {}) {
  const archiveDates = archiveApi.archivedSourceDates(rootDirectory);
  assert.ok(
    archiveDates.length > 0,
    "順位候補シャドー正本照合にはarchive原本が必要"
  );
  const archived = new Set(archiveDates);
  const sourceDates = [...new Set([
    ...archiveApi.predictionSourceDates(rootDirectory),
    ...archiveDates
  ])].sort();
  const readArchived = date => {
    const source = readArchive({ rootDirectory, date });
    assert.equal(
      source.status,
      "archive-read",
      "archive済み日次予想原本をすべて検証する"
    );
    return source.parsed;
  };

  // The report filters older dates, but the previous restore-all gate also
  // validated these archives. Keep that gate without retaining their payloads.
  for (const date of archiveDates) {
    if (date < reportApi.CONTRACT_START_DATE) readArchived(date);
  }

  return reportBuilder.buildReport(generatedAt, {
    predictionDirectory: archiveApi.predictionDirectory(rootDirectory),
    resultDirectory: path.join(rootDirectory, "data", "results"),
    sourceDates,
    // Consume and compact one validated day at a time. An archive always wins
    // over an expanded raw, and any archive error stops the gate without fallback.
    readPredictionData: date => archived.has(date)
      ? readArchived(date)
      : JSON.parse(fs.readFileSync(
          archiveApi.sourcePathFor(rootDirectory, date), "utf8"
        ))
  });
}

function verifyArtifact({
  rootDirectory = ROOT,
  readArchive = archiveApi.readPredictionSourceArchive
} = {}) {
  const committed = JSON.parse(fs.readFileSync(
    path.join(rootDirectory, "data", "stats", "practical-priority-shadow-report.json"),
    "utf8"
  ));
  const rebuilt = buildArchiveBackedReport({
    rootDirectory,
    generatedAt: committed.generatedAt,
    readArchive
  });

  assert.deepEqual(
    committed,
    rebuilt,
    "保存済み順位候補シャドーレポートは現在の正本入力と一致する"
  );
  assert.equal(
    reportBuilder.preserveGeneratedAt(
      { ...rebuilt, generatedAt: "2099-01-01T00:00:00.000Z" },
      committed
    ).generatedAt,
    committed.generatedAt,
    "集計内容が同じなら生成時刻だけを更新しない"
  );
  return rebuilt;
}

function main() {
  verifyArtifact();
  console.log("practical priority prospective shadow artifact: OK");
}

if (require.main === module) main();

module.exports = {
  buildArchiveBackedReport,
  verifyArtifact,
  main
};
