// scripts/build-scenario-ai-v6-snapshots.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");

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

function attachSnapshots(data = {}, builder = scenarioAiV6.build) {
  const rows = Array.isArray(data.verificationPredictions)
    ? data.verificationPredictions
    : [];
  let readyCount = 0;
  const verificationPredictions = rows.map(record => {
    const verificationEvidence = record?.prediction?.verificationEvidence || null;
    const snapshot = builder({ verificationEvidence });
    if (snapshot?.status === "shadow-ready") readyCount += 1;
    return {
      ...record,
      scenarioAiV6Shadow: snapshot
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
  const next = attachSnapshots(current);
  writeJsonAtomic(filePath, next);
  console.log(`展開AI v6シャドー保存：${next.scenarioAiV6.readyCount}/${next.scenarioAiV6.recordCount}R`);
}

if (require.main === module) main();

module.exports = { attachSnapshots, normalizeDate };
