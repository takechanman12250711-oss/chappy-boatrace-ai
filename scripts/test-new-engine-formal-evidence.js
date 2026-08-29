"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const finalTotalCoefficients = {
  raceFlow: 0.25,
  courseIndex: 0.24,
  roleAttack: 0.11,
  st: 0.10,
  exhibition: 0.09,
  roleHold: 0.08,
  rolePickup: 0.03,
  local: 0.05,
  turn: 0.025,
  national: 0.02,
  motor: 0.005
};
const adjustmentValues = {
  motorIndexDeviationFrom50Multiplier: 0.45,
  raceFlowStThresholdInclusive: 72,
  raceFlowStBonus: 3,
  raceFlowTurnThresholdInclusive: 72,
  raceFlowTurnBonus: 3
};

function effectiveScoreContract(applied = true) {
  return {
    version: "ai-core-effective-score-contract-v1",
    scope: "aiCore.analyses[].indexes.total",
    finalTotalCoefficients: { ...finalTotalCoefficients },
    newEngineAdjustments: {
      applied,
      modeSource: applied
        ? "ai-core-new-environment-theory-v1"
        : "",
      ...adjustmentValues
    }
  };
}

function canonicalAiCore(theory) {
  return {
    newEnvironmentTheory: theory,
    analyses: Array.from({ length: 6 }, (_, index) => ({
      boatNo: index + 1,
      indexes: { total: 80 - index }
    }))
  };
}

function newEnginePrediction() {
  const theory = {
    isActive: true,
    source: "ai-core-new-environment-theory-v1"
  };
  return {
    flowPriority: { attackBoatNo: 4 },
    newEnvironmentTheory: theory,
    aiCore: canonicalAiCore(theory),
    motorEngineSupport: {
      mode: "new-engine",
      newEngineMode: true,
      centerBoatNo: 4,
      effectiveScoreContract: effectiveScoreContract(true),
      confirmations: [
        "新エンジン期は展示・今節ST・技量を優先",
        "4号艇は展示気配を最終確認"
      ],
      cautions: ["モーター実績の比重を下げて過信しない"]
    }
  };
}

const prediction = newEnginePrediction();
const evidence = snapshot.newEngineEvidence(prediction);
assert.equal(
  evidence.formal,
  true,
  "実計算モード・6艇実採点・実効採点契約が一致する場合だけ正式証拠にする"
);
assert.equal(evidence.scoreContractMatches, true);
assert.equal(evidence.actualModeApplied, true);
assert.equal(evidence.scoredAiCoreVerified, true);
assert.equal(evidence.scoredBoatCount, 6);

const claim = snapshot.newEngineClaimForTicket(prediction, "1-4-3");
assert.ok(claim);
assert.equal(claim.theoryKey, "newEngine");
assert.equal(
  claim.theoryVersion,
  "motor-engine-new-engine-mode-v2-effective-score-contract"
);
assert.equal(
  snapshot.newEngineClaimForTicket(prediction, "1-2-3"),
  null,
  "中心艇を含まない買い目へ水増し帰属しない"
);

const diagnostics = snapshot.buildEvidenceDiagnostics(prediction)
  .rows.find(row => row.theoryKey === "new-engine");
assert.equal(diagnostics.formal, true);
assert.equal(
  diagnostics.metrics.scoreContractVersion,
  "ai-core-effective-score-contract-v1"
);
assert.equal(
  diagnostics.metrics.scoreScope,
  "aiCore.analyses[].indexes.total"
);
assert.equal(diagnostics.metrics.scoredAiCoreVerified, true);
assert.equal(diagnostics.metrics.scoredBoatCount, 6);
assert.deepEqual(
  diagnostics.metrics.finalTotalCoefficients,
  finalTotalCoefficients
);
assert.deepEqual(
  Object.fromEntries(
    Object.keys(adjustmentValues).map(key => [
      key,
      diagnostics.metrics.newEngineAdjustments[key]
    ])
  ),
  adjustmentValues,
  "保存スナップショットから実際の新エンジン補正を監査できる"
);

const normal = newEnginePrediction();
normal.newEnvironmentTheory.isActive = false;
normal.aiCore.newEnvironmentTheory.isActive = false;
normal.motorEngineSupport.mode = "normal";
normal.motorEngineSupport.newEngineMode = false;
normal.motorEngineSupport.effectiveScoreContract =
  effectiveScoreContract(false);
assert.equal(
  snapshot.newEngineEvidence(normal).formal,
  false,
  "通常期を新エンジン理論へ帰属しない"
);

const wrongCoefficient = newEnginePrediction();
wrongCoefficient.motorEngineSupport.effectiveScoreContract
  .finalTotalCoefficients.motor = 0.05;
assert.equal(
  snapshot.newEngineEvidence(wrongCoefficient).formal,
  false,
  "実効最終係数と異なる契約を正式証拠にしない"
);

const wrongAdjustment = newEnginePrediction();
wrongAdjustment.motorEngineSupport.effectiveScoreContract
  .newEngineAdjustments.motorIndexDeviationFrom50Multiplier = 1;
assert.equal(
  snapshot.newEngineEvidence(wrongAdjustment).formal,
  false,
  "実際にない新エンジン補正を正式証拠にしない"
);

const topLevelOnly = newEnginePrediction();
delete topLevelOnly.aiCore;
assert.equal(
  snapshot.newEngineEvidence(topLevelOnly).formal,
  false,
  "トップレベル互換フィールドだけでは正式証拠にしない"
);

const missingScores = newEnginePrediction();
missingScores.aiCore.analyses = [];
const missingScoreEvidence =
  snapshot.newEngineEvidence(missingScores);
assert.equal(
  missingScoreEvidence.formal,
  false,
  "AIコアの6艇実採点がなければ正式証拠にしない"
);
assert.equal(
  missingScoreEvidence.scoredAiCoreVerified,
  false
);
assert.ok(
  snapshot.buildEvidenceDiagnostics(missingScores)
    .rows.find(row => row.theoryKey === "new-engine")
    .missingReasons.includes(
      "ai-core-effective-score-result-missing"
    )
);

const invalidScores = newEnginePrediction();
invalidScores.aiCore.analyses[5].indexes.total = null;
assert.equal(
  snapshot.newEngineEvidence(invalidScores).formal,
  false,
  "有限数でない実採点を正式証拠にしない"
);

const legacyWeightsOnly = newEnginePrediction();
delete legacyWeightsOnly.motorEngineSupport.effectiveScoreContract;
legacyWeightsOnly.motorEngineSupport.weights = {
  st: 0.22,
  exhibition: 0.23,
  motor: 0.05,
  local: 0.14,
  skill: 0.10,
  attack: 0.14,
  raceFlow: 0.08,
  turn: 0.04
};
const legacyEvidence =
  snapshot.newEngineEvidence(legacyWeightsOnly);
assert.equal(
  legacyEvidence.formal,
  false,
  "旧weight profileを実効採点契約として扱わない"
);
assert.equal(
  legacyEvidence.legacyWeightProfilePresent,
  true,
  "旧形式は例外なく識別して読み取れる"
);
const legacyDiagnostics =
  snapshot.buildEvidenceDiagnostics(legacyWeightsOnly)
    .rows.find(row => row.theoryKey === "new-engine");
assert.ok(
  legacyDiagnostics.missingReasons.includes(
    "effective-score-contract-missing"
  )
);
assert.ok(
  legacyDiagnostics.missingReasons.includes(
    "legacy-weight-profile-not-formal"
  )
);

console.log("new engine formal evidence tests passed");
