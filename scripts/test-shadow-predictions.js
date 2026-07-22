"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  MIN_SCORE,
  buildVerificationPredictions,
  saveRun,
  upsertByRaceKey
} = require("./collect-predictions");

const originalCreatePrediction = global.createPrediction;
const originalCreatePracticalSelection =
  global.ChappyNoteGenerator.createPracticalSelection;

try {
  global.createPrediction = raceData => ({
    version: "test",
    raceFlow: { title: raceData.title },
    mainSheet: { honmei: { boatNo: 1 } },
    ticketRanks: [{ ticket: "1-2-3", role: "本命" }]
  });
  global.ChappyNoteGenerator.createPracticalSelection = () => [
    { ticket: "1-2-3", category: "本線" }
  ];

  const comparison = [
    {
      jcd: "08",
      place: "常滑",
      raceNo: 1,
      deadlineAt: "2026-07-22T01:00:00Z",
      type: "本線",
      score: MIN_SCORE,
      evaluation: { ready: true },
      raceData: { title: "1逃げ本線" }
    },
    {
      jcd: "08",
      place: "常滑",
      raceNo: 2,
      deadlineAt: "2026-07-22T01:30:00Z",
      type: "波乱",
      score: 69.9,
      evaluation: { ready: true },
      raceData: { title: "3コース攻め" }
    }
  ];

  const records = buildVerificationPredictions(
    "20260722",
    comparison,
    ""
  );
  assert.equal(records.candidatePredictions.length, 1);
  assert.equal(records.shadowPredictions.length, 1);
  assert.equal(records.candidatePredictions[0].selectionClass, "qualified");
  assert.equal(records.shadowPredictions[0].selectionClass, "shadow");
  assert.equal(records.shadowPredictions[0].verificationOnly, true);
  assert.equal(
    records.shadowPredictions[0].prediction.predictionMode,
    "server_shadow_pre_deadline"
  );
  assert.equal(records.shadowPredictions[0].note, undefined);

  const updated = upsertByRaceKey(
    [{ raceKey: "20260722-08-2", capturedAt: "old" }],
    [{ raceKey: "20260722-08-2", capturedAt: "new" }]
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].capturedAt, "new");

  const originalCwd = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-shadow-"));
  try {
    process.chdir(directory);
    const shadow = records.shadowPredictions[0];
    const candidate = { ...shadow, selectionClass: "qualified" };
    saveRun("20260722", comparison, null, [], [shadow]);
    saveRun("20260722", comparison, null, [candidate], []);
    let saved = JSON.parse(fs.readFileSync(
      path.join(directory, "data", "predictions", "20260722.json"),
      "utf8"
    ));
    assert.equal(saved.shadowPredictions.length, 0);
    assert.equal(saved.candidatePredictions.length, 1);

    saveRun("20260722", comparison, {
      ...candidate,
      selectedAt: candidate.capturedAt
    }, [], []);
    saved = JSON.parse(fs.readFileSync(
      path.join(directory, "data", "predictions", "20260722.json"),
      "utf8"
    ));
    assert.equal(saved.predictions.length, 1);
    assert.equal(saved.candidatePredictions.length, 0);
    assert.equal(saved.shadowPredictions.length, 0);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  }
} finally {
  global.createPrediction = originalCreatePrediction;
  global.ChappyNoteGenerator.createPracticalSelection =
    originalCreatePracticalSelection;
}

console.log("シャドー予想保存テスト: 合格");
