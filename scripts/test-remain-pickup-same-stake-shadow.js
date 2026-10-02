"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const report = require("./build-remain-pickup-same-stake-shadow");

const weak = { ticket: "1-2-3", priorityScore: 70, roleLabels: [{ position: 1, role: "position", structured: false }] };
const strong = { ticket: "1-2-4", priorityScore: 90, roleLabels: [
  { position: 1, role: "head", structured: true },
  { position: 2, role: "hold", structured: true },
  { position: 3, role: "pickup", structured: true }
] };
assert.equal(report.roleQuality(weak).fullRemainPickup, false);
assert.equal(report.roleQuality(strong).fullRemainPickup, true);
assert.equal(report.roleQuality(strong).structuredCount, 3);

const saved = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "stats", "remain-pickup-same-stake-shadow-report.json"), "utf8"));
assert.equal(saved.productionChanged, false);
assert.equal(saved.productionAUnchanged, true);
assert.equal(saved.automaticApplication, false);
assert.equal(saved.adoptionCandidate, false);
assert.equal(saved.usableForPrediction, false);
assert.equal(saved.actualPurchase, false);
assert.equal(saved.ticketCount, 7);
assert.equal(saved.methodology.sameStake, true);
assert.equal(saved.methodology.sameTicketCount, true);
assert.equal(saved.holdout.A.settledRaceCount >= saved.holdoutGate, true);
assert.equal(saved.status, "candidate-fails-retrospective-holdout-100");
assert.equal(saved.decision, "reject-and-advance");
assert.equal(saved.holdout.B.recoveryRate <= saved.holdout.A.recoveryRate, true);

console.log("remain-pickup same-stake shadow test: ok");
