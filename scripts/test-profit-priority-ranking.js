"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/profit-priority-ranking");

const root = path.resolve(__dirname, "..");

assert.equal(engine.numberOrNull(null), null);
assert.equal(engine.numberOrNull(undefined), null);
assert.equal(engine.numberOrNull(""), null);
assert.equal(engine.numberOrNull("0"), 0);

const report = { byTheory: [
  { theoryKey: "flow", label: "展開", raceCount: 100, useCount: 40, evaluatedCount: 40, recoveryRate: 55, practicalHitRate: 18, skipDecisionAccuracy: 72, hitRate: 16 },
  { theoryKey: "start", label: "ST", raceCount: 100, useCount: 40, evaluatedCount: 40, recoveryRate: 80, practicalHitRate: 10, skipDecisionAccuracy: 60, hitRate: 12 },
  { theoryKey: "wall", label: "壁艇", raceCount: 100, useCount: 20, evaluatedCount: 20, recoveryRate: 20, hitRate: 5 },
  { theoryKey: "course", label: "コース", raceCount: 100, useCount: 35, evaluatedCount: 35, recoveryRate: 90, practicalHitRate: null, skipDecisionAccuracy: null, hitRate: 14 }
]};

const result = engine.build(report);
assert.equal(result.status, "candidate-selected");
assert.equal(result.selectedTheory.theoryKey, "flow");
assert.equal(result.ranking.filter(row => row.selectedForImprovement).length, 1);
assert.equal(result.ranking.find(row => row.theoryKey === "wall").eligible, false);
const course = result.ranking.find(row => row.theoryKey === "course");
assert.deepEqual(course.missingMetrics, ["practicalHitRate", "skipDecisionAccuracy"]);
assert.equal(course.metrics.practicalHitRate, null);
assert.equal(course.metrics.skipDecisionAccuracy, null);
assert.equal(result.humanApprovalRequired, true);
assert.equal(result.automaticApplication, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.uiVisible, false);
assert.equal(engine.build({}).status, "collecting-data");

const closures = {
  closures: [{
    theoryKey: "flow",
    status: "terminal-rejected",
    reason: "固定A/Bで候補不採用",
    sourceFiles: ["a.json", "b.json"]
  }]
};
const advanced = engine.build(report, closures);
assert.equal(advanced.selectedTheory.theoryKey, "start");
const closed = advanced.ranking.find(row => row.theoryKey === "flow");
assert.equal(closed.eligible, true);
assert.equal(closed.eligibleForSelection, false);
assert.equal(closed.improvementCycleStatus, "terminal-rejected");
assert.equal(closed.improvementCycleReason, "固定A/Bで候補不採用");
assert.deepEqual(closed.improvementCycleSources, ["a.json", "b.json"]);
assert.equal(advanced.terminalClosedTheoryCount, 1);

const ignored = engine.build(report, {
  closures: [{ theoryKey: "flow", status: "collecting" }]
});
assert.equal(ignored.selectedTheory.theoryKey, "flow");

const configuredClosures = JSON.parse(fs.readFileSync(
  path.join(root, "config", "improvement-cycle-closures.json"),
  "utf8"
));
const frameClosure = configuredClosures.closures.find(
  row => row.theoryKey === "frame-rise-fall"
);
assert.equal(frameClosure.status, "terminal-rejected");
assert.equal(frameClosure.productionChanged, false);
assert.equal(frameClosure.automaticApplication, false);
assert.equal(frameClosure.sourceFiles.length, 2);
for (const sourceFile of frameClosure.sourceFiles) {
  const source = JSON.parse(fs.readFileSync(path.join(root, sourceFile), "utf8"));
  assert.equal(source.status, "candidate-fails-fixed-100");
  assert.equal(source.adoptionCandidate, false);
  const productionChanged = source.productionChanged === true || source.productionAUnchanged === false;
  assert.equal(productionChanged, false);
}

const remainPickupClosure = configuredClosures.closures.find(
  row => row.theoryKey === "remain-pickup"
);
assert.equal(remainPickupClosure.status, "terminal-rejected");
assert.equal(remainPickupClosure.productionChanged, false);
assert.equal(remainPickupClosure.automaticApplication, false);
assert.equal(remainPickupClosure.sourceFiles.length, 2);
const holdThirdSource = JSON.parse(fs.readFileSync(
  path.join(root, "data", "stats", "remain-pickup-hold3-shadow-ab-report.json"),
  "utf8"
));
assert.equal(holdThirdSource.productionAUnchanged, true);
assert.equal(holdThirdSource.automaticApplication, false);
assert.equal(holdThirdSource.B.hitCount < holdThirdSource.A.hitCount, true);
assert.equal(holdThirdSource.B.recoveryRate < holdThirdSource.A.recoveryRate, true);
const sameStakeSource = JSON.parse(fs.readFileSync(
  path.join(root, "data", "stats", "remain-pickup-same-stake-shadow-report.json"),
  "utf8"
));
assert.equal(sameStakeSource.status, "candidate-fails-retrospective-holdout-100");
assert.equal(sameStakeSource.adoptionCandidate, false);
assert.equal(sameStakeSource.productionChanged, false);
assert.equal(sameStakeSource.ticketCount, 7);
assert.equal(sameStakeSource.methodology.sameStake, true);

console.log("Profit priority ranking: 合格");
