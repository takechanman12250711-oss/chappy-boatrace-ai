"use strict";

const fs = require("node:fs");
const path = require("node:path");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const scenarioAiV6ShadowAb = require("../js/scenario-ai-v6-shadow-ab");

const ROOT = path.resolve(__dirname, "..");
const PREDICTIONS_DIR = path.join(ROOT, "data", "predictions");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-ab-report.json");

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function normalizeOrder(value) {
  const order = Array.isArray(value)
    ? value.map(Number).slice(0, 3)
    : [];
  return order.length === 3 &&
    order.every(boat => boat >= 1 && boat <= 6) &&
    new Set(order).size === 3
    ? order
    : [];
}

function sameOrder(left, right) {
  const a = normalizeOrder(left);
  const b = normalizeOrder(right);
  return a.length === 3 &&
    b.length === 3 &&
    a.every((boat, index) => boat === b[index]);
}

function parseTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : null;
}

function scoreScenario(scenario = {}, actualOrder = []) {
  const finishOrder = normalizeOrder(scenario?.finishOrder);
  const ticket = normalizeTicket(scenario?.representativeTicket);
  const ticketOrder = ticket ? ticket.split("-").map(Number) : [];
  const predictedOrder = finishOrder.length ? finishOrder : ticketOrder;
  const scoreSource = finishOrder.length
    ? "finish-order"
    : ticketOrder.length === 3
      ? "legacy-ticket"
      : "unavailable";
  const actual = normalizeOrder(actualOrder);
  const exact = predictedOrder.length === 3 &&
    actual.length === 3 &&
    predictedOrder.every((boat, index) => boat === actual[index]);
  const firstHit = Boolean(
    predictedOrder[0] &&
    actual[0] &&
    predictedOrder[0] === actual[0]
  );
  const top2Hit = predictedOrder.length >= 2 &&
    actual.length >= 2 &&
    predictedOrder.slice(0, 2).every(boat => actual.slice(0, 2).includes(boat));
  return {
    ticket,
    predictedOrder,
    scoreSource,
    scoreable: predictedOrder.length === 3,
    exact,
    firstHit,
    top2Hit
  };
}

function compareRecord(record = {}) {
  const sourceSnapshot = record?.scenarioAiV6Shadow || {};
  const shadow = record?.scenarioAiV6ShadowAb || {};
  const verification = record?.scenarioAiV6Verification || {};
  const actualOrder = normalizeOrder(verification?.actualOrder);
  const aTop = shadow?.a?.scenarios?.[0] || null;
  const bTop = shadow?.b?.scenarios?.[0] || null;
  const raceKey = String(record?.raceKey || "");
  if (!raceKey || !aTop || !bTop || actualOrder.length < 3) return null;

  const a = scoreScenario(aTop, actualOrder);
  const b = scoreScenario(bTop, actualOrder);
  const metric = row => (row.exact ? 3 : row.firstHit ? 2 : row.top2Hit ? 1 : 0);
  const aScore = metric(a);
  const bScore = metric(b);
  const sourceLogicFingerprint = String(shadow?.sourceLogicFingerprint || "");
  const verificationLogicFingerprint = String(verification?.logicFingerprint || "");
  const candidateSetFingerprint = String(shadow?.candidateSetFingerprint || "none") || "none";
  const candidateTrainingFingerprint = String(
    shadow?.candidateTrainingFingerprint || "none"
  ) || "none";
  const candidateTrainingCutoff = String(shadow?.candidateTrainingCutoff || "");
  const selectedAt = String(record?.selectedAt || "");
  const capturedAt = String(shadow?.capturedAt || "");
  const inputSourceKind = String(shadow?.inputSourceKind || "");
  const snapshotSourceKind = String(sourceSnapshot?.inputSourceKind || "");
  const verificationSourceKind = String(verification?.inputSourceKind || "");
  const candidateTrainingInputSourceKind = String(
    shadow?.candidateTrainingInputSourceKind || ""
  );
  const currentGeneration =
    shadow?.logicFingerprint === scenarioAiV6ShadowAb.LOGIC_FINGERPRINT &&
    sourceSnapshot?.logicFingerprint === scenarioAiV6.LOGIC_FINGERPRINT &&
    sourceLogicFingerprint === scenarioAiV6.LOGIC_FINGERPRINT &&
    verificationLogicFingerprint === scenarioAiV6.LOGIC_FINGERPRINT;
  const sourceKindMatches = Boolean(
    inputSourceKind &&
    inputSourceKind !== "unknown" &&
    inputSourceKind === snapshotSourceKind &&
    inputSourceKind === verificationSourceKind &&
    inputSourceKind === candidateTrainingInputSourceKind
  );
  const expectedCohortKey = [
    sourceLogicFingerprint || "unknown",
    inputSourceKind || "unknown",
    candidateSetFingerprint,
    candidateTrainingFingerprint
  ].join("|");
  const cohortKey = String(shadow?.cohortKey || "");
  const cohortMetadataMatches = Boolean(cohortKey && cohortKey === expectedCohortKey);
  const selectedTime = parseTime(selectedAt);
  const capturedTime = parseTime(capturedAt);
  const cutoffTime = parseTime(candidateTrainingCutoff);
  const trainingMetadataReady =
    candidateTrainingFingerprint !== "none" &&
    cutoffTime !== null;
  const captureMatchesSelection =
    selectedTime !== null &&
    capturedTime !== null &&
    selectedTime === capturedTime;
  const selectedAfterTrainingCutoff =
    selectedTime !== null &&
    cutoffTime !== null &&
    selectedTime > cutoffTime;
  const temporalEligible =
    trainingMetadataReady &&
    captureMatchesSelection &&
    selectedAfterTrainingCutoff;
  const shadowComparisonReady = shadow?.comparisonReady === true;
  const shadowInvariantReady =
    shadowComparisonReady &&
    shadow?.variantEligible === true &&
    shadow?.decisionChanged === true &&
    shadow?.scoreableDecision === true;
  const scoreableDecisionDisagreement =
    a.scoreable &&
    b.scoreable &&
    !sameOrder(a.predictedOrder, b.predictedOrder);
  const topFinishOrderDecisionDisagreement =
    a.scoreSource === "finish-order" &&
    b.scoreSource === "finish-order" &&
    scoreableDecisionDisagreement;
  const productionComparisonEligible =
    currentGeneration &&
    sourceKindMatches &&
    cohortMetadataMatches &&
    temporalEligible &&
    candidateSetFingerprint !== "none" &&
    shadowInvariantReady &&
    topFinishOrderDecisionDisagreement;

  return {
    raceKey,
    date: String(record?.date || ""),
    jcd: String(record?.jcd || "").padStart(2, "0"),
    place: String(record?.place || ""),
    selectedAt,
    selectedTime,
    capturedAt,
    changed: shadow?.decisionChanged === true,
    decisionChanged: shadow?.decisionChanged === true,
    distributionChanged: shadow?.distributionChanged === true,
    shadowComparisonReady,
    shadowInvariantReady,
    scoreableDecisionDisagreement,
    topFinishOrderDecisionDisagreement,
    productionComparisonEligible,
    currentGeneration,
    sourceLogicFingerprint,
    verificationLogicFingerprint,
    inputSourceKind,
    snapshotSourceKind,
    verificationSourceKind,
    candidateTrainingInputSourceKind,
    sourceKindMatches,
    candidateSetFingerprint,
    candidateTrainingFingerprint,
    candidateTrainingCutoff,
    trainingMetadataReady,
    captureMatchesSelection,
    selectedAfterTrainingCutoff,
    temporalEligible,
    cohortKey,
    expectedCohortKey,
    cohortMetadataMatches,
    actualOrder,
    a: { ...a, scenarioType: String(aTop?.scenarioType || "") },
    b: { ...b, scenarioType: String(bTop?.scenarioType || "") },
    winner: bScore > aScore ? "B" : aScore > bScore ? "A" : "tie"
  };
}

function summarize(rows = []) {
  const source = rows.filter(Boolean);
  const count = key => source.filter(row => row.winner === key).length;
  const aExact = source.filter(row => row.a.exact).length;
  const bExact = source.filter(row => row.b.exact).length;
  const aFirst = source.filter(row => row.a.firstHit).length;
  const bFirst = source.filter(row => row.b.firstHit).length;
  return {
    comparableCount: source.length,
    changedComparableCount: source.filter(row => row.decisionChanged).length,
    aWins: count("A"),
    bWins: count("B"),
    ties: count("tie"),
    aExactCount: aExact,
    bExactCount: bExact,
    aFirstHitCount: aFirst,
    bFirstHitCount: bFirst,
    bWinRate: source.length ? Math.round(count("B") / source.length * 1000) / 10 : 0,
    bExactLift: bExact - aExact,
    bFirstHitLift: bFirst - aFirst
  };
}

function rowOrder(left, right) {
  const leftTime = Number.isFinite(left?.selectedTime) ? left.selectedTime : -Infinity;
  const rightTime = Number.isFinite(right?.selectedTime) ? right.selectedTime : -Infinity;
  return leftTime - rightTime ||
    String(left?.date || "").localeCompare(String(right?.date || "")) ||
    String(left?.raceKey || "").localeCompare(String(right?.raceKey || ""));
}

function splitRows(rows = []) {
  const sorted = [...rows].sort(rowOrder);
  const midpoint = Math.ceil(sorted.length / 2);
  return { firstHalf: sorted.slice(0, midpoint), secondHalf: sorted.slice(midpoint) };
}

function deduplicateRows(rows = []) {
  const byRaceKey = new Map();
  let duplicateCount = 0;
  rows.forEach(row => {
    const existing = byRaceKey.get(row.raceKey);
    if (!existing) {
      byRaceKey.set(row.raceKey, row);
      return;
    }
    duplicateCount += 1;
    if (rowOrder(existing, row) <= 0) byRaceKey.set(row.raceKey, row);
  });
  return { rows: [...byRaceKey.values()], duplicateCount };
}

function buildReport(documents = []) {
  const rawObservedRows = documents.flatMap(doc =>
    (Array.isArray(doc?.verificationPredictions)
      ? doc.verificationPredictions
      : [])
      .map(compareRecord)
      .filter(Boolean)
  );
  const deduplicated = deduplicateRows(rawObservedRows);
  const observedRows = deduplicated.rows;
  const currentGenerationRows = observedRows.filter(row => row.currentGeneration);
  const currentSourceMatchedRows = currentGenerationRows.filter(row =>
    row.sourceKindMatches
  );
  const currentMetadataMatchedRows = currentSourceMatchedRows.filter(row =>
    row.cohortMetadataMatches
  );
  // Choose the latest current-generation observation before validating its
  // metadata. Falling back to an older valid cohort would revive a stale
  // candidate after a malformed or candidate-none observation.
  const latestCurrent = [...currentGenerationRows].sort(rowOrder).at(-1) || null;
  const activeCohortKey = String(latestCurrent?.cohortKey || "");
  const activeCandidateSetFingerprint = String(
    latestCurrent?.candidateSetFingerprint || "none"
  ) || "none";
  const activeObservedRows = latestCurrent
    ? currentGenerationRows.filter(row => row.cohortKey === activeCohortKey)
    : [];
  const activeMetadataReady = Boolean(
    latestCurrent &&
    latestCurrent.sourceKindMatches &&
    latestCurrent.cohortMetadataMatches &&
    (
      activeCandidateSetFingerprint === "none" ||
      latestCurrent.temporalEligible
    )
  );
  const rows = activeCandidateSetFingerprint === "none" || !activeMetadataReady
    ? []
    : activeObservedRows.filter(row => row.productionComparisonEligible);
  const halves = splitRows(rows);
  const byVenue = [...new Set(rows.map(row => row.jcd))].map(jcd => ({
    jcd,
    place: rows.find(row => row.jcd === jcd)?.place || "",
    ...summarize(rows.filter(row => row.jcd === jcd))
  }));
  const overall = summarize(rows);
  const firstHalf = summarize(halves.firstHalf);
  const secondHalf = summarize(halves.secondHalf);
  const majorVenueRegression = byVenue.filter(row =>
    row.comparableCount >= 10 &&
    row.aWins - row.bWins >= 4
  );
  const productionCandidate =
    overall.comparableCount >= 100 &&
    overall.bWins >= 30 &&
    overall.bWins - overall.aWins >= 5 &&
    firstHalf.bWins > firstHalf.aWins &&
    secondHalf.bWins > secondHalf.aWins &&
    majorVenueRegression.length === 0;

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    source: "scenarioAiV6ShadowAb + scenarioAiV6Verification",
    logicFingerprint: scenarioAiV6ShadowAb.LOGIC_FINGERPRINT,
    sourceLogicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
    activeCohortKey,
    activeCandidateSetFingerprint,
    activeMetadataReady,
    activeInputSourceKind: String(latestCurrent?.inputSourceKind || ""),
    activeCandidateTrainingFingerprint: String(
      latestCurrent?.candidateTrainingFingerprint || "none"
    ),
    activeCandidateTrainingCutoff: String(
      latestCurrent?.candidateTrainingCutoff || ""
    ),
    observation: {
      rawResultMatchedCount: rawObservedRows.length,
      resultMatchedCount: observedRows.length,
      duplicateRaceKeyExcludedCount: deduplicated.duplicateCount,
      currentGenerationCount:
        currentGenerationRows.length,
      currentSourceMatchedCount: currentSourceMatchedRows.length,
      currentMetadataMatchedCount: currentMetadataMatchedRows.length,
      activeCohortObservedCount: activeObservedRows.length,
      distributionChangedCount:
        activeObservedRows.filter(row => row.distributionChanged).length,
      decisionChangedCount:
        activeObservedRows.filter(row => row.decisionChanged).length,
      shadowComparisonReadyCount:
        activeObservedRows.filter(row => row.shadowComparisonReady).length,
      topFinishOrderDecisionDisagreementCount:
        activeObservedRows.filter(row => row.topFinishOrderDecisionDisagreement).length,
      productionComparisonEligibleCount: rows.length,
      legacyTicketFallbackCount:
        activeObservedRows.filter(row =>
          row.a.scoreSource === "legacy-ticket" ||
          row.b.scoreSource === "legacy-ticket"
        ).length,
      candidateUnavailableCount:
        activeObservedRows.filter(row => row.candidateSetFingerprint === "none").length,
      unchangedCount:
        activeObservedRows.filter(row => !row.distributionChanged).length,
      excludedOldGenerationCount:
        observedRows.filter(row => !row.currentGeneration).length,
      excludedSourceKindMismatchCount:
        observedRows.filter(row => row.currentGeneration && !row.sourceKindMatches).length,
      excludedCohortMetadataMismatchCount:
        observedRows.filter(row =>
          row.currentGeneration &&
          row.sourceKindMatches &&
          !row.cohortMetadataMatches
        ).length,
      excludedTrainingMetadataCount:
        activeObservedRows.filter(row => !row.trainingMetadataReady).length,
      excludedTemporalCount:
        activeObservedRows.filter(row =>
          row.trainingMetadataReady &&
          !row.temporalEligible
        ).length,
      excludedOtherCohortCount:
        currentGenerationRows.filter(row => row.cohortKey !== activeCohortKey).length,
      excludedNonFinishOrderDecisionCount:
        activeObservedRows.filter(row =>
          row.shadowComparisonReady &&
          !row.topFinishOrderDecisionDisagreement
        ).length
    },
    overall,
    firstHalf,
    secondHalf,
    byVenue,
    majorVenueRegression,
    productionGate: {
      status: productionCandidate ? "production-candidate" : "collecting-evidence",
      productionCandidate,
      evaluationPopulation: "top-finish-order-decision-disagreement-only",
      requiresShadowComparisonReady: true,
      requiresTopFinishOrderDecisionDisagreement: true,
      legacyTicketFallbackEligible: false,
      requiresCurrentGeneration: true,
      requiresMatchingInputSourceKind: true,
      requiresTrainingFingerprintAndStrictPostCutoffSelection: true,
      minimumComparableCount: 100,
      minimumBWins: 30,
      minimumBWinLead: 5,
      requiresBothHalvesBAdvantage: true,
      requiresNoMajorVenueRegression: true
    },
    rows,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function readDocuments(directory = PREDICTIONS_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function main() {
  const report = buildReport(readDocuments());
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `展開AI v6 A/B：有効比較${report.overall.comparableCount}R` +
    `／現行観測${report.observation.activeCohortObservedCount}R` +
    `／A勝ち${report.overall.aWins}／B勝ち${report.overall.bWins}`
  );
}

if (require.main === module) main();
module.exports = {
  buildReport,
  compareRecord,
  summarize,
  splitRows,
  scoreScenario,
  normalizeOrder,
  sameOrder,
  deduplicateRows
};
