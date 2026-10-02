// scripts/build-scenario-ai-v6-snapshots.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const scenarioAiV6ShadowAb = require("../js/scenario-ai-v6-shadow-ab");

const STANDARD_SCENARIO_TYPES = new Set([
  "escape",
  "sashi",
  "threeAttack",
  "fourAttack"
]);

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

function storedScenarioRows(record = {}) {
  return (Array.isArray(record?.scenarioLikelihoodV5?.scenarios)
    ? record.scenarioLikelihoodV5.scenarios
    : [])
    .map(row => ({
      type: String(row?.key || row?.scenarioType || ""),
      label: String(row?.label || ""),
      score: Number(row?.score || 0)
    }))
    .filter(row =>
      STANDARD_SCENARIO_TYPES.has(row.type) &&
      Number.isFinite(row.score) &&
      row.score > 0
    );
}

function storedMarks(record = {}) {
  const sheet = record?.prediction?.mainSheet || {};
  return {
    honmei: sheet.honmei || null,
    main: sheet.honmei || null,
    taikou: sheet.taikou || null,
    rival: sheet.taikou || null,
    third: sheet.ana || sheet.osae || null,
    ana: sheet.ana || null,
    osae: sheet.osae || null
  };
}

function snapshotInputFor(record = {}) {
  const verificationEvidence = record?.prediction?.verificationEvidence || null;
  const evidenceScenarios = Array.isArray(verificationEvidence?.scenarios)
    ? verificationEvidence.scenarios.filter(Boolean)
    : [];
  const fallbackScenarios = storedScenarioRows(record);
  const raceScenarios = evidenceScenarios.length >= 2
    ? evidenceScenarios
    : fallbackScenarios;
  const inputSourceKind = evidenceScenarios.length >= 2
    ? "live-verification-evidence"
    : fallbackScenarios.length >= 2
      ? "stored-v5-pre-race"
      : "single-scenario-evidence";

  return {
    verificationEvidence,
    inputSourceKind,
    preRaceConditions:
      record?.prediction?.preRaceConditions ||
      record?.preRaceConditions ||
      null,
    marks: storedMarks(record),
    aiCore: {
      marks: storedMarks(record),
      raceScenarios: {
        scenarios: raceScenarios
      }
    }
  };
}

function snapshotLocked(record = {}) {
  const verified = record?.scenarioAiV6Verification?.status === "verified";
  const hasStoredShadow =
    record?.scenarioAiV6Shadow !== null &&
    typeof record?.scenarioAiV6Shadow === "object" &&
    !Array.isArray(record.scenarioAiV6Shadow);
  const hasStoredShadowAb =
    record?.scenarioAiV6ShadowAb !== null &&
    typeof record?.scenarioAiV6ShadowAb === "object" &&
    !Array.isArray(record.scenarioAiV6ShadowAb);

  return verified || (hasStoredShadow && hasStoredShadowAb);
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
  let decisionChangedCount = 0;
  let distributionChangedCount = 0;
  let lockedCount = 0;
  const verificationPredictions = rows.map(record => {
    if (snapshotLocked(record)) {
      lockedCount += 1;
      if (record?.scenarioAiV6Shadow?.status === "shadow-ready") readyCount += 1;
      if (record?.scenarioAiV6ShadowAb?.decisionChanged === true) {
        decisionChangedCount += 1;
      }
      if (record?.scenarioAiV6ShadowAb?.distributionChanged === true) {
        changedCount += 1;
        distributionChangedCount += 1;
      }
      return record;
    }
    const snapshot = builder(snapshotInputFor(record));
    const shadowAb = shadowAbBuilder(snapshot, approvalReport, {
      jcd: record?.jcd,
      selectedAt: record?.selectedAt
    });
    if (snapshot?.status === "shadow-ready") readyCount += 1;
    if (shadowAb?.decisionChanged === true) decisionChangedCount += 1;
    if (shadowAb?.distributionChanged === true) {
      changedCount += 1;
      distributionChangedCount += 1;
    }
    return {
      ...record,
      scenarioAiV6Shadow: snapshot,
      scenarioAiV6ShadowAb: shadowAb
    };
  });

  return {
    ...data,
    scenarioAiV6: {
      version: scenarioAiV6.VERSION,
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      recordCount: verificationPredictions.length,
      readyCount,
      lockedCount,
      mutableRecordCount: verificationPredictions.length - lockedCount,
      usableForPrediction: false,
      automaticApplication: false
    },
    scenarioAiV6ShadowAb: {
      version: scenarioAiV6ShadowAb.VERSION,
      logicFingerprint: scenarioAiV6ShadowAb.LOGIC_FINGERPRINT,
      sourceLogicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
      candidateSetFingerprint:
        scenarioAiV6ShadowAb.candidateSetFingerprint(approvalReport),
      recordCount: verificationPredictions.length,
      changedCount,
      decisionChangedCount,
      distributionChangedCount,
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

module.exports = {
  attachSnapshots,
  normalizeDate,
  loadApprovalReport,
  storedScenarioRows,
  storedMarks,
  snapshotInputFor,
  snapshotLocked
};
