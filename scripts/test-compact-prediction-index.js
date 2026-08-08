"use strict";

const assert = require("node:assert/strict");
const verification = require("../js/prediction-verification");
const { compactIndex } = require("./compact-prediction-index");

const prediction = {
  isRetrospective: false,
  practicalTickets: [{
    ticket: "2-1-3",
    category: "本線",
    categories: ["本線"],
    roleClaims: [{
      role: "attack",
      boatNo: 2,
      expectedPositions: [1]
    }]
  }],
  verificationEvidence: {
    roleSchemaVersion: 1,
    theorySchemaVersion: 1,
    theorySetFingerprint: "structured-ticket-support-v1:flow+holdPickup",
    generation: {
      logicFingerprint: "evaluated-scenarios-v1",
      confidenceDefinitionVersion: "internal-score-v1",
      ticketPolicyVersion: "practical-5-7-10-v1"
    },
    mainScenario: {
      label: "2差し本線",
      headBoatNo: 2,
      expectedWinningMethods: ["差し"]
    },
    roleClaims: [{
      role: "attack",
      boatNo: 2,
      expectedPositions: [1]
    }],
    theoryClaims: [{
      theoryKey: "flow",
      label: "展開",
      theoryVersion: "evaluated-scenarios-v1",
      formal: true,
      source: "structured-purchase-branch"
    }],
    tickets: [{
      ticket: "2-1-3",
      categories: ["本線"],
      selectionTier: "primary",
      roleClaims: [{
        role: "attack",
        boatNo: 2,
        expectedPositions: [1]
      }],
      theoryClaims: [{
        theoryKey: "flow",
        label: "展開",
        theoryVersion: "evaluated-scenarios-v1",
        formal: true,
        source: "structured-purchase-branch"
      }]
    }]
  }
};

const officialResult = {
  resultAvailable: true,
  winningMethod: "差し",
  trifecta: {
    combination: "2-1-3",
    payout: 1250,
    popularity: 4
  }
};

const before = verification.verifyPrediction(
  JSON.parse(JSON.stringify(prediction)),
  officialResult
);
const index = {
  predictions: [],
  verificationPredictions: [{
    raceKey: "20260807-12-1",
    isRetrospective: false,
    prediction: JSON.parse(JSON.stringify(prediction))
  }],
  runs: [{
    runKey: "20260808-1",
    selected: false,
    collectionHealth: {
      targetCount: 12,
      savedCount: 10,
      complete: false,
      targets: [
        { raceKey: "20260808-10-1", status: "saved" },
        { raceKey: "20260808-10-2", status: "pending" }
      ]
    }
  }]
};
compactIndex(index);
const compacted = index.verificationPredictions[0].prediction;
const after = verification.verifyPrediction(compacted, officialResult);

assert.equal(compacted.verificationEvidence.tickets, undefined);
assert.equal(compacted.isRetrospective, undefined, "外側と同値の重複フラグだけ削除する");
assert.equal(index.verificationPredictions[0].isRetrospective, false, "外側の正式値は保持する");
assert.equal(compacted.practicalTickets[0].selectionTier, "primary");
assert.deepEqual(
  compacted.practicalTickets[0].theoryClaims,
  prediction.verificationEvidence.tickets[0].theoryClaims
);
[
  "scenarioMatched",
  "practicalHit",
  "missType"
].forEach(key => assert.deepEqual(after[key], before[key], `${key}を維持する`));
assert.deepEqual(after.roleResults, before.roleResults, "役割評価を維持する");
assert.deepEqual(
  after.ticketCategoryResults,
  before.ticketCategoryResults,
  "券種別評価を維持する"
);
assert.deepEqual(
  verification.buildSummary([after]).theoryPerformanceSummary,
  verification.buildSummary([before]).theoryPerformanceSummary,
  "理論別実績帰属を維持する"
);

assert.equal(
  index.runs[0].collectionHealth.targets,
  undefined,
  "indexでは未使用のrun対象明細を削除する"
);
assert.equal(index.runs[0].collectionHealth.targetCount, 12, "run集計値は保持する");
assert.equal(index.runs[0].collectionHealth.savedCount, 10, "run保存件数は保持する");
assert.equal(index.runs[0].selected, false, "見送り判定は保持する");

const mismatch = {
  verificationPredictions: [{
    isRetrospective: true,
    prediction: { isRetrospective: false }
  }]
};
compactIndex(mismatch);
assert.equal(
  mismatch.verificationPredictions[0].prediction.isRetrospective,
  false,
  "値が異なる場合は削除しない"
);

console.log("prediction index compaction tests passed");
