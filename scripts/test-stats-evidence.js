"use strict";
const assert = require("node:assert/strict");
const A = require("../js/auto-stats");
const outer = require("../js/outer-attack-ticket-progress-panel");
const reference = require("../js/reference-tag-report");

const verified = { settled: true, internalEvaluation: { score: 80 }, scenarioVerification: { structured: true } };
const row = (key, verification = verified, isShadow = false) => ({ prediction: { selectionGenerationKey: key }, verification, isShadow });
const rows = [
  row("current-method"), row("same-policy-other-selector"), row("old-policy"), row(""),
  row("current-method", { ...verified, settled: false }),
  row("current-method", { ...verified, scenarioVerification: { structured: false } }),
  row("current-method", verified, true)
];
const progress = A.buildDetailedMethodProgress(rows, "current-method");
assert.equal(progress.sourceCount, 6, "non-selected comparison predictions remain outside detailed selected performance");
assert.equal(progress.currentCount, 3);
assert.equal(progress.verifications.length, 1);
assert.strictEqual(progress.verifications[0], verified, "display does not rewrite stored verification");
assert.deepEqual(progress.excluded, { unknownMethod: 1, otherMethod: 2, pending: 1, incomplete: 1 });
assert.equal(A.buildDetailedMethodProgress(rows, "").verifications.length, 0, "unknown active method fails closed");
assert.equal(A.buildDetailedMethodProgress(rows, "new-empty-method").currentCount, 0, "old methods cannot fill an empty current method");
assert.equal(A.formatEvidenceTime("2026-10-06T18:06:45.742Z"), "2026-10-07 03:06 JST");
assert.equal(A.formatEvidenceTime(null), "未確認");
assert.equal(A.formatEvidenceCount(0), "0R");
for (const value of [null, undefined, "", -1, NaN]) assert.equal(A.formatEvidenceCount(value), "未確認");
assert.equal(A.formatEvidenceTime("not-a-date"), "未確認");
const normalized = A.normalizeIndex({ generatedAt: "2026-10-06T18:00:00Z", retentionLimits: { predictions: 100 }, sourceRecordCounts: { predictions: 280 } });
assert.equal(normalized.generatedAt, "2026-10-06T18:00:00Z");
assert.equal(normalized.retentionLimits.predictions, 100);
assert.equal(normalized.sourceRecordCounts.predictions, 280);

const central = {
  generatedAt: new Date().toISOString(),
  pipeline: { immutableSnapshotCount: 56, exclusionCount: 14, pendingOfficialResultCount: 0,
    lastCapture: { capturedAt: "2026-10-06T15:48:22.591Z" },
    noteCollection: { checked: 828, missing: 177 } },
  research: { capturedRaces: 261, settledRaces: 245,
    coverage: { date: "20261007", scheduledRaces: 144, savedRaces: 0, missingRaces: 144,
      reasons: { "deferred-until-one-hour": 144 } } }
};
const view = outer.applyCentralEvidence({}, central);
assert.match(view.coverageLabel, /締切1時間前まで待機144R/);
assert.match(view.coverageLabel, /その他未保存0R/);
assert.doesNotMatch(view.coverageLabel, /未保存144R/);
assert.match(view.evidenceLabel, /最終収集確認/);
assert.match(view.collectionDetail, /比較対象外 14件/);
const mixed = structuredClone(central);
mixed.research.coverage.reasons["deferred-until-one-hour"] = 140;
assert.match(outer.applyCentralEvidence({}, mixed).coverageLabel, /その他未保存4R/);
const unknown = outer.applyCentralEvidence({}, { ...central, generatedAt: "" });
assert.equal(unknown.overallStatusLabel, "集計時刻未確認");
const old = outer.applyCentralEvidence({}, { ...central, generatedAt: "2020-01-01T00:00:00Z" });
assert.equal(old.overallStatusLabel, "集計から24時間以上経過", "stale data alone does not prove collection stopped");
assert.equal(outer.buildViewModel({ gateId: outer.GATE_ID }).variants[0].statusLabel, "比較結果なし");

const html = reference.renderHtml({ dataSource: "boatrace-official", compatibilityProfile: "hiyori-compatible", directHiyoriDataUsed: false,
  generatedAt: "2026-10-06T18:06:45Z", settledRaceCount: 3341, matchedRaceCount: 3295, untaggedRaceCount: 46,
  tags: [{ key: "lap", label: "一周タイム上位艇", samples: 36, status: "参考度高", top3Rate: 80.6 }] });
assert.match(html, /指標なし 46R/);
assert.match(html, /3着内率55%以上/);
assert.doesNotMatch(html, />参考度高</);
assert.match(html, /確かさの証明ではありません/);
console.log("stats evidence and same-method isolation: passed");
