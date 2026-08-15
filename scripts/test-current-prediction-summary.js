"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  getJstDate,
  normalizeDate,
  resolveTargetDate,
  buildCurrentPredictionSummary
} = require("./build-current-prediction-summary");

assert.equal(
  getJstDate(
    new Date("2026-08-14T15:30:00.000Z")
  ),
  "20260815",
  "UTC日付ではなくAsia/Tokyoの日付を使う"
);
assert.equal(
  normalizeDate("2026/08/15"),
  "20260815"
);
assert.equal(
  resolveTargetDate({
    argv: ["--date=2026-08-16"],
    env: { PREDICT_DATE: "20260817" },
    now: new Date("2026-08-14T15:30:00.000Z")
  }),
  "20260816",
  "明示日付を環境変数とJST本日より優先する"
);
assert.throws(
  () => normalizeDate("202608"),
  /YYYYMMDD/
);

const temporaryRoot = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "chappy-current-summary-"
  )
);

try {
  const emptyResult =
    buildCurrentPredictionSummary({
      rootDirectory: temporaryRoot,
      date: "2026-08-15"
    });
  const emptySummary = JSON.parse(
    fs.readFileSync(
      emptyResult.outputPath,
      "utf8"
    )
  );

  assert.equal(
    emptyResult.sourceExists,
    false
  );
  assert.deepEqual(
    emptySummary,
    {
      schemaVersion: 1,
      date: "20260815",
      updatedAt: "",
      runs: [],
      predictions: []
    },
    "当日予想原本がなくても当日要約を生成する"
  );

  fs.mkdirSync(
    path.dirname(emptyResult.sourcePath),
    { recursive: true }
  );
  fs.writeFileSync(
    emptyResult.sourcePath,
    JSON.stringify({
      schemaVersion: 3,
      date: "20260815",
      updatedAt: "2026-08-15T08:30:00.000Z",
      runs: [
        {
          runKey: "older-run",
          checkedAt: "2026-08-15T08:15:00.000Z",
          threshold: 70,
          selected: false,
          collectionHealth: {
            checkedAt: "2026-08-15T08:15:00.000Z",
            targetCount: 2,
            savedCount: 1,
            complete: false,
            v2: {
              evaluatedCount: 1,
              readyCount: 0,
              qualifiedCount: 0,
              notReadyCount: 1,
              readinessRate: 0,
              missingReasons: [{
                code: "missing_exhibition_st",
                label: "展示ST不足",
                count: 1
              }]
            }
          },
          best: null,
          compared: []
        },
        {
          runKey: "latest-run",
          checkedAt: "2026-08-15T08:30:00.000Z",
          threshold: 70,
          selected: false,
          collectionHealth: {
            checkedAt: "2026-08-15T08:30:00.000Z",
            targetCount: 3,
            savedCount: 3,
            complete: true,
            v2: {
              evaluatedCount: 3,
              readyCount: 2,
              qualifiedCount: 1,
              selectedCount: 0,
              belowThresholdCount: 1,
              notReadyCount: 1,
              readinessRate: 66.7,
              missingReasons: [{
                code: "cutoff_missed",
                label: "締切後取得",
                count: 1
              }]
            }
          },
          best: null,
          compared: []
        }
      ],
      predictions: []
    }),
    "utf8"
  );

  const populatedResult =
    buildCurrentPredictionSummary({
      rootDirectory: temporaryRoot,
      date: "20260815"
    });
  const populatedSummary = JSON.parse(
    fs.readFileSync(
      populatedResult.outputPath,
      "utf8"
    )
  );

  assert.equal(
    populatedResult.sourceExists,
    true
  );
  assert.equal(
    populatedSummary.runs.length,
    1
  );
  assert.equal(
    populatedSummary.runs[0].runKey,
    "latest-run",
    "最新checkedAtのrunだけを当日要約へ保存する"
  );
  assert.equal(
    populatedSummary.runs[0].threshold,
    70,
    "70点基準を変更しない"
  );
  assert.deepEqual(
    populatedSummary.runs[0].collectionHealth.v2,
    {
      evaluatedCount: 3,
      readyCount: 2,
      qualifiedCount: 1,
      selectedCount: 0,
      belowThresholdCount: 1,
      notReadyCount: 1,
      readinessRate: 66.7,
      missingReasons: [{
        code: "cutoff_missed",
        label: "締切後取得",
        count: 1
      }]
    },
    "最新runのcollectionHealth.v2を欠落させない"
  );

  const compactPayload = fs.readFileSync(
    populatedResult.outputPath,
    "utf8"
  );
  assert.equal(
    compactPayload,
    `${JSON.stringify(populatedSummary)}\n`,
    "当日要約はcompact JSONで保存する"
  );
} finally {
  fs.rmSync(
    temporaryRoot,
    {
      recursive: true,
      force: true
    }
  );
}

const collectWorkflow = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    ".github",
    "workflows",
    "collect-predictions.yml"
  ),
  "utf8"
);
const shadowWorkflow = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    ".github",
    "workflows",
    "collect-frame-rise-fall-shadow-ab.yml"
  ),
  "utf8"
);
const liveCommand =
  "node scripts/build-current-prediction-summary.js";

assert.ok(
  collectWorkflow.lastIndexOf(liveCommand) >
    collectWorkflow.lastIndexOf(
      "node scripts/minify-daily-prediction.js"
    ),
  "通常収集は予想原本の最終加工後に当日要約を生成する"
);
assert.ok(
  shadowWorkflow.lastIndexOf(liveCommand) >
    shadowWorkflow.lastIndexOf(
      "node scripts/minify-daily-prediction.js"
    ),
  "Shadow収集も予想原本更新後に当日要約を再生成する"
);
assert.ok(
  collectWorkflow.includes(
    '- cron: "45 21 * * *"'
  ),
  "06:45 JSTに当日要約を初期化する"
);

console.log("当日予想要約生成テスト: 合格");
