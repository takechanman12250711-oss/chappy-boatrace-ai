"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflows = [
  "check-race-flow-4kado-alert-skip-ab.yml",
  "check-race-flow-3course-alert-skip-ab.yml",
  "check-race-flow-2course-sashi-skip-ab.yml",
  "check-race-flow-outside-push-skip-ab.yml",
  "check-race-flow-in-first-outside-alert-skip-ab.yml",
  "check-remain-pickup-hold3-shadow-ab.yml"
];

for (const name of workflows) {
  const workflow = fs.readFileSync(path.join(".github", "workflows", name), "utf8");
  assert.match(
    workflow,
    /group: \$\{\{ github\.event_name == 'pull_request' && format\('\{0\}-pr-\{1\}', github\.workflow, github\.event\.pull_request\.number\) \|\| 'chappy-main-data-writers' \}\}/,
    `${name}はPR検査同士をcancelせず、main書込みだけを直列化する`
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /node scripts\/test-race-flow-ab-workflow-concurrency\.js/);
}

console.log("race-flow A/B workflow concurrency test: ok");
