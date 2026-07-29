"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildPredictionSummary,
  buildPredictionSummaries
} = require("./build-prediction-summaries");

const summary = buildPredictionSummary({
  date: "20260727",
  updatedAt: "2026-07-27T08:00:00.000Z",
  runs: [
    {
      checkedAt: "2026-07-27T07:45:00.000Z",
      selected: false,
      best: { jcd: "01", raceNo: 6, score: 64 },
      compared: [{ jcd: "01", raceNo: 6, score: 64 }]
    },
    {
      checkedAt: "2026-07-27T08:00:00.000Z",
      threshold: 70,
      selected: true,
      collectionHealth: {
        checkedAt: "2026-07-27T08:00:00.000Z",
        targetCount: 4,
        savedCount: 4,
        insufficientDataCount: 0,
        failedCount: 0,
        recoveredCount: 1,
        finalUncollectedCount: 0,
        complete: true,
        targets: Array.from({ length: 100 }, (_, index) => ({
          raceKey: `ignored-${index}`
        })),
        v2: {
          evaluatedCount: 4,
          readyCount: 2,
          qualifiedCount: 1,
          selectedCount: 1,
          belowThresholdCount: 1,
          notReadyCount: 2,
          readinessRate: 50,
          missingReasons: [
            {
              code: "missing_exhibition_st",
              label: "展示ST不足",
              count: 2
            },
            {
              code: "cutoff_missed",
              label: "締切後取得",
              count: 1
            }
          ]
        }
      },
      best: {
        jcd: "12",
        place: "住之江",
        raceNo: 11,
        type: "8項目V2",
        score: 72.5,
        scoreSource:
          "shadowSelectionV2.evaluation.totalScore",
        scenarioLabel: "2コース差し",
        selectionReady: true,
        selectionStatus: "ready",
        legacyType: "本線",
        legacyScore: 59.3,
        evaluation: {
          ready: true,
          honmei: {
            score: 72.5,
            reasons: ["展開成立"]
          }
        }
      },
      compared: [
        { jcd: "12", raceNo: 11, score: 72.5 },
        { jcd: "01", raceNo: 6, score: 64 }
      ]
    }
  ],
  predictions: [{
    raceKey: "20260727-12-11",
    date: "20260727",
    jcd: "12",
    place: "住之江",
    raceNo: 11,
    selectedAt: "2026-07-27T08:00:01.000Z",
    selection: { score: 72.5, threshold: 70 },
    note: {
      path: "data/notes/20260727-12-11R.md",
      title: "住之江11R"
    },
    prediction: {
      practicalTickets: Array.from(
        { length: 12 },
        (_, index) => ({
          ticket: `1-2-${(index % 4) + 3}`
        })
      ),
      oversized: "summaryへ含めない"
    }
  }]
});

assert.equal(summary.schemaVersion, 1);
assert.equal(summary.runs.length, 1);
assert.equal(summary.runs[0].checkedAt, "2026-07-27T08:00:00.000Z");
assert.equal(summary.runs[0].best.score, 72.5);
assert.equal(
  summary.runs[0].best.scoreSource,
  "shadowSelectionV2.evaluation.totalScore"
);
assert.equal(
  summary.runs[0].best.scenarioLabel,
  "2コース差し"
);
assert.equal(
  summary.runs[0].best.selectionReady,
  true
);
assert.equal(
  summary.runs[0].best.legacyScore,
  59.3
);
assert.equal(summary.runs[0].compared.length, 2);
assert.equal(
  summary.runs[0].collectionHealth.v2.evaluatedCount,
  4
);
assert.equal(
  summary.runs[0].collectionHealth.v2.readyCount,
  2
);
assert.deepEqual(
  summary.runs[0].collectionHealth.v2.missingReasons,
  [
    {
      code: "missing_exhibition_st",
      label: "展示ST不足",
      count: 2
    },
    {
      code: "cutoff_missed",
      label: "締切後取得",
      count: 1
    }
  ]
);
assert.equal(
  summary.runs[0].collectionHealth.targets,
  undefined,
  "レース単位の重い監視データは要約へ含めない"
);
assert.equal(summary.predictions.length, 1);
assert.equal(summary.predictions[0].prediction.practicalTickets.length, 10);
assert.equal(summary.predictions[0].prediction.oversized, undefined);
assert.ok(
  Buffer.byteLength(JSON.stringify(summary)) < 20_000,
  "起動画面用の要約は20KB未満に保つ"
);

const temporaryDirectory =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "chappy-summary-"
    )
  );

try {
  const sourcePath =
    path.join(
      temporaryDirectory,
      "20260727.json"
    );
  fs.writeFileSync(
    sourcePath,
    JSON.stringify({
      date: "20260727",
      runs: summary.runs,
      predictions:
        summary.predictions
    }),
    "utf8"
  );

  const outputs =
    buildPredictionSummaries(
      temporaryDirectory
    );
  const outputPath =
    outputs[0].outputPath;
  const payload =
    fs.readFileSync(
      outputPath,
      "utf8"
    );
  const parsed =
    JSON.parse(payload);

  assert.deepEqual(
    parsed,
    buildPredictionSummary(
      JSON.parse(
        fs.readFileSync(
          sourcePath,
          "utf8"
        )
      ),
      "20260727"
    ),
    "空白を除いても要約内容を変えない"
  );
  assert.equal(
    outputs[0].bytes,
    fs.statSync(outputPath).size,
    "容量ログは実際の保存サイズと一致させる"
  );
  assert.equal(
    payload,
    `${JSON.stringify(parsed)}\n`,
    "起動画面用要約はcompact JSONで保存する"
  );
} finally {
  fs.rmSync(
    temporaryDirectory,
    {
      recursive: true,
      force: true
    }
  );
}

console.log("軽量予想要約テスト: 合格");
