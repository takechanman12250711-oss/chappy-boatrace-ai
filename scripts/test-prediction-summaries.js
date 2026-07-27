"use strict";

const assert = require("node:assert/strict");
const {
  buildPredictionSummary
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
        { length: 9 },
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
assert.equal(summary.predictions.length, 1);
assert.equal(summary.predictions[0].prediction.practicalTickets.length, 7);
assert.equal(summary.predictions[0].prediction.oversized, undefined);
assert.ok(
  Buffer.byteLength(JSON.stringify(summary)) < 20_000,
  "起動画面用の要約は20KB未満に保つ"
);

console.log("軽量予想要約テスト: 合格");
