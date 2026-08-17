"use strict";
const fs=require("node:fs");const assert=require("node:assert/strict");
const y=fs.readFileSync(".github/workflows/build-remain-pickup-branch-report.yml","utf8");
assert.ok(y.includes("restore-daily-prediction-source.js --all"));
assert.ok(y.includes("build-remain-pickup-branch-report.js"));
assert.ok(y.includes("prepare-daily-prediction-git-save.js --all"));
assert.ok(y.indexOf("prepare-daily-prediction-git-save.js --all")<y.indexOf("git pull --rebase origin main"));
console.log("remain pickup report save workflow contract: ok");
