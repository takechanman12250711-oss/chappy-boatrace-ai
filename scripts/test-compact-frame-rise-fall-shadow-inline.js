"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-frame-rise-fall-shadow-snapshots");
const compact = require("./compact-frame-rise-fall-shadow-inline");

const record = { raceKey: "20260815-05-11", selectedAt: "2026-08-15T16:00:00+09:00" };
const full = {
  version: "frame-rise-fall-shadow-storage-v2",
  candidateId: "candidate",
  candidateSpecFingerprint: "sha256:spec",
  implementationFingerprint: "impl",
  cutoff: {
    selectedAtExclusiveLowerBound: "2026-08-15T11:06:15+09:00",
    sourceCommit: "commit",
    logicFingerprint: "sha256:logic"
  },
  selectedAt: record.selectedAt,
  raceKey: record.raceKey,
  status: "shadow-ready",
  decisionChanged: true,
  applicableCount: 2,
  a: { scenarios: Array.from({ length: 20 }, (_, i) => ({ i, evidence: "a".repeat(100) })) },
  b: { scenarios: Array.from({ length: 20 }, (_, i) => ({ i, evidence: "b".repeat(100) })) },
  downstreamReplay: { status: "replay-ready", a: { practicalTickets: ["1-2-3"] }, b: { practicalTickets: [] } },
  productionAUnchanged: true,
  comparisonContract: { comparableForFixed100: true },
  applicationMode: "shadow-only",
  usableForPrediction: false,
  automaticApplication: false
};
const key = builder.snapshotArchiveKey(record, full);
const archive = builder.emptyArchive();
archive.snapshots[key] = full;

const first = compact.compactDocument({ verificationPredictions: [{ ...record, frameRiseFallShadowAb: full }] }, archive);
assert.equal(first.compactedCount, 1);
assert.equal(first.verifiedCompactCount, 0);
const inline = first.data.verificationPredictions[0].frameRiseFallShadowAb;
assert.equal(inline.inlineStorage, "archive-reference-v1");
assert.equal(inline.immutableArchiveKey, key);
assert.equal(inline.a, undefined);
assert.equal(inline.b, undefined);
assert.deepEqual(inline.downstreamReplay, full.downstreamReplay);
assert.ok(JSON.stringify(inline).length < JSON.stringify(full).length);
assert.deepEqual(archive.snapshots[key], full);

const second = compact.compactDocument(first.data, archive);
assert.equal(second.compactedCount, 0);
assert.equal(second.verifiedCompactCount, 1);
assert.deepEqual(second.data, first.data);

assert.throws(
  () => compact.compactDocument(first.data, builder.emptyArchive()),
  /完全証拠archiveが見つかりません/
);

console.log("collector frame rise fall inline compaction tests passed");
