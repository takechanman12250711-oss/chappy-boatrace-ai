"use strict";

const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const approved = {
  doubleTimeSupport: {
    approved: true,
    applied: true,
    isDouble: true,
    topBoat: 4,
    confidence: 84,
    exhibitionGap: 0.06,
    lapGap: 0.12,
    source: "manual-approved-double-time"
  }
};

const evidence = snapshot.doubleTimeEvidence(approved);
assert.equal(evidence.formal, true, "承認・実適用されたダブルタイムだけ正式証拠にする");
assert.equal(evidence.topBoat, 4);
assert.ok(snapshot.doubleTimeClaimForTicket(approved, "1-4-3"));
assert.equal(snapshot.doubleTimeClaimForTicket(approved, "1-2-3"), null, "対象艇を含まない買い目へ帰属しない");

assert.equal(snapshot.doubleTimeEvidence({ doubleTimeSupport: { ...approved.doubleTimeSupport, approved: false } }).formal, false);
assert.equal(snapshot.doubleTimeEvidence({ doubleTimeSupport: { ...approved.doubleTimeSupport, applied: false } }).formal, false);
assert.equal(snapshot.doubleTimeEvidence({ doubleTimeSupport: { ...approved.doubleTimeSupport, isDouble: false } }).formal, false);
assert.equal(snapshot.doubleTimeEvidence({ doubleTimeSupport: { ...approved.doubleTimeSupport, confidence: 69 } }).formal, false);
assert.equal(snapshot.doubleTimeEvidence({ doubleTimeSupport: { ...approved.doubleTimeSupport, source: "" } }).formal, false);
const missingGap = snapshot.doubleTimeEvidence({
  doubleTimeSupport: {
    ...approved.doubleTimeSupport,
    exhibitionGap: null
  }
});
assert.equal(missingGap.formal, false, "欠損した差を0秒として正式化しない");
assert.ok(
  snapshot.buildEvidenceDiagnostics({
    doubleTimeSupport: {
      ...approved.doubleTimeSupport,
      exhibitionGap: null
    }
  }).rows.find(row => row.theoryKey === "double-time")
    .missingReasons.includes("exhibition-gap-missing")
);

const result = snapshot.build(approved, [{ ticket: "1-4-3", category: "本線" }]);
const doubleTime = result.theories.find(row => row.theoryKey === "doubleTime");
assert.ok(doubleTime);
assert.equal(doubleTime.ticketCount, 1);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);

function runtimePrediction(overrides = {}) {
  const performance = {
    version: "exhibition-performance-v2",
    isFullMode: true,
    isFormal: true,
    appliedToScore: true,
    exhibitionCount: 6,
    lapCount: 6,
    doubleTimeBoat: 4,
    source: {
      exhibition: "BOAT RACE公式",
      lap: "BOATRACE浜名湖公式・独自計測一周"
    },
    roles: [{
      boatNo: 4,
      isDoubleTime: true,
      isFormal: true,
      appliedToScore: true,
      components: { doubleTime: 5 }
    }],
    ...(overrides.performance || {})
  };
  const doubleTime = {
    isDouble: true,
    topBoat: 4,
    confidence: 84,
    exhibitionGap: 0.06,
    lapGap: 0.12,
    ...(overrides.doubleTime || {})
  };
  return { exhibitionPerformanceTheory: performance, doubleTime };
}

const runtime = runtimePrediction();
const runtimeBefore = JSON.stringify(runtime);
const runtimeSupport = snapshot.appliedDoubleTimeSupport(runtime);
assert.equal(runtimeSupport.applied, true);
assert.equal(runtimeSupport.lapSource, "BOATRACE浜名湖公式・独自計測一周");
const runtimeEvidence = snapshot.doubleTimeEvidence(runtime);
assert.equal(runtimeEvidence.formal, true, "展示・足Ver2へ実適用済みの5点だけを正式証拠へ写す");
assert.equal(runtimeEvidence.lapCount, 6);
assert.equal(JSON.stringify(runtime), runtimeBefore, "証拠保存は予想計算済みオブジェクトを変更しない");

const runtimeResult = snapshot.build(runtime, [
  { ticket: "1-4-3", category: "本線" },
  { ticket: "1-2-3", category: "押さえ" }
]);
const runtimeTheory = runtimeResult.theories.find(row => row.theoryKey === "doubleTime");
const runtimeDiagnostic = runtimeResult.evidenceDiagnostics.rows.find(row => row.theoryKey === "double-time");
assert.deepEqual(runtimeTheory.tickets, ["1-4-3"], "対象艇を含む実戦買い目だけへ帰属する");
assert.equal(runtimeTheory.version, "ai-core-exhibition-performance-v2");
assert.equal(runtimeDiagnostic.formal, true);
assert.equal(runtimeDiagnostic.metrics.lapCount, 6);

[
  runtimePrediction({ performance: { isFullMode: false } }),
  runtimePrediction({ performance: { lapCount: 5 } }),
  runtimePrediction({ performance: { source: { exhibition: "BOAT RACE公式", lap: "" } } }),
  runtimePrediction({ performance: { source: { exhibition: "BOAT RACE公式", lap: "外部取得" } } }),
  runtimePrediction({ performance: { source: { exhibition: "BOAT RACE公式", lap: "未検証サイト一周" } } }),
  runtimePrediction({ performance: { source: { exhibition: "BOAT RACE公式", lap: "BOATRACE偽サイト公式・独自計測一周" } } }),
  runtimePrediction({ performance: { doubleTimeBoat: 3 } }),
  runtimePrediction({ performance: { roles: [{ boatNo: 4, isDoubleTime: true, isFormal: true, appliedToScore: true, components: { doubleTime: 0 } }] } }),
  runtimePrediction({ doubleTime: { isDouble: false } })
].forEach((candidate) => {
  assert.equal(
    snapshot.doubleTimeEvidence(candidate).formal,
    false,
    "6艇・明示取得元・トップ一致・5点実適用を満たさない入力を拒否する"
  );
});

const explicitRejection = snapshot.doubleTimeEvidence({
  ...runtime,
  doubleTimeSupport: {
    ...approved.doubleTimeSupport,
    approved: false
  }
});
assert.equal(explicitRejection.formal, false, "明示された未承認supportをruntimeで上書きしない");

const evaluated = require("../js/theory-evaluation-engine").build({
  raceKey: "double-time-runtime-test",
  result: { settled: true, resultTicket: "1-4-3" },
  theoryTagSnapshot: runtimeResult
}).evaluations.find(row => row.theoryKey === "double-time");
assert.equal(evaluated.status, "evaluated", "保存した正式証拠をPhase7評価へ接続する");
assert.equal(evaluated.matched, true);

console.log("ダブルタイム正式証拠ゲート: 合格");
