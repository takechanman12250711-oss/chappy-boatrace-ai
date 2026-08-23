"use strict";

const { spawnSync } = require("node:child_process");

const commands = [
  ["node", ["scripts/build-improvement-proposal-report.js"]],
  ["node", ["scripts/build-flow-reading-miss-breakdown.js"]]
];

for (const [cmd, args] of commands) {
  const run = spawnSync(cmd, args, { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status || 1);
}
