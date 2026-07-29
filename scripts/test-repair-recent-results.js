// scripts/test-repair-recent-results.js
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeDateKey,
  getRecentDateKeys,
  isCompleteResultFile,
  hasUnsettledPredictions,
  hasMatchableUnsettledPredictions,
  hasPredictionsNeedingResultUpdate,
  refreshOfficialResultFile
} = require("./repair-recent-results");
const {
  verificationInputFingerprint
} = require("./match-predictions");

assert.equal(normalizeDateKey("2026-07-22"), "20260722");
assert.deepEqual(
  getRecentDateKeys("20260301"),
  ["20260227", "20260228", "20260301"]
);

const tempDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "repair-recent-results-")
);
const resultPath = path.join(tempDirectory, "20260720.json");
const predictionPath = path.join(tempDirectory, "predictions.json");

fs.writeFileSync(resultPath, JSON.stringify({
  source: "boatrace-official",
  date: "20260720",
  raceCount: 156,
  completedRaces: 156,
  pendingRaces: 0,
  failedRaces: 0,
  complete: true
}));
assert.equal(isCompleteResultFile(resultPath, "20260720"), true);
const refreshCalls = [];
const unchangedRefresh =
  refreshOfficialResultFile(
    resultPath,
    "20260720",
    (scriptName, args) => {
      refreshCalls.push({
        scriptName,
        args
      });
    }
  );
assert.deepEqual(
  refreshCalls,
  [{
    scriptName:
      "collect-results.js",
    args: [
      "--date=20260720"
    ]
  }],
  "完成済みでも公式訂正確認を実行する"
);
assert.deepEqual(
  unchangedRefresh,
  {
    wasComplete: true,
    changed: false
  },
  "変更がなければ再集計対象にしない"
);
const correctedRefresh =
  refreshOfficialResultFile(
    resultPath,
    "20260720",
    () => {
      const corrected =
        JSON.parse(
          fs.readFileSync(
            resultPath,
            "utf8"
          )
        );
      corrected.correctionTest =
        true;
      fs.writeFileSync(
        resultPath,
        JSON.stringify(
          corrected
        )
      );
    }
  );
assert.deepEqual(
  correctedRefresh,
  {
    wasComplete: true,
    changed: true
  },
  "公式訂正があれば再集計対象にする"
);

fs.writeFileSync(resultPath, JSON.stringify({
  source: "boatrace-official",
  date: "20260720",
  raceCount: 156,
  completedRaces: 0,
  pendingRaces: 156,
  failedRaces: 0,
  complete: false
}));
assert.equal(isCompleteResultFile(resultPath, "20260720"), false);

fs.writeFileSync(resultPath, JSON.stringify({
  source: "boatrace-official",
  date: "20260720",
  raceCount: 144,
  completedRaces: 142,
  pendingRaces: 2,
  failedRaces: 0,
  complete: false,
  races: [{
    jcd: "24",
    raceNo: 11,
    resultAvailable: true,
    trifecta: {
      combination: "1-2-3",
      payout: 1230,
      popularity: 4
    },
    winningMethod: "逃げ"
  }, {
    jcd: "24",
    raceNo: 12,
    resultAvailable: false
  }]
}));

fs.writeFileSync(predictionPath, JSON.stringify({
  predictions: [],
  verificationPredictions: [
    { raceKey: "20260720-24-11" }
  ]
}));
assert.equal(hasUnsettledPredictions(predictionPath), true);
assert.equal(
  hasMatchableUnsettledPredictions(
    predictionPath,
    resultPath
  ),
  true,
  "日全体が未完成でも、取得済みレースの事前予想は照合する"
);

const fullyMatchedPrediction = {
  raceKey: "20260720-24-11",
  prediction: {
    practicalTickets: [{
      ticket: "1-2-3"
    }]
  },
  result: {
    settled: true,
    resultTicket: "1-2-3",
    payout: 1230,
    popularity: 4,
    winningMethod: "逃げ",
    finishers: [],
    starts: []
  }
};
fullyMatchedPrediction
  .result
  .verificationInputFingerprint =
    verificationInputFingerprint(
      fullyMatchedPrediction
    );
fs.writeFileSync(predictionPath, JSON.stringify({
  predictions: [
    fullyMatchedPrediction
  ],
  verificationPredictions: []
}));
assert.equal(hasUnsettledPredictions(predictionPath), false);
assert.equal(
  hasMatchableUnsettledPredictions(
    predictionPath,
    resultPath
  ),
  false
);

fullyMatchedPrediction
  .prediction
  .verificationEvidence = {
    roleSchemaVersion: 1
  };
fs.writeFileSync(predictionPath, JSON.stringify({
  predictions: [
    fullyMatchedPrediction
  ],
  verificationPredictions: []
}));
assert.equal(
  hasPredictionsNeedingResultUpdate(
    predictionPath,
    resultPath
  ),
  true,
  "公式結果が同一でも予想時点の支持根拠が変われば再照合する"
);

const enrichedResults =
  JSON.parse(
    fs.readFileSync(
      resultPath,
      "utf8"
    )
  );
enrichedResults.races[0]
  .finishers = [
    {
      rank: 1,
      boatNo: 1
    }
  ];
enrichedResults.races[0]
  .starts = [
    {
      boatNo: 1,
      st: 0.12
    }
  ];
fs.writeFileSync(
  resultPath,
  JSON.stringify(
    enrichedResults
  )
);
assert.equal(
  hasPredictionsNeedingResultUpdate(
    predictionPath,
    resultPath
  ),
  true,
  "後から着順・ST明細が補完された結果も再照合する"
);

fs.writeFileSync(
  predictionPath,
  JSON.stringify({
    predictions: [{
      raceKey:
        "20260720-24-11",
      result: {
        settled: true,
        resultTicket:
          "1-3-2",
        payout: 900,
        popularity: 5,
        winningMethod:
          "差し"
      }
    }],
    verificationPredictions:
      []
  })
);
assert.equal(
  hasPredictionsNeedingResultUpdate(
    predictionPath,
    resultPath
  ),
  true,
  "公式訂正と保存済み照合結果の差を再照合対象にする"
);

fs.rmSync(tempDirectory, { recursive: true, force: true });

console.log("直近3日間の結果自動復旧・予想照合テストに合格しました");
