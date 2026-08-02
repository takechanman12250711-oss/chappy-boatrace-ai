"use strict";

const fs = require("node:fs");
const path = require("node:path");
const approval = require("../js/theory-adoption-approval");

const root = path.resolve(__dirname, "..");
const reviewPath = path.join(root, "data", "stats", "theory-adoption-review-report.json");
const approvalPath = path.join(root, "data", "config", "theory-adoption-approval.json");
const outputPath = path.join(root, "data", "stats", "theory-adoption-approval-status.json");

function load(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function build(review, manifest) {
  return {
    generatedAt: new Date().toISOString(),
    source: {
      review: "data/stats/theory-adoption-review-report.json",
      approval: "data/config/theory-adoption-approval.json"
    },
    ...approval.validate(review, manifest)
  };
}

function main() {
  const report = build(load(reviewPath, {}), load(approvalPath, {}));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論採用承認状態：${report.status}`);
}

if (require.main === module) main();
module.exports = { load, build };
