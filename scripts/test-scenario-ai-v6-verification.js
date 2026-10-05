"use strict";

const assert = require("node:assert/strict");
const verifier = require("../js/scenario-ai-v6-verification");
const builder = require("./build-scenario-ai-v6-verification");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const archive = require("./daily-prediction-source-archive");

const snapshot = {
  version: "6.1.0-shadow",
  logicFingerprint: "scenario-ai-v6-multi-candidate-v1",
  inputSourceKind: "live-verification-evidence",
  scenarios: [
    { rank: 1, scenarioType: "escape", likelihood: 60, finishOrder: [1, 2, 4] },
    { rank: 2, scenarioType: "sashi", likelihood: 25, finishOrder: [2, 1, 4] },
    { rank: 3, scenarioType: "makuri", likelihood: 15, finishOrder: [3, 4, 1] }
  ]
};
const exact = verifier.verify(snapshot, {
  resultAvailable: true,
  trifecta: { combination: "2-1-4" },
  winningMethod: "差し"
});
assert.equal(exact.exactWithinCandidates, true);
assert.equal(exact.matchedRank, 2);
assert.equal(exact.topCandidateExact, false);
assert.equal(exact.scenarios[1].winningMethodMatch, true);
assert.equal(exact.logicFingerprint, snapshot.logicFingerprint);
assert.equal(exact.snapshotVersion, snapshot.version);
assert.equal(exact.inputSourceKind, snapshot.inputSourceKind);

const first = verifier.verify(snapshot, {
  resultAvailable: true,
  trifecta: { combination: "1-4-5" },
  winningMethod: "逃げ"
});
assert.equal(first.firstHitWithinCandidates, true);
assert.equal(first.topCandidateFirstHit, true);
assert.equal(first.topCandidateExact, false);
assert.ok(first.scenarios[0].breakReasons.length > 0);

const predictionData = {
  date: "20260802",
  verificationPredictions: [
    { raceKey: "20260802-01-1", selection: { score: 70 }, scenarioAiV6Shadow: snapshot },
    { raceKey: "20260802-01-2", selection: { score: 65 }, scenarioAiV6Shadow: snapshot }
  ]
};
const resultData = {
  date: "20260802",
  races: [
    { jcd: "01", raceNo: 1, resultAvailable: true, trifecta: { combination: "2-1-4" }, winningMethod: "差し" },
    { jcd: "01", raceNo: 2, resultAvailable: true, trifecta: { combination: "1-2-4" }, winningMethod: "逃げ" }
  ]
};
const built = builder.build(predictionData, resultData);
assert.equal(built.changed, true);
assert.equal(built.data.scenarioAiV6VerificationSummary.verifiedCount, 2);
assert.equal(built.data.scenarioAiV6VerificationSummary.exactWithinCandidatesCount, 2);
assert.equal(built.data.verificationPredictions[0].selection.score, 70);
assert.equal(built.data.verificationPredictions[0].scenarioAiV6Verification.usableForPrediction, false);
assert.equal(built.data.verificationPredictions[0].scenarioAiV6Verification.automaticApplication, false);

// Exercise the real entrypoint across midnight, then the same archive/restore
// boundary used between source collection and read-only diagnostics.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "scenario-verification-save-"));
try {
  for (const directory of ["predictions", "results"]) fs.mkdirSync(path.join(root, "data", directory), { recursive: true });
  const date = predictionData.date;
  const predictionPath = path.join(root, "data", "predictions", `${date}.json`);
  const original = JSON.stringify(predictionData);
  fs.writeFileSync(predictionPath, original);
  fs.writeFileSync(path.join(root, "data", "results", `${date}.json`), JSON.stringify(resultData));
  archive.archivePredictionSource({ rootDirectory: root, date, rawSaveLimitBytes: 1 });
  archive.restorePredictionSource({ rootDirectory: root, date });
  execFileSync(process.execPath, [path.join(__dirname, "build-scenario-ai-v6-verification.js"), "--recent"], {
    cwd: root, env: { ...process.env, COLLECT_DATE: "2026-08-03" }, stdio: "pipe"
  });
  const verified = JSON.parse(fs.readFileSync(predictionPath));
  assert.deepEqual(verified, built.data, "previous-day official results are verified when the run crosses midnight");
  archive.archivePredictionSource({ rootDirectory: root, date, rawSaveLimitBytes: 1 });
  fs.unlinkSync(predictionPath);
  archive.restorePredictionSource({ rootDirectory: root, date });
  assert.deepEqual(JSON.parse(fs.readFileSync(predictionPath)), built.data, "diagnostics restores the saved verification, not the old source");
  assert.equal(JSON.stringify(predictionData), original, "source prediction input remains unchanged");
  assert.deepEqual(verified.verificationPredictions.map(row => row.scenarioAiV6Shadow), predictionData.verificationPredictions.map(row => row.scenarioAiV6Shadow));
  assert.equal(builder.build(verified, resultData).changed, false, "repeated verification is stable");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("scenario AI v6 verification tests passed");
