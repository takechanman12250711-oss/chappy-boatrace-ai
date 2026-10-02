"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
const practicalSelection = require("../js/practical-selection");
const phase10Engine = require("../js/theory-ab-phase10");
const storage = require("../js/frame-rise-fall-shadow-storage");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");
const archiveFile = path.join(stats, "frame-rise-fall-shadow-snapshot-archive.json");
const INLINE_STORAGE = "archive-reference-v2";
const replayDependencies = {
  coreApi: global.ChappyAICore,
  selector: practicalSelection
};

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

function emptyArchive() {
  return {
    schemaVersion: 1,
    purpose: "immutable prospective frame-rise-fall shadow snapshots",
    snapshots: {}
  };
}

function snapshotArchiveKey(record = {}, snapshot = {}) {
  const cutoff = snapshot?.cutoff || {};
  const raceKey = String(record?.raceKey || "");
  const candidateId = String(snapshot?.candidateId || "");
  const candidateSpecFingerprint = String(snapshot?.candidateSpecFingerprint || "");
  const implementationFingerprint = String(snapshot?.implementationFingerprint || "");
  const cutoffSelectedAt = String(cutoff?.selectedAtExclusiveLowerBound || "");
  const cutoffSourceCommit = String(cutoff?.sourceCommit || "");
  const cutoffLogicFingerprint = String(cutoff?.logicFingerprint || "");
  if (!raceKey || !candidateId || !candidateSpecFingerprint || !implementationFingerprint || !cutoffSelectedAt) return "";
  return [raceKey, candidateId, candidateSpecFingerprint, implementationFingerprint, cutoffSelectedAt, cutoffSourceCommit, cutoffLogicFingerprint].join("|");
}

function shouldArchive(snapshot = {}) {
  return snapshot?.status === "shadow-ready";
}

function isCompactInlineSnapshot(snapshot = {}) {
  return snapshot?.inlineStorage === INLINE_STORAGE;
}

function preserveSnapshot(record = {}, snapshot = {}, archive = emptyArchive()) {
  if (!archive.snapshots || typeof archive.snapshots !== "object") archive.snapshots = {};
  const key = snapshotArchiveKey(record, snapshot);
  if (key && archive.snapshots[key]) return archive.snapshots[key];
  if (String(snapshot?.inlineStorage || "").startsWith("archive-reference-")) {
    throw new Error(`枠別浮沈Shadowの完全証拠archiveが見つかりません: ${key || record?.raceKey || "unknown"}`);
  }
  if (!shouldArchive(snapshot) || !key) return snapshot;
  archive.snapshots[key] = snapshot;
  return snapshot;
}

function compactReplaySide(side = {}) {
  return {
    skipDecision: side?.skipDecision === true,
    practicalTickets: Array.isArray(side?.practicalTickets) ? side.practicalTickets : []
  };
}

function compactDownstreamReplay(replay = {}) {
  if (!replay || typeof replay !== "object") return replay;
  if (replay.status !== "replay-ready") {
    return {
      version: replay.version,
      status: replay.status,
      comparableForFixed100: replay.comparableForFixed100 === true,
      error: replay.error
    };
  }
  return {
    version: replay.version,
    status: replay.status,
    a: compactReplaySide(replay.a),
    b: compactReplaySide(replay.b),
    decisionChanged: replay.decisionChanged === true,
    ticketContractViolations: Number(replay.ticketContractViolations || 0),
    comparableForFixed100: replay.comparableForFixed100 === true,
    productionAUnchanged: replay.productionAUnchanged === true,
    applicationMode: replay.applicationMode,
    usableForPrediction: replay.usableForPrediction === true,
    automaticApplication: replay.automaticApplication === true
  };
}

function compactInlineSnapshot(record = {}, snapshot = {}) {
  if (!shouldArchive(snapshot)) return snapshot;
  const immutableArchiveKey = snapshotArchiveKey(record, snapshot);
  if (!immutableArchiveKey) return snapshot;
  return {
    version: snapshot.version,
    inlineStorage: INLINE_STORAGE,
    immutableArchiveKey,
    candidateId: snapshot.candidateId,
    candidateSpecFingerprint: snapshot.candidateSpecFingerprint,
    implementationFingerprint: snapshot.implementationFingerprint,
    cutoff: snapshot.cutoff,
    selectedAt: snapshot.selectedAt,
    raceKey: snapshot.raceKey,
    status: snapshot.status,
    decisionChanged: snapshot.decisionChanged,
    applicableCount: snapshot.applicableCount,
    downstreamReplay: compactDownstreamReplay(snapshot.downstreamReplay),
    productionAUnchanged: snapshot.productionAUnchanged,
    comparisonContract: snapshot.comparisonContract,
    applicationMode: snapshot.applicationMode,
    usableForPrediction: snapshot.usableForPrediction,
    automaticApplication: snapshot.automaticApplication
  };
}

function attach(data = {}, state = phase10State(), dependencies = replayDependencies, archive = emptyArchive()) {
  const rows = Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [];
  let capturedCount = 0;
  let applicableCount = 0;
  let decisionChangedCount = 0;
  let comparableRaceCount = 0;
  const verificationPredictions = rows.map(record => {
    let snapshot;
    if (record?.frameRiseFallShadowAb && typeof record.frameRiseFallShadowAb === "object") snapshot = preserveSnapshot(record, record.frameRiseFallShadowAb, archive);
    else snapshot = preserveSnapshot(record, storage.build(record, state, dependencies), archive);
    capturedCount += snapshot.status === "shadow-ready" ? 1 : 0;
    applicableCount += Number(snapshot.applicableCount || 0) > 0 ? 1 : 0;
    decisionChangedCount += snapshot.decisionChanged === true ? 1 : 0;
    comparableRaceCount += snapshot?.comparisonContract?.comparableForFixed100 === true ? 1 : 0;
    return { ...record, frameRiseFallShadowAb: compactInlineSnapshot(record, snapshot) };
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
      comparableRaceCount,
      comparisonCollectionStatus: comparableRaceCount > 0 ? "collecting-fixed-100" : "awaiting-complete-decision-replay",
      immutableArchiveCount: Object.keys(archive.snapshots || {}).length,
      inlineStorage: INLINE_STORAGE,
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
  const archive = load(archiveFile, emptyArchive());
  const next = attach(load(file, {}), state, replayDependencies, archive);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(temp, file);
  fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2) + "\n", "utf8");
  console.log(`枠別浮沈Shadow保存: ${next.frameRiseFallShadowAb.capturedCount}/${next.frameRiseFallShadowAb.recordCount}R／比較${next.frameRiseFallShadowAb.comparableRaceCount}/${next.frameRiseFallShadowAb.fixedComparableRaceCount}R／不変保存${next.frameRiseFallShadowAb.immutableArchiveCount}件／Phase10=${state.status}`);
}

if (require.main === module) main();
module.exports = {
  INLINE_STORAGE,
  load,
  phase10State,
  emptyArchive,
  snapshotArchiveKey,
  shouldArchive,
  isCompactInlineSnapshot,
  preserveSnapshot,
  compactReplaySide,
  compactDownstreamReplay,
  compactInlineSnapshot,
  replayDependencies,
  attach,
  main
};
