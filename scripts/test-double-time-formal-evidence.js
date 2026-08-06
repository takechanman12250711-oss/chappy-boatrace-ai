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

const result = snapshot.build(approved, [{ ticket: "1-4-3", category: "本線" }]);
const doubleTime = result.theories.find(row => row.theoryKey === "doubleTime");
assert.ok(doubleTime);
assert.equal(doubleTime.ticketCount, 1);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);

console.log("ダブルタイム正式証拠ゲート: 合格");
