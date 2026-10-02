"use strict";

const assert = require("node:assert/strict");
const futility = require("../js/frame-rise-fall-shadow-futility");

const doomed = futility.evaluate({
  status: "collecting-fixed-100-results",
  protocol: { fixedComparableRaces: 100 },
  observation: { settledComparableCount: 96 },
  overall: { netBOnlyHits: -27 },
  adoptionChecks: { fixed100Complete: false },
  adoptionCandidate: false,
  automaticApplication: false,
  usableForPrediction: false
});

assert.equal(doomed.status, "candidate-fails-futility");
assert.equal(doomed.futility.irreversible, true);
assert.equal(doomed.futility.remainingComparableResults, 4);
assert.equal(doomed.futility.maximumPossibleNetBOnlyHits, -23);
assert.equal(doomed.futility.requiredNetBOnlyHits, 5);
assert.equal(doomed.adoptionCandidate, false);
assert.equal(doomed.automaticApplication, false);
assert.equal(doomed.usableForPrediction, false);

const reachable = futility.evaluate({
  status: "collecting-fixed-100-results",
  protocol: { fixedComparableRaces: 100 },
  observation: { settledComparableCount: 96 },
  overall: { netBOnlyHits: 2 },
  adoptionChecks: { fixed100Complete: false },
  adoptionCandidate: false
});
assert.equal(reachable.status, "collecting-fixed-100-results");
assert.equal(reachable.futility.irreversible, false);
assert.equal(reachable.futility.maximumPossibleNetBOnlyHits, 6);

const complete = futility.evaluate({
  status: "candidate-passes-fixed-100",
  protocol: { fixedComparableRaces: 100 },
  observation: { settledComparableCount: 100 },
  overall: { netBOnlyHits: 8 },
  adoptionChecks: { fixed100Complete: true },
  adoptionCandidate: true
});
assert.equal(complete.status, "candidate-passes-fixed-100");
assert.equal(complete.futility.irreversible, false);
assert.equal(complete.adoptionCandidate, true);
assert.equal(complete.automaticApplication, false);
assert.equal(complete.usableForPrediction, false);

console.log("frame rise/fall shadow futility test: ok");
