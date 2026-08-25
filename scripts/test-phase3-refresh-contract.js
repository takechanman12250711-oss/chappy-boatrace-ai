"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const refresh = fs.readFileSync(
  ".github/workflows/refresh-unified-improvement-decision-gate.yml",
  "utf8",
);
assert.ok(refresh.includes("build-unified-improvement-decision-gate.js"));
assert.ok(refresh.includes("build-phase3-learning-handoff.js"));
assert.ok(
  refresh.indexOf("build-unified-improvement-decision-gate.js")
    < refresh.indexOf("build-phase3-learning-handoff.js"),
);
assert.ok(refresh.includes("phase3-learning-handoff.json"));

const check = fs.readFileSync(
  ".github/workflows/check-phase3-learning-handoff.yml",
  "utf8",
);
assert.ok(check.includes("check-phase3-learning-handoff-pr-{0}"));
assert.ok(check.includes("|| 'chappy-main-data-writers'"));
assert.ok(check.includes("config/phase3-candidate-policy-review.json"));
assert.ok(check.includes('workflows: ["Collect official race results"]'));
assert.ok(check.includes("github.event.workflow_run.conclusion == 'success'"));
assert.ok(check.includes("data/stats/improvement-proposal-phase3.json"));
assert.ok(check.includes("test-phase3-historical-connection.js"));
assert.ok(
  check.indexOf("build-phase3-learning-handoff.js") <
    check.lastIndexOf("test-phase3-historical-connection.js"),
);
console.log("phase3 refresh contract: ok");
