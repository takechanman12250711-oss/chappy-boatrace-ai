"use strict";

const CORE_PRIORITY = Object.freeze([
  "race-flow","course","start","exhibition","remain-pickup","local-water","skill","motor",
  "wall-boat","frame-rise-fall","double-time","new-engine"
]);

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function build(performance = {}) {
  const rows = Array.isArray(performance?.byTheory) ? performance.byTheory : [];
  const map = new Map(rows.map(row => [String(row?.theoryKey || row?.key || ""), row]));
  const theories = CORE_PRIORITY.map((theoryKey, index) => {
    const row = map.get(theoryKey) || {};
    const evaluatedCount = finite(row.evaluatedCount);
    const useCount = finite(row.useCount);
    const status = evaluatedCount >= 30
      ? "ready-for-review"
      : evaluatedCount > 0
        ? "collecting"
        : "formal-evidence-missing";
    return {
      priority: index + 1,
      theoryKey,
      label: String(row.label || theoryKey),
      raceCount: finite(row.raceCount),
      useCount,
      evaluatedCount,
      formalEvidenceAvailable: evaluatedCount > 0 || useCount > 0,
      status
    };
  });

  const missing = theories.filter(row => row.status === "formal-evidence-missing");
  const collecting = theories.filter(row => row.status === "collecting");
  const ready = theories.filter(row => row.status === "ready-for-review");

  return {
    schemaVersion: 1,
    engineVersion: "theory-evidence-coverage-phase7-20260807",
    status: missing.length ? "evidence-expansion-required" : collecting.length ? "collecting-data" : "ready",
    theoryCount: theories.length,
    readyCount: ready.length,
    collectingCount: collecting.length,
    missingEvidenceCount: missing.length,
    nextTheoryToInstrument: missing[0]?.theoryKey || null,
    theories,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { CORE_PRIORITY, build };
