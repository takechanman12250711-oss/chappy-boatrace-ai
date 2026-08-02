// scripts/build-scenario-ai-v6-snapshots.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const scenarioAiV6ShadowAb = require("../js/scenario-ai-v6-shadow-ab");

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" })
    .format(new Date())
    .replaceAll("-", "");
}

function normalizeDate(value) {
  const date = String(value || "").replaceAll("-", "").replaceAll("/", "");
  if (!/^\d{8}$/.test(date)) throw new Error(`日付はYYYYMMDD形式で指定してください：${value}`);
  return date;
}

function loadApprovalReport(filePath = path.join(process.cwd(), "data", "stats", "scenario-ai-v6-reproducibility-gate.json")) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { approvalGate: { approvedCandidates: [] } };
    throw error;
  }
}

function attachSnapshots(
  data = {},
  builder = scenarioAiV6.build,
  shadowAbBuilder = scenarioAiV6ShadowAb.build,
  approvalReport = { approvalGate: { approvedCandidates: [] } }
) {
  const rows = Array.isArray(data.verificationPredictions)
    ? data.verificationPredictions
    : [];
  let readyCount = 0;
  let changedCount = 0;
  const verificationPredictions = rows.map(record => {
    const verificationEvidence = record?.prediction?.verificationEvidence || null;
    const snapshot = builder({ verificationEvidence });
    const shadowAb = shadowAbBuilder(snapshot, approvalReport, { jcd: record?.jcd });
    if (snapshot?.status === "shadow-ready") readyCount += 1;
    if (shadowAb?.changed === true) changedCount += 1;
    return {
      ...record,
      scenarioAiV6Shadow: snapshot,
      scenarioAiV6ShadowAb: shadowAb
    };
  });

  return {
    ...data,
    scenarioAiV6: {
      version: "6.0.0-shadow",
      recordCount: verificationPredictions.length,
      readyCount,
      usableForPrediction: false,
      automaticApplication: false
    },
    scenarioAiV6ShadowAb: {
      version: "6.0.0-shadow-ab",
      recordCount: verificationPredictions.length,
      changedCount,
      applicationMode: "shadow-only",
      usableForPrediction: false,
      automaticApplication: false
    },
    verificationPredictions
  };
}

function writeJsonAtomic(filePath, data) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(temporary, filePath);
}

function main() {
  const date = normalizeDate(process.env.PREDICT_DATE || process.argv[2] || getJstDate());
  const filePath = path.join(process.cwd(), "data", "predictions", `${date}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`展開AI v6保存対象なし：${filePath}`);
    return;
  }
  const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const next = attachSnapshots(current, scenarioAiV6.build, scenarioAiV6ShadowAb.build, loadApprovalReport());
  writeJsonAtomic(filePath, next);
  console.log(
    `展開AI v6シャドー保存：${next.scenarioAiV6.readyCount}/${next.scenarioAiV6.recordCount}R` +
    `／A/B変更${next.scenarioAiV6ShadowAb.changedCount}R`
  );
}

if (require.main === module) main();

module.exports = { attachSnapshots, normalizeDate, loadApprovalReport };
