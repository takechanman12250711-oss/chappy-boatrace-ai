"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
const practicalSelection = require("../js/practical-selection");
const shadow = require("../js/frame-rise-fall-negative-clip-shadow");
const replay = require("../js/frame-rise-fall-shadow-replay");
const trial = require("../config/frame-rise-fall-negative-clip-trial.json");

const root = path.resolve(__dirname, "..");

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" })
    .format(new Date())
    .replaceAll("-", "");
}

function selectedAfterCutoff(selectedAt) {
  const selected = Date.parse(String(selectedAt || ""));
  const cutoff = Date.parse(String(trial?.cutoff?.selectedAtExclusiveLowerBound || ""));
  return Number.isFinite(selected) && Number.isFinite(cutoff) && selected > cutoff;
}

function compactSide(side = {}) {
  return {
    skipDecision: side?.skipDecision === true,
    mainScenario: side?.mainScenario || null,
    practicalTickets: Array.isArray(side?.practicalTickets) ? side.practicalTickets : [],
    decisionFingerprint: String(side?.decisionFingerprint || "")
  };
}

function compactReplay(value = {}) {
  return {
    version: value?.version,
    status: value?.status,
    a: compactSide(value?.a),
    b: compactSide(value?.b),
    decisionChanged: value?.decisionChanged === true,
    ticketContractViolations: Number(value?.ticketContractViolations || 0),
    comparableForFixed100: value?.comparableForFixed100 === true,
    productionAUnchanged: value?.productionAUnchanged !== false,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    error: value?.error
  };
}

function buildSnapshot(record = {}, dependencies = {}) {
  const cutoff = trial.cutoff || {};
  if (!selectedAfterCutoff(record?.selectedAt)) {
    return {
      candidateId: trial.candidateId,
      status: "before-or-at-cutoff",
      cutoff,
      usableForPrediction: false,
      automaticApplication: false
    };
  }

  const evidence = record?.prediction?.verificationEvidence || {};
  const scenarios = Array.isArray(evidence?.scenarios) ? evidence.scenarios : [];
  const frameMovement = Array.isArray(evidence?.frameMovement) ? evidence.frameMovement : [];
  if (scenarios.length < 2) {
    return {
      candidateId: trial.candidateId,
      status: "scenario-evidence-unavailable",
      cutoff,
      usableForPrediction: false,
      automaticApplication: false
    };
  }

  const candidate = shadow.build({
    mainScenario: evidence?.mainScenario || scenarios[0] || null,
    scenarios,
    frameMovement
  });

  if (candidate.status !== "shadow-ready") {
    return {
      candidateId: trial.candidateId,
      implementationFingerprint: shadow.LOGIC_FINGERPRINT,
      status: candidate.status,
      cutoff,
      applicableCount: candidate.applicableCount || 0,
      productionAUnchanged: candidate.productionAUnchanged === true,
      usableForPrediction: false,
      automaticApplication: false
    };
  }

  const downstreamReplay = replay.build(record, candidate, dependencies);
  const comparableForFixed100 = downstreamReplay?.comparableForFixed100 === true;

  return {
    candidateId: trial.candidateId,
    implementationFingerprint: shadow.LOGIC_FINGERPRINT,
    cutoff,
    selectedAt: String(record?.selectedAt || ""),
    raceKey: String(record?.raceKey || ""),
    status: candidate.status,
    applicableCount: candidate.applicableCount || 0,
    decisionChanged: downstreamReplay?.decisionChanged === true,
    downstreamReplay: compactReplay(downstreamReplay),
    comparisonContract: {
      comparableForFixed100,
      decisionChanged: downstreamReplay?.decisionChanged === true,
      ticketContractViolations: Number(downstreamReplay?.ticketContractViolations || 0),
      reason: comparableForFixed100
        ? "decision-fingerprint-changed-with-complete-replay"
        : String(downstreamReplay?.status || candidate.status)
    },
    productionAUnchanged:
      candidate.productionAUnchanged === true && downstreamReplay?.productionAUnchanged !== false,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    productionPredictionChanged: false,
    productionTicketSelectionChanged: false
  };
}

const dependencies = {
  coreApi: global.ChappyAICore,
  selector: practicalSelection
};

function attach(data = {}, deps = dependencies) {
  const rows = Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [];
  let capturedCount = 0;
  let comparableCount = 0;
  const verificationPredictions = rows.map(record => {
    const existing = record?.frameRiseFallNegativeClipShadowAb;
    const snapshot = existing?.candidateId === trial.candidateId
      ? existing
      : buildSnapshot(record, deps);
    if (snapshot?.status === "shadow-ready") capturedCount += 1;
    if (snapshot?.comparisonContract?.comparableForFixed100 === true) comparableCount += 1;
    return { ...record, frameRiseFallNegativeClipShadowAb: snapshot };
  });

  return {
    ...data,
    frameRiseFallNegativeClipShadowAb: {
      schemaVersion: 1,
      candidateId: trial.candidateId,
      cutoff: trial.cutoff,
      recordCount: verificationPredictions.length,
      capturedCount,
      comparableCount,
      fixedComparableRaces: Number(trial.fixedComparableRaces || 100),
      status: "prospective-shadow-collection",
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
  if (!fs.existsSync(file)) {
    console.log(`negative clip shadow対象なし: ${file}`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = attach(data);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(
    `negative clip shadow保存: ${next.frameRiseFallNegativeClipShadowAb.capturedCount}/${next.frameRiseFallNegativeClipShadowAb.recordCount}R` +
    `／比較${next.frameRiseFallNegativeClipShadowAb.comparableCount}/${next.frameRiseFallNegativeClipShadowAb.fixedComparableRaces}R`
  );
}

if (require.main === module) main();
module.exports = {
  selectedAfterCutoff,
  compactReplay,
  buildSnapshot,
  attach,
  dependencies,
  main
};
