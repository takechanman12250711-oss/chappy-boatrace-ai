"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildPredictionSummary,
  buildPredictionSummaries
} = require("./build-prediction-summaries");
const collectorSource = fs.readFileSync(
  path.join(__dirname, "collect-predictions.js"),
  "utf8"
);

const longReason =
  "展開・コース・ST・展示・残し拾い・当地水面を確認した長い理由".repeat(
    4
  );

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
            level: "高",
            reasons: [
              "展開成立",
              "コース適性",
              "ST優位",
              "展示気配",
              "5件目は要約へ含めない"
            ]
          },
          manshu: {
            score: 28,
            level: "低",
            reasons: [
              "外攻めは限定的",
              "2件目",
              "3件目",
              "4件目",
              "5件目は要約へ含めない"
            ]
          },
          dataStatus: {
            stage: "final",
            label: "展示反映済み",
            completeness: 100,
            entryCount: 6,
            stCount: 6,
            exhibitionCount: 6
          }
        }
      },
      compared: [
        {
          jcd: "12",
          raceNo: 11,
          deadlineAt: "2026-07-27T08:30:00.000Z",
          score: 72.5,
          evaluation: {
            ready: true,
            honmei: {
              score: 72.5,
              level: "高",
              reasons: [
                "中心理由",
                "比較一覧では省く理由"
              ]
            },
            manshu: {
              score: 28,
              level: "低",
              reasons: [
                "波乱理由",
                "比較一覧では省く理由"
              ]
            },
            dataStatus: {
              stage: "final",
              label: "展示反映済み",
              completeness: 100,
              entryCount: 6
            }
          }
        },
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
          ticket: `1-2-${(index % 4) + 3}`,
          category: "本線",
          scenarioType: "中心展開",
          amount: 100,
          comment: longReason,
          roleClaims: Array.from(
            { length: 20 },
            () => ({ reason: longReason })
          ),
          theoryClaims: Array.from(
            { length: 20 },
            () => ({ reason: longReason })
          )
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
  summary.runs[0].compared[0].deadlineAt,
  "2026-07-27T08:30:00.000Z",
  "比較要約へ締切時刻を保持する"
);
assert.ok(
  collectorSource.includes(
    "raceNo: item.raceNo,\n      deadlineAt: item.deadlineAt,\n      type: item.type"
  ),
  "収集結果のcompared保存時に締切時刻を落とさない"
);
assert.deepEqual(
  summary.runs[0].best.evaluation.honmei.reasons,
  [
    "展開成立",
    "コース適性",
    "ST優位",
    "展示気配"
  ],
  "選定1レースは表示用の詳細理由を4件まで保持する"
);
assert.deepEqual(
  summary.runs[0].compared[0].evaluation.honmei.reasons,
  [],
  "比較一覧は詳細理由を重複保持しない"
);
assert.deepEqual(
  summary.runs[0].compared[0].evaluation.dataStatus,
  {
    stage: "final",
    label: "展示反映済み",
    completeness: 100
  },
  "比較一覧の完成状態は表示に必要な項目だけを保持する"
);
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
assert.deepEqual(
  summary.predictions[0].prediction.practicalTickets[0],
  {
    ticket: "1-2-3",
    category: "本線",
    displayCategory: "本線",
    scenarioType: "中心展開",
    amount: 100
  },
  "買い目は表示名を含む初期画面に必要な識別情報だけを保持する"
);
assert.equal(summary.predictions[0].prediction.oversized, undefined);
assert.equal(
  summary.predictions[0].prediction.practicalTickets[0].comment,
  undefined,
  "買い目の詳細理由は原本とnoteへ残し、軽量要約へ重複させない"
);

const staleFormationSummary = buildPredictionSummary({
  date: "20260813",
  predictions: [{
    raceKey: "20260813-21-8",
    prediction: {
      practicalTickets: [{
        ticket: "2-1-4",
        category: "流し",
        displayCategory: "流し",
        scenarioType: "流し展開",
        amount: 100
      }, {
        ticket: "2-3-1",
        category: "候補補完",
        displayCategory: "流し",
        scenarioType: "流し候補",
        amount: 100
      }]
    }
  }]
});
assert.deepEqual(
  staleFormationSummary.predictions[0].prediction.practicalTickets,
  [{
    ticket: "2-1-4",
    category: "流し",
    displayCategory: "フォーメーション",
    scenarioType: "フォーメーション",
    amount: 100
  }, {
    ticket: "2-3-1",
    category: "候補補完",
    displayCategory: "候補補完",
    scenarioType: "フォーメーション候補",
    amount: 100
  }],
  "旧保存形式からも表示用分類と展開名を正規化する"
);
assert.ok(
  Buffer.byteLength(JSON.stringify(summary)) < 20_000,
  "起動画面用の要約は20KB未満に保つ"
);

const maximumVenueSummary = buildPredictionSummary({
  date: "20260730",
  runs: [{
    checkedAt: "2026-07-30T08:00:00.000Z",
    threshold: 70,
    selected: true,
    best: summary.runs[0].best,
    collectionHealth: {
      targetCount: 24,
      savedCount: 24,
      complete: true,
      v2: {
        evaluatedCount: 24,
        readyCount: 24,
        qualifiedCount: 1,
        selectedCount: 1,
        missingReasons: []
      }
    },
    compared: Array.from(
      { length: 24 },
      (_, index) => ({
        jcd: String(index + 1).padStart(2, "0"),
        place: `第${index + 1}場`,
        raceNo: 12,
        deadlineAt: "2026-07-30T08:30:00.000Z",
        type: "8項目V2",
        score: 70 + index / 10,
        selectionReady: true,
        selectionStatus: "ready",
        evaluation: {
          ready: true,
          honmei: {
            score: 72,
            level: "高",
            reasons: [
              longReason,
              longReason
            ]
          },
          manshu: {
            score: 35,
            level: "低",
            reasons: [
              longReason,
              longReason
            ]
          },
          dataStatus: {
            stage: "final",
            label: "展示反映済み",
            completeness: 100,
            entryCount: 6,
            stCount: 6,
            exhibitionCount: 6
          }
        }
      })
    )
  }],
  predictions: [{
    selectedAt: "2026-07-30T08:00:01.000Z",
    selection: {
      evaluator: "shadow-selection-v2",
      score: 78,
      threshold: 70,
      ready: true,
      qualified: true,
      selected: true,
      legacy: {
        evaluation: {
          reasons: Array(100).fill(longReason)
        }
      }
    },
    prediction: {
      practicalTickets: Array.from(
        { length: 10 },
        (_, index) => ({
          ticket: `1-2-${(index % 4) + 3}`,
          category: "本線",
          scenarioType: "中心展開",
          amount: 100,
          comment: longReason,
          roleClaims: Array(20).fill({
            reason: longReason
          }),
          theoryClaims: Array(20).fill({
            reason: longReason
          })
        })
      )
    }
  }]
});

assert.equal(
  maximumVenueSummary.runs[0].compared.length,
  24
);
assert.ok(
  Buffer.byteLength(
    JSON.stringify(maximumVenueSummary)
  ) < 20_000,
  "24場・10買い目・長い根拠でも要約は20KB未満に保つ"
);

const quarantinedSummary =
  buildPredictionSummary({
    date: "20260801",
    runs: [{
      checkedAt:
        "2026-08-01T00:00:01Z",
      selected: true,
      best: {
        jcd: "23",
        raceNo: 2,
        score: 79
      },
      compared: [{
        jcd: "23",
        raceNo: 2,
        score: 79
      }]
    }],
    predictions: [{
      raceKey: "20260801-23-2",
      selectedAt:
        "2026-08-01T00:00:00Z",
      note: {
        path:
          "data/notes/20260801-23-02R.md"
      },
      prediction: {
        preRaceConditions: {
          boats: [
            "濱本優一",
            "末永祐輝",
            "島田一生",
            "竹内来",
            "梶原正",
            "加藤政彦"
          ].map(
            (racerName, index) => ({
              boatNo: index + 1,
              racerName
            })
          )
        },
        mainSheet: {
          taikou: {
            boatNo: 1,
            name: "梶原正"
          }
        }
      }
    }]
  });
assert.deepEqual(
  quarantinedSummary.predictions,
  [],
  "艇番不整合noteを軽量要約へ掲載しない"
);
assert.deepEqual(
  quarantinedSummary.runs,
  [],
  "艇番不整合レースを自動選定結果として掲載しない"
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
