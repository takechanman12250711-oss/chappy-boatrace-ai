"use strict";

const assert = require("node:assert/strict");
const api = require("../js/theory-performance-report");
const builder = require("./build-theory-performance-report");

const catalog = [
  ["race-flow", "展開理論"], ["course", "コース理論"], ["start", "ST・スリット理論"],
  ["exhibition", "展示・足理論"], ["remain-pickup", "残し・拾い理論"], ["local-water", "当地・水面理論"],
  ["skill", "技量理論"], ["motor", "モーター理論"], ["wall-boat", "壁艇理論"],
  ["frame-rise-fall", "枠別浮沈率"], ["double-time", "ダブルタイム"], ["new-engine", "新エンジン理論"]
];
function evaluations(usedKey, matched, tickets) { return catalog.map(([theoryKey, label]) => ({ theoryKey, label, status: theoryKey === usedKey ? "evaluated" : "not-used", used: theoryKey === usedKey, matched: theoryKey === usedKey ? matched : null, tickets: theoryKey === usedKey ? tickets : [] })); }
const records = [
  { raceKey: "20260802-20-8", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "bet-candidate" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", true, ["1-4-3", "1-2-4"]) }, result: { settled: true, resultTicket: "1-4-3", payout: 1240, practicalHit: true, verification: { scenarioHit: true } } },
  { raceKey: "20260802-20-9", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "skip" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", false, ["1-3-4"]) }, result: { settled: true, resultTicket: "2-1-4", payout: 3000, practicalHit: false, verification: { scenarioHit: false } } },
  { raceKey: "20260802-20-10", jcd: "20", place: "若松", prediction: { skipAiDisplay: { decision: "caution" } }, theoryEvaluationSnapshot: { evaluations: evaluations("wall-boat", false, ["1-3-4"]) }, result: { settled: true, resultTicket: "3-1-4", payout: 900, review: { practicalHit: false }, verification: { scenarioHit: false } } }
];
const result = api.build(records);
assert.equal(result.version, "3.4.0");
assert.equal(result.theoryCount, 12);
assert.equal(result.byTheory.length, 12);
assert.equal(result.sampleCount, 36);
const wall = result.byTheory.find(row => row.theoryKey === "wall-boat");
assert.equal(wall.raceCount, 3); assert.equal(wall.useCount, 3); assert.equal(wall.evaluatedCount, 3); assert.equal(wall.hitCount, 1); assert.equal(wall.hitRate, 33.3); assert.equal(wall.practicalEvaluatedCount, 3); assert.equal(wall.practicalHitCount, 1); assert.equal(wall.practicalHitRate, 33.3); assert.equal(wall.skipEvaluatedCount, 2); assert.equal(wall.skipCorrectCount, 2); assert.equal(wall.skipDecisionAccuracy, 100); assert.equal(wall.stake, 400); assert.equal(wall.return, 1240); assert.equal(wall.recoveryRate, 310);
const course = result.byTheory.find(row => row.theoryKey === "course");
assert.equal(course.useCount, 0); assert.equal(course.evaluatedCount, 0); assert.equal(course.hitRate, null); assert.equal(course.recoveryRate, null); assert.equal(course.practicalHitRate, null); assert.equal(course.skipDecisionAccuracy, null);
assert.equal(result.usableForPrediction, false); assert.equal(result.automaticApplication, false);
assert.equal(result.theoryActionRanking.length, 12);
assert.equal(result.theoryActionRanking.find(row => row.theoryKey === "wall-boat").action, "collect-more");
assert.equal(api.actionOf({ evaluatedCount: 53, practicalHitRate: 25, recoveryRate: 110 }).action, "strengthen-candidate");
assert.equal(api.actionOf({ evaluatedCount: 30, practicalHitRate: 18, recoveryRate: 75 }).action, "maintain");
assert.equal(api.actionOf({ evaluatedCount: 50, practicalHitRate: 17, recoveryRate: 40 }).action, "weaken-candidate");
assert.equal(api.actionOf({ evaluatedCount: 19, practicalHitRate: 40, recoveryRate: 200 }).action, "collect-more");
assert.equal(api.skipDecisionCorrect("skip", false), true); assert.equal(api.skipDecisionCorrect("skip", true), false); assert.equal(api.skipDecisionCorrect("bet-candidate", true), true); assert.equal(api.skipDecisionCorrect("caution", true), null);
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 78, evidenceCompleteness: 90, scenarioAiV6Shadow: { scenarios: [{ likelihood: 62 }, { likelihood: 22 }, { likelihood: 16 }] } } }), "bet-candidate");
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 58, evidenceCompleteness: 90, scenarioAiV6Shadow: { scenarios: [{ likelihood: 39 }, { likelihood: 36 }, { likelihood: 25 }] } } }), "skip");
assert.equal(api.skipDecisionOf({ prediction: { selectionScore: 78, evidenceCompleteness: 90, verificationEvidence: { scenarios: [{ type: "escape", score: 62 }, { type: "sashi", score: 22 }, { type: "makuri", score: 16 }] } } }), "bet-candidate");
assert.equal(api.skipDecisionOf({ selectionScore: 78, evidenceCompleteness: 90, verificationEvidence: { scenarios: [{ type: "escape", score: 62 }, { type: "sashi", score: 22 }, { type: "makuri", score: 16 }] } }), "bet-candidate");
assert.equal(api.predictionOf({ confidence: 71 }).confidence, 71);
const primary = { raceKey: "same-race", source: "primary" }; const duplicateVerification = { raceKey: "same-race", source: "verification" }; const verificationOnly = { raceKey: "verification-only", source: "verification" }; const merged = builder.mergeSources([primary], [duplicateVerification, verificationOnly]); assert.equal(merged.length, 2); assert.equal(merged.find(row => row.raceKey === "same-race").source, "primary");
console.log("theory performance report tests passed");
