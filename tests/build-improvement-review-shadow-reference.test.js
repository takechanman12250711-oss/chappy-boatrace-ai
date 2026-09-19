"use strict";
const assert = require("node:assert/strict");
const { selectShadowV2Snapshot } = require("../scripts/build-improvement-review.js");

const snapshot = {
  recordKey: "shadow-20260919-01-1",
  capturedAt: "2026-09-19T08:00:00.000Z",
  cohortKey: "cohort-a",
  evaluatorVersion: "shadow-selection-v2.0.1",
  evaluation: { totalScore: 72 }
};

const explicitlyReferenced = {
  selection: { score: 65 },
  shadowV2Reference: {
    recordKey: snapshot.recordKey,
    capturedAt: snapshot.capturedAt,
    cohortKey: snapshot.cohortKey,
    evaluatorVersion: snapshot.evaluatorVersion
  }
};

assert.strictEqual(
  selectShadowV2Snapshot([snapshot], explicitlyReferenced),
  snapshot,
  "an explicit durable reference must not be rejected only because selection.score differs from the snapshot evaluation score"
);

assert.strictEqual(
  selectShadowV2Snapshot([snapshot], {
    ...explicitlyReferenced,
    shadowV2Reference: {
      ...explicitlyReferenced.shadowV2Reference,
      capturedAt: "2026-09-19T08:01:00.000Z"
    }
  }),
  null,
  "capturedAt identity mismatch must remain fail-closed"
);

assert.strictEqual(
  selectShadowV2Snapshot([snapshot], {
    ...explicitlyReferenced,
    shadowV2Reference: {
      ...explicitlyReferenced.shadowV2Reference,
      cohortKey: "cohort-b"
    }
  }),
  null,
  "cohort identity mismatch must remain fail-closed"
);

assert.strictEqual(
  selectShadowV2Snapshot([snapshot], {
    ...explicitlyReferenced,
    shadowV2Reference: {
      ...explicitlyReferenced.shadowV2Reference,
      evaluatorVersion: "other-evaluator"
    }
  }),
  null,
  "evaluator identity mismatch must remain fail-closed"
);

assert.strictEqual(
  selectShadowV2Snapshot([snapshot], {
    selection: { score: 65 },
    selectedAt: snapshot.capturedAt
  }),
  null,
  "legacy timestamp fallback must still require score equality"
);

console.log("durable Shadow V2 reference matching passed");
