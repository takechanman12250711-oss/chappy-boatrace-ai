"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const builder = require("./build-theory-candidate-branch-analysis-phase9");
const analysis = require("../js/theory-candidate-branch-analysis-phase9");

const saved = builder.load(builder.out, null);
assert.ok(saved, "Phase9候補枝分析artifactが存在する");
const rebuilt = builder.buildReport({ generatedAt: saved.generatedAt });
assert.deepEqual(
  builder.withoutGeneratedAt(saved),
  builder.withoutGeneratedAt(rebuilt),
  "artifactは現在の公式締切前母集団から再現できる"
);
const phase9 = builder.load(
  `${builder.stats}/theory-improvement-proposal-phase9.json`,
  {}
);
const performance = builder.load(
  `${builder.stats}/theory-performance-report.json`,
  {}
);
assert.equal(saved.analysisInputContract, performance.analysisInputContract);
assert.equal(
  saved.analysisInputDiagnostics?.settledJoinCount,
  performance.analysisInputDiagnostics?.settledJoinCount,
  "枝分析と理論成績の公式終了母集団数を一致させる"
);
if (phase9?.proposal?.theoryKey === "frame-rise-fall") {
  assert.equal(saved.status, "candidate-ready-for-human-review");
  assert.equal(saved.evidenceConsistency.exactMatch, true);
  assert.equal(saved.candidateCount, 1);
  assert.equal(saved.candidate.approved, false);
  assert.equal(saved.candidate.approvedSpecFingerprint, null);
  assert.equal(saved.candidate.shadowImplementationPresent, false);
  assert.equal(saved.candidate.shadowImplementationSpecFingerprint, null);
  assert.match(saved.candidate.candidateSpecFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    saved.candidate.candidateSpecFingerprint,
    analysis.candidateSpecFingerprint(saved.candidate),
    "保存された候補仕様fingerprintを正規化仕様から再計算する"
  );
  assert.equal(saved.candidate.sourceProposalFingerprint, saved.phase9ProposalFingerprint);
  assert.equal(saved.candidate.proposedChange.scope, "shadow-B-only");
  assert.equal(saved.candidate.productionPredictionChanged, false);
  assert.equal(saved.candidate.productionTicketSelectionChanged, false);
  assert.equal(saved.retrospectiveLimits.independentHoldout, false);
  assert.equal(saved.retrospectiveLimits.historicalBPerformanceClaimAllowed, false);
  Object.entries(saved.branches).forEach(([axis, rows]) => {
    for (const field of ["raceCount", "ticketCount", "hitCount", "stake", "return", "profit"]) {
      assert.equal(
        rows.reduce((total, row) => total + row[field], 0),
        saved.overall[field],
        `${axis}の${field}が全体集計へ加算一致する`
      );
    }
  });
} else {
  assert.equal(saved.candidateCount, 0);
  assert.equal(saved.candidate, null);
}
assert.equal(saved.automaticApplication, false);
assert.equal(saved.usableForPrediction, false);
assert.equal(saved.uiVisible, false);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-phase9-branch-"));
try {
  const temporaryArtifact = path.join(temporaryDirectory, "artifact.json");
  const first = builder.writeIfChanged({ generatedAt: "first", value: 1 }, temporaryArtifact);
  const unchanged = builder.writeIfChanged({ generatedAt: "second", value: 1 }, temporaryArtifact);
  const changed = builder.writeIfChanged({ generatedAt: "third", value: 2 }, temporaryArtifact);
  assert.equal(first.changed, true);
  assert.equal(unchanged.changed, false, "generatedAtだけではartifactを更新しない");
  assert.equal(unchanged.report.generatedAt, "first", "意味が同じなら元の時刻を維持する");
  assert.equal(changed.changed, true, "意味が変わればartifactを更新する");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("theory candidate branch analysis phase9 artifact tests passed");
