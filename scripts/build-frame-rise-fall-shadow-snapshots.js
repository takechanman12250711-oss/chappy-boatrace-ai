"use strict";

const fs = require("node:fs");
const path = require("node:path");
const phase10Engine = require("../js/theory-ab-phase10");
const storage = require("../js/frame-rise-fall-shadow-storage");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()).replaceAll("-", "");
}

function phase10State() {
  const phase9 = load(path.join(stats, "theory-improvement-proposal-phase9.json"), {});
  const candidate = load(path.join(stats, "theory-candidate-branch-analysis-phase9.json"), {});
  const approval = load(path.join(root, "config", "theory-ab-phase10-approval.json"), {});
  return phase10Engine.build(phase9, candidate, approval);
}

function attach(data = {}, state = phase10State()) {
  const rows = Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [];
  let capturedCount = 0;
  let applicableCount = 0;
  let decisionChangedCount = 0;
  const verificationPredictions = rows.map(record => {
    if (record?.frameRiseFallShadowAb && typeof record.frameRiseFallShadowAb === "object") {
      capturedCount += record.frameRiseFallShadowAb.status === "shadow-ready" ? 1 : 0;
      applicableCount += Number(record.frameRiseFallShadowAb.applicableCount || 0) > 0 ? 1 : 0;
      decisionChangedCount += record.frameRiseFallShadowAb.decisionChanged === true ? 1 : 0;
      return record;
    }
    const snapshot = storage.build(record, state);
    capturedCount += snapshot.status === "shadow-ready" ? 1 : 0;
    applicableCount += Number(snapshot.applicableCount || 0) > 0 ? 1 : 0;
    decisionChangedCount += snapshot.decisionChanged === true ? 1 : 0;
    return { ...record, frameRiseFallShadowAb: snapshot };
  });
  return {
    ...data,
    frameRiseFallShadowAb: {
      version: storage.VERSION,
      phase10Status: state.status,
      recordCount: verificationPredictions.length,
      capturedCount,
      applicableCount,
      decisionChangedCount,
      fixedComparableRaceCount: Number(state?.comparison?.minimumComparableRaces || 100),
      comparableRaceCount: 0,
      comparisonCollectionStatus: "awaiting-downstream-decision-replay",
      applicationMode: "shadow-only",
      usableForPrediction: false,
      automaticApplication: false
    },
    verificationPredictions
  };
}

function main() {
  const date = String(process.env.PREDICT_DATE || process.argv[2] || getJstDate()).replaceAll("-", "");
  if (!/^\d{8}$/.test(date)) throw new Error(`日付形式異常: ${date}`);
  const file = path.join(root, "data", "predictions", `${date}.json`);
  if (!fs.existsSync(file)) return console.log(`枠別浮沈Shadow保存対象なし: ${file}`);
  const state = phase10State();
  const next = attach(load(file, {}), state);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(temp, file);
  console.log(`枠別浮沈Shadow保存: ${next.frameRiseFallShadowAb.capturedCount}/${next.frameRiseFallShadowAb.recordCount}R／Phase10=${state.status}`);
}

if (require.main === module) main();
module.exports = { load, phase10State, attach, main };
