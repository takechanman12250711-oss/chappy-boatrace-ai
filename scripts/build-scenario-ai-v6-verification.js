"use strict";

const fs = require("node:fs");
const path = require("node:path");
const verifier = require("../js/scenario-ai-v6-verification");

function loadJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function targetDate() {
  const arg = process.argv.find(value => value.startsWith("--date="));
  const raw = arg ? arg.slice(7) : process.env.COLLECT_DATE || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  return String(raw).replaceAll("-", "").replaceAll("/", "");
}

function resultMapOf(data) {
  return new Map((Array.isArray(data?.races) ? data.races : []).map(row => [
    `${data.date}-${String(row?.jcd || "").padStart(2, "0")}-${Number(row?.raceNo || 0)}`,
    row
  ]));
}

function build(predictionData, resultData) {
  const resultMap = resultMapOf(resultData || {});
  const rows = Array.isArray(predictionData?.verificationPredictions) ? predictionData.verificationPredictions : [];
  let changed = false;
  const verificationPredictions = rows.map(record => {
    const official = resultMap.get(record?.raceKey);
    if (!official?.resultAvailable) return record;
    const next = verifier.verify(record?.scenarioAiV6Shadow || {}, official);
    if (JSON.stringify(record?.scenarioAiV6Verification || null) !== JSON.stringify(next)) changed = true;
    return { ...record, scenarioAiV6Verification: next };
  });
  const summary = verifier.buildSummary(verificationPredictions.map(row => row?.scenarioAiV6Verification).filter(Boolean));
  if (JSON.stringify(predictionData?.scenarioAiV6VerificationSummary || null) !== JSON.stringify(summary)) changed = true;
  return {
    changed,
    data: {
      ...predictionData,
      verificationPredictions,
      scenarioAiV6VerificationSummary: summary
    }
  };
}

function main() {
  const date = targetDate();
  if (!/^\d{8}$/.test(date)) throw new Error(`日付はYYYYMMDD形式で指定してください：${date}`);
  const predictionPath = path.join(process.cwd(), "data", "predictions", `${date}.json`);
  const resultPath = path.join(process.cwd(), "data", "results", `${date}.json`);
  const predictionData = loadJson(predictionPath);
  const resultData = loadJson(resultPath);
  if (!predictionData || !resultData) {
    console.log(`展開AI v6照合対象なし：${date}`);
    return;
  }
  const output = build(predictionData, resultData);
  if (output.changed) writeJson(predictionPath, output.data);
  console.log(`展開AI v6照合：${output.data.scenarioAiV6VerificationSummary.verifiedCount}R`);
}

if (require.main === module) main();
module.exports = { build, resultMapOf };
