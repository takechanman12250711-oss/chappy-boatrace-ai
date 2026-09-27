"use strict";
// Restore saved native input fields, not forecast outputs or later result data.
const clone = x => JSON.parse(JSON.stringify(x));
function buildReplayInput(record) {
  const p = record?.prediction || record;
  const snapshot = p?.preRaceConditions || record?.preRaceConditions;
  const evidence = snapshot?.escapeEvaluationEvidence;
  if (evidence?.version !== "escape-evaluation-evidence-v1" || evidence.resultUsedForGeneration !== false) {
    throw Error("native-pre-deadline-evidence-unavailable");
  }
  const captured = Date.parse(record.selectedAt || record.capturedAt || "");
  const deadline = Date.parse(record.deadlineAt || record.deadline || "");
  const fetched = Date.parse(evidence.sourceFetchedAt || "");
  if (![captured, deadline, fetched].every(Number.isFinite) || fetched > captured || captured >= deadline) {
    throw Error("native-evidence-timestamp-invalid");
  }
  const entries = evidence.entries;
  const boat = e => Number(e?.boat ?? e?.waku ?? e?.boatNo);
  if (!Array.isArray(entries) || entries.length !== 6 ||
      entries.some(e => !Number.isInteger(boat(e)) || boat(e) < 1 || boat(e) > 6) ||
      new Set(entries.map(boat)).size !== 6) throw Error("native-six-boat-input-invalid");
  if (!Array.isArray(evidence.beforeInfo) || !Array.isArray(evidence.startExhibition) ||
      !evidence.historyContext || typeof evidence.historyContext !== "object") {
    throw Error("native-input-fields-incomplete");
  }
  // Explicit allowlist. Do not copy saved raceScenarios, outcomes, result or payout.
  // Native entry.boat identifies the lane; entry.boatNo may identify the hull.
  // This is not the compact schema-4 boats array and must not take that identity branch.
  return {
    date: String(record.date || record.raceKey?.slice(0, 8) || ""),
    jcd: record.jcd, stadiumCode: record.jcd, venueCode: record.jcd,
    placeName: record.place, venueName: record.place, raceNo: record.raceNo, rno: record.raceNo,
    source: snapshot.source, fetchedAt: evidence.sourceFetchedAt,
    analysisProfile: snapshot.analysisProfile,
    entries: clone(entries),
    beforeInfo: clone(evidence.beforeInfo),
    startExhibition: clone(evidence.startExhibition),
    raceInfo: clone(evidence.raceInfo || {}),
    historyContext: clone(evidence.historyContext),
    weather: clone(snapshot.weather || {})
  };
}
module.exports = { buildReplayInput };
