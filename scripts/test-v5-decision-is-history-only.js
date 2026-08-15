"use strict";

const assert = require("node:assert/strict");
const decision = require("../config/scenario-likelihood-v5-decision.json");
const policy = require("../config/upgrade-collection-policy.json");

assert.equal(decision.status, "rejected");
assert.equal(decision.decision, "keep-production-a");
assert.equal(decision.productionCandidate, false);
assert.equal(policy.rules.keepShadowDataCollection, true);
assert.equal(policy.rules.rejectOnlyEvaluatedCandidateGeneration, true);
assert.equal(policy.rules.automaticApplication, false);

console.log("v5 rejection is historical evidence only; upgrade collection remains active");
