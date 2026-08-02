"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REVIEW_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-adoption-review.json");
const CONFIG_PATH = path.join(ROOT, "data", "config", "scenario-ai-v6-approval.json");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-approval-status.json");

function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function canonicalCandidate(review = {}) {
  return {
    status: String(review?.status || ""),
    evidence: review?.evidence || null,
    firstHalf: review?.firstHalf || null,
    secondHalf: review?.secondHalf || null,
    majorVenueRegression: Array.isArray(review?.majorVenueRegression) ? review.majorVenueRegression : [],
    adoptionTargets: Array.isArray(review?.adoptionTargets) ? review.adoptionTargets : [],
    conditionChecks: Array.isArray(review?.conditionChecks) ? review.conditionChecks : []
  };
}

function fingerprint(review = {}) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonicalCandidate(review)))
    .digest("hex");
}

function buildStatus(review = {}, config = {}) {
  const candidateFingerprint = fingerprint(review);
  const candidateReady = review?.status === "awaiting-human-approval";
  const approvedRequested = config?.approved === true;
  const suppliedFingerprint = String(config?.candidateFingerprint || "");
  const approvedBy = String(config?.approvedBy || "").trim();
  const approvedAt = String(config?.approvedAt || "").trim();
  const fingerprintMatches = suppliedFingerprint && suppliedFingerprint === candidateFingerprint;

  let status = "not-candidate";
  let reason = "採用候補が成立していない";
  let humanApproved = false;

  if (candidateReady && !approvedRequested) {
    status = "awaiting-human-approval";
    reason = "明示承認が未実施";
  } else if (candidateReady && approvedRequested && !approvedBy) {
    status = "invalid-approval";
    reason = "承認者が未入力";
  } else if (candidateReady && approvedRequested && !approvedAt) {
    status = "invalid-approval";
    reason = "承認日時が未入力";
  } else if (candidateReady && approvedRequested && !fingerprintMatches) {
    status = suppliedFingerprint ? "candidate-changed-after-approval" : "invalid-approval";
    reason = suppliedFingerprint ? "承認後に候補内容が変更された" : "候補フィンガープリントが未入力";
  } else if (candidateReady && approvedRequested && fingerprintMatches) {
    status = "approved";
    reason = "候補内容と承認記録が一致";
    humanApproved = true;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "scenario-ai-v6-adoption-review",
    status,
    reason,
    candidateReady,
    candidateFingerprint,
    suppliedFingerprint,
    fingerprintMatches,
    humanApprovalRequired: true,
    humanApproved,
    approvedBy: humanApproved ? approvedBy : "",
    approvedAt: humanApproved ? approvedAt : "",
    adoptionAllowed: humanApproved,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function main() {
  const report = buildStatus(readJson(REVIEW_PATH), readJson(CONFIG_PATH));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6承認状態：${report.status}`);
  console.log(`候補フィンガープリント：${report.candidateFingerprint}`);
}

if (require.main === module) main();
module.exports = { buildStatus, fingerprint, canonicalCandidate };
