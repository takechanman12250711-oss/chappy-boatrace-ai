"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const archiveApi = require(
  "./daily-prediction-source-archive"
);
const restoreApi = require(
  "./restore-daily-prediction-source"
);
const reportBuilder = require(
  "./build-practical-priority-shadow-report"
);

const ROOT = path.resolve(__dirname, "..");

function preservePredictionSources(
  rootDirectory = ROOT
) {
  const predictionDirectory =
    archiveApi.predictionDirectory(
      rootDirectory
    );
  const backupDirectory = fs.mkdtempSync(
    path.join(
      predictionDirectory,
      ".priority-shadow-artifact-"
    )
  );
  const snapshots =
    archiveApi
      .archivedSourceDates(rootDirectory)
      .map(date => {
        const sourcePath =
          archiveApi.sourcePathFor(
            rootDirectory,
            date
          );
        const backupPath = path.join(
          backupDirectory,
          `${date}.json`
        );
        const existed = fs.existsSync(
          sourcePath
        );

        if (existed) {
          try {
            fs.linkSync(
              sourcePath,
              backupPath
            );
          } catch {
            fs.copyFileSync(
              sourcePath,
              backupPath
            );
          }
        }

        return {
          sourcePath,
          backupPath,
          existed
        };
      });

  return {
    snapshots,
    restore() {
      snapshots.forEach(snapshot => {
        fs.rmSync(
          snapshot.sourcePath,
          { force: true }
        );

        if (snapshot.existed) {
          fs.renameSync(
            snapshot.backupPath,
            snapshot.sourcePath
          );
        }
      });
      fs.rmSync(
        backupDirectory,
        {
          recursive: true,
          force: true
        }
      );
    }
  };
}

const preserved = preservePredictionSources();

try {
  const restored =
    restoreApi.restorePredictionSources({
      rootDirectory: ROOT,
      all: true
    });

  assert.ok(
    restored.length > 0,
    "順位候補シャドー正本照合にはarchive原本が必要"
  );
  assert.ok(
    restored.every(
      result => result.status === "restored"
    ),
    "archive済み日次予想原本をすべて復元する"
  );

  const committed = JSON.parse(
    fs.readFileSync(
      reportBuilder.OUTPUT,
      "utf8"
    )
  );
  const rebuilt = reportBuilder.buildReport(
    committed.generatedAt
  );

  assert.deepEqual(
    committed,
    rebuilt,
    "保存済み順位候補シャドーレポートは現在の正本入力と一致する"
  );
  assert.equal(
    reportBuilder.reportForWrite(
      "2099-01-01T00:00:00.000Z"
    ).generatedAt,
    committed.generatedAt,
    "集計内容が同じなら生成時刻だけを更新しない"
  );

  console.log(
    "practical priority prospective shadow artifact: OK"
  );
} finally {
  preserved.restore();
}
