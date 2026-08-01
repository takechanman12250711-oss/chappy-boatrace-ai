"use strict";

const assert = require("node:assert");
const collector = require("./collect-predictions");

const item = {
  jcd: "03",
  place: "江戸川",
  raceNo: 1,
  deadlineAt: "2026-08-01T12:00:00+09:00",
  capturedAt: "2026-08-01T11:30:00+09:00",
  raceData: {},
  rawRaceData: {},
  shadowRaceData: {},
  type: "本線",
  score: 82,
  evaluation: { ready: true }
};

const prediction = {
  aiCore: {
    raceScenarios: {
      scenarios: [
        { type: "inEscape", label: "1逃げ", score: 84 },
        { type: "course2Sashi", label: "2差し", score: 72 },
        { type: "course3Attack", label: "3攻め", score: 64 },
        { type: "course4Kado", label: "4カド", score: 58 }
      ]
    }
  },
  mainSheet: {},
  raceFlow: {},
  confidence: { score: 82 }
};

const record = collector.buildStoredPrediction(
  "20260801",
  item,
  false,
  item.capturedAt,
  {
    createPrediction: () => JSON.parse(JSON.stringify(prediction)),
    createPracticalSelection: () => ["1-2-3"],
    shadowBuilder: () => null,
    scenarioLikelihoodAnalyzer: require("../js/scenario-likelihood-v5").analyze
  }
);

assert.ok(record.scenarioLikelihoodV5);
assert.strictEqual(record.scenarioLikelihoodV5.status, "shadow-only");
assert.strictEqual(record.scenarioLikelihoodV5.usableForPurchase, false);
assert.strictEqual(record.scenarioLikelihoodV5.leader.key, "inEscape");
assert.strictEqual(record.scenarioLikelihoodV5.runnerUp.key, "course2Sashi");
assert.strictEqual(record.scenarioLikelihoodV5.scenarios.length, 4);
assert.deepStrictEqual(record.prediction.practicalTickets, ["1-2-3"]);
assert.strictEqual(record.selection.selected, false);

const failed = collector.safelyAnalyzeScenarioLikelihoodV5(
  prediction,
  () => { throw new Error("forced"); }
);
assert.strictEqual(failed.status, "analysis-failed");
assert.strictEqual(failed.usableForPurchase, false);

console.log("scenario likelihood v5 storage tests passed");
