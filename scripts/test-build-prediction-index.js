"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPredictionIndex } = require("./build-prediction-index");
const autoStats = require("../js/auto-stats");
const verification = require("../js/prediction-verification");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-prediction-index-"));

try {
  fs.writeFileSync(path.join(directory, "20260721.json"), JSON.stringify({
    date: "20260721",
    runs: [{ checkedAt: "2026-07-21T01:00:00Z", selected: false }],
    predictions: []
  }));
  const richVerification = {
    raceKey: "20260722-12-1",
    date: "20260722",
    jcd: "12",
    place: "住之江",
    raceNo: 1,
    deadlineAt:
      "2026-07-22T10:00:00+09:00",
    selectedAt: "2026-07-22T01:00:02Z",
    verificationMode: "shadow",
    scoreBand: "under_70",
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 66,
      threshold: 70,
      ready: true,
      qualified: false,
      selected: false,
      status: "ready",
      eligibilityReasonCodes: []
    },
    shadowV2Reference: {
      recordKey:
        "20260722-12-1:logic-a:reference-a:config-a",
      cohortKey:
        "logic-a:reference-a:shadow-selection-v2.0.0:config-a",
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      logicFingerprint:
        "logic-a",
      theoryInputVersion:
        "theory-input-v1.0.0",
      capturedAt:
        "2026-07-22T01:00:02Z",
      totalScore: 66
    },
    prediction: {
      raceFlow: {
        title: "2差し本線",
        summary: "2号艇の差し",
        oversized: "削除"
      },
      mainSheet: {
        honmei: {
          boatNo: 2,
          name: "本命",
          buffs: ["削除"]
        },
        tickets: [{
          ticket: "2-1-3"
        }]
      },
      manshuSheet: {
        oversized: true
      },
      practicalTickets: [{
        ticket: "2-1-3",
        category: "本線",
        categories: ["本線"],
        comment:
          "日次JSONだけに残す長い説明",
        roleClaims: [{
          role: "attack",
          boatNo: 2,
          expectedPositions: [1],
          oversized: true
        }]
      }],
      verificationEvidence: {
        roleSchemaVersion: 1,
        theorySchemaVersion: 1,
        theorySetFingerprint:
          "structured-ticket-support-v1:flow+holdPickup",
        generation: {
          logicFingerprint:
            "evaluated-scenarios-v1",
          confidenceDefinitionVersion:
            "internal-score-v1",
          ticketPolicyVersion:
            "practical-5-7-10-v1"
        },
        mainScenario: {
          label: "2差し本線",
          headBoatNo: 2,
          expectedWinningMethods: [
            "差し"
          ]
        },
        roleClaims: [{
          role: "attack",
          boatNo: 2,
          expectedPositions: [1]
        }],
        theoryClaims: [{
          theoryKey: "flow",
          label: "展開",
          theoryVersion:
            "evaluated-scenarios-v1",
          formal: true,
          source:
            "structured-purchase-branch"
        }],
        tickets: [{
          ticket: "2-1-3",
          categories: ["本線"],
          roleClaims: [{
            role: "attack",
            boatNo: 2,
            expectedPositions: [1]
          }],
          theoryClaims: [{
            theoryKey: "flow",
            label: "展開",
            theoryVersion:
              "evaluated-scenarios-v1",
            formal: true,
            source:
              "structured-purchase-branch"
          }],
          branchIds: [
            "daily-only-branch"
          ]
        }],
        allCandidates: [{
          oversized: true
        }]
      },
      internalEvaluation: {
        mode: "main",
        label: "内部指数",
        score: 66,
        probability: false,
        reasons: ["日次だけ"]
      },
      preRaceConditions: {
        officialResultUsed: false,
        newEngineMode: false,
        weather: {
          windSpeed: 3,
          waveHeight: 2,
          venueTideInfluence: 20,
          oversized: true
        },
        boats: [{
          boatNo: 2,
          exhibitionST: 0.08,
          currentST: 0.12,
          avgST: 0.14,
          exhibitionTime: 6.71,
          className: "A1",
          nationalWinRate: 7.1,
          motor2Rate: 42,
          oversized: true
        }],
        dataAvailability: {
          oversized: true
        }
      }
    },
    result: {
      settled: true,
      resultTicket: "2-1-3",
      winningMethod: "差し",
      payout: 1250,
      popularity: 4,
      finishers: [],
      starts: [],
      settledAt:
        "2026-07-22T02:00:00Z",
      verification: {
        schemaVersion: 5,
        supportIdentity: {
          roleSchemaVersion: 1,
          theorySchemaVersion: 1,
          theorySetFingerprint:
            "structured-ticket-support-v1:flow+holdPickup",
          generation: {
            logicFingerprint:
              "evaluated-scenarios-v1",
            confidenceDefinitionVersion:
              "internal-score-v1",
            ticketPolicyVersion:
              "practical-5-7-10-v1"
          },
          evaluator:
            "shadow-selection-v2",
          evaluatorVersion:
            "shadow-selection-v2.0.0",
          selectorCohortKey:
            "logic-a:reference-a:shadow-selection-v2.0.0:config-a",
          logicFingerprint:
            "logic-a",
          theoryInputVersion:
            "theory-input-v1.0.0"
        },
        verificationInputFingerprint:
          "fingerprint-1234",
        scenarioVerification: {
          status: "matched"
        },
        oversized: true
      }
    }
  };
  const dayData = {
    date: "20260722",
    runs: [{
      checkedAt: "2026-07-22T01:00:00Z",
      selected: true,
      collectionHealth: {
        targetCount: 1,
        savedCount: 1,
        targets: [{ raceKey: "20260722-08-1", status: "saved" }]
      }
    }],
    predictions: [{ raceKey: "20260722-08-1", selectedAt: "2026-07-22T01:00:01Z" }],
    verificationPredictions: [
      { raceKey: "20260722-08-1", selectedAt: "2026-07-22T01:00:01Z", scoreBand: "70_plus" },
      richVerification
    ],
    shadowV2Predictions: [{
      recordKey: "20260722-12-1:logic-a:config-a",
      raceKey: "20260722-12-1",
      capturedAt: "2026-07-22T01:00:03Z",
      complete: true,
      calibrationEligible: true,
      evaluation: {
        totalScore: 61.2,
        components: [{
          key: "flow",
          score: 80,
          formal: true,
          reasons: ["日次だけに保持"],
          detail: {
            oversized: true
          }
        }]
      },
      versions: {
        logicFingerprint: "logic-a"
      },
      snapshot: {
        boats: [{ boatNo: 1, avgST: 0.13 }]
      },
      predictionReference: {
        practicalTickets: [{
          ticket: "1-2-3"
        }]
      }
    }]
  };
  fs.writeFileSync(
    path.join(
      directory,
      "20260722.json"
    ),
    JSON.stringify(dayData)
  );
  fs.writeFileSync(path.join(directory, "index.json"), "{}");

  const index = buildPredictionIndex(directory);
  assert.equal(index.sourceFileCount, 2);
  assert.equal(index.schemaVersion, 4);
  assert.equal(index.runs.length, 2);
  assert.equal(index.runs[0].date, "20260722");
  assert.equal(index.runs[0].collectionHealth.savedCount, 1);
  assert.equal(index.runs[0].collectionHealth.targets[0].status, "saved");
  assert.equal(index.predictions.length, 1);
  assert.equal(index.predictions[0].raceKey, "20260722-08-1");
  assert.equal(index.verificationPredictions.length, 2);
  assert.equal(index.verificationPredictions[0].raceKey, "20260722-12-1");
  assert.equal(index.verificationPredictions[0].prediction.raceFlow.title, "2差し本線");
  assert.equal(index.verificationPredictions[0].prediction.mainSheet.honmei.boatNo, 2);
  assert.deepEqual(
    index
      .verificationPredictions[0]
      .shadowV2Reference,
    {
      recordKey:
        "20260722-12-1:logic-a:reference-a:config-a",
      cohortKey:
        "logic-a:reference-a:shadow-selection-v2.0.0:config-a",
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      logicFingerprint:
        "logic-a",
      theoryInputVersion:
        "theory-input-v1.0.0"
    },
    "軽量indexでも評価器・入力正規化世代を監査できる参照を保持する"
  );
  assert.equal(index.verificationPredictions[0].prediction.manshuSheet, undefined);
  assert.equal(index.verificationPredictions[0].prediction.mainSheet.tickets, undefined);
  assert.equal(
    index
      .verificationPredictions[0]
      .prediction
      .practicalTickets[0]
      .comment,
    undefined,
    "説明全文は日次JSONに保持し、集約indexへ重複させない"
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .prediction
      .verificationEvidence
      .tickets[0]
      .branchIds,
    undefined,
    "branch IDは日次JSONだけに保持し、軽量indexへ重複させない"
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .prediction
      .verificationEvidence
      .allCandidates,
    undefined
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .prediction
      .preRaceConditions
      .boats[0]
      .nationalWinRate,
    7.1
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .result
      .scenarioVerification
      .status,
    "matched"
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .result
      .verificationInputFingerprint,
    "fingerprint-1234",
    "軽量indexでも照合済み支持根拠のfingerprintを保持する"
  );
  assert.equal(
    index
      .verificationPredictions[0]
      .result
      .supportIdentity
      .selectorCohortKey,
    "logic-a:reference-a:shadow-selection-v2.0.0:config-a",
    "軽量indexでも照合結果の支持根拠世代を監査できる"
  );
  assert.equal(index.shadowV2Predictions.length, 1);
  assert.equal(
    index.shadowV2Predictions[0].recordKey,
    "20260722-12-1:logic-a:config-a"
  );
  assert.equal(
    index.shadowV2Predictions[0].calibrationEligible,
    true
  );
  assert.equal(
    index.shadowV2Predictions[0].evaluation.totalScore,
    61.2
  );
  assert.equal(
    index.shadowV2Predictions[0].snapshot,
    undefined,
    "完全スナップショットは日次JSONだけに保持する"
  );
  assert.equal(
    index.shadowV2Predictions[0]
      .predictionReference,
    undefined
  );
  assert.equal(
    index.shadowV2Predictions[0]
      .evaluation.components[0]
      .reasons,
    undefined,
    "集約indexはV2要約だけにする"
  );

  const compactRecord =
    index.verificationPredictions[0];
  const officialResult = {
    resultAvailable: true,
    winningMethod: "差し",
    trifecta: {
      combination: "2-1-3",
      payout: 1250,
      popularity: 4
    }
  };
  const fullVerification =
    verification.verifyPrediction(
      richVerification.prediction,
      officialResult
    );
  const compactVerification =
    verification.verifyPrediction(
      compactRecord.prediction,
      officialResult
    );
  [
    "scenarioMatched",
    "practicalHit",
    "missType"
  ].forEach(key => {
    assert.deepEqual(
      compactVerification[key],
      fullVerification[key],
      `${key}は集約index圧縮後も一致する`
    );
  });
  assert.deepEqual(
    compactVerification.roleResults,
    fullVerification.roleResults
  );
  assert.deepEqual(
    compactVerification
      .supportIdentity,
    fullVerification
      .supportIdentity,
    "軽量indexでも予想時点の支持根拠世代を同一に再現する"
  );
  assert.deepEqual(
    verification.buildSummary([
      compactVerification
    ]).theoryPerformanceSummary,
    verification.buildSummary([
      fullVerification
    ]).theoryPerformanceSummary,
    "軽量indexでも理論版・出典別の実績帰属を同一に再現する"
  );
  assert.deepEqual(
    compactVerification
      .ticketCategoryResults,
    fullVerification
      .ticketCategoryResults
  );

  const normalized =
    autoStats.normalizeIndex(index);
  const normalizedRow =
    normalized.predictions.find(
      row =>
        row.raceKey ===
        richVerification.raceKey
    );
  assert.ok(normalizedRow);
  assert.equal(
    normalizedRow
      .practicalTickets[0]
      .ticket,
    "2-1-3"
  );
  assert.equal(
    normalized.results.find(
      row =>
        row.raceKey ===
        richVerification.raceKey
    )?.result,
    "2-1-3"
  );
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("自動予想索引テスト: 合格");
