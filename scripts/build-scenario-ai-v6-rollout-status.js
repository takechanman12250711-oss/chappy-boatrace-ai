"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APPROVAL_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-approval-status.json");
const CONFIG_PATH = path.join(ROOT, "data", "config", "scenario-ai-v6-rollout.json");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-rollout-status.json");
const MAX_PERCENT = 25;

function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function buildStatus(approval = {}, config = {}) {
  const approved = approval?.status === "approved" && approval?.adoptionAllowed === true;
  const enabledRequested = config?.enabled === true;
  const stop = config?.emergencyStop === true || config?.rollbackRequested === true;
  const requested = Math.max(0, Math.min(100, Number(config?.requestedRolloutPercent) || 0));
  const percent = approved && enabledRequested && !stop ? Math.min(requested, MAX_PERCENT) : 0;
  let status = "off";
  if (!approved && enabledRequested) status = "approval-required";
  else if (stop) status = "stopped";
  else if (approved && !enabledRequested) status = "approved-not-running";
  else if (percent > 0) status = "canary-running";
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    approved,
    enabled: status === "canary-running",
    stage: status === "canary-running" ? "canary" : "off",
    requestedRolloutPercent: requested,
    rolloutPercent: percent,
    maximumRolloutPercent: MAX_PERCENT,
    rolloutLimited: requested > MAX_PERCENT,
    emergencyStop: config?.emergencyStop === true,
    rollbackRequested: config?.rollbackRequested === true,
    automaticExpansion: false,
    applicationMode: "shadow-plan-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function main() {
  const report = buildStatus(readJson(APPROVAL_PATH), readJson(CONFIG_PATH));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6段階反映：${report.status}／${report.rolloutPercent}%`);
}

if (require.main === module) main();
module.exports = { buildStatus, MAX_PERCENT };
