/* チャッピーボートレースAI: 外攻め買い目A/B事前固定判定ゲート（読取専用・自動採用なし） */
(function (root, factory) {
  "use strict";
  const settlement = typeof module === "object" && module.exports
    ? require("./outer-attack-ticket-settlement.js")
    : root?.ChappyOuterAttackTicketSettlement;
  const api = factory(settlement);
  if (root) root.ChappyOuterAttackTicketDecisionGate = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.localStorage) api.install(root);
})(typeof window !== "undefined" ? window : globalThis, function (settlement) {
  "use strict";

  const VERSION = "outer-attack-ticket-decision-gate-v1";
  const STORAGE_KEY = "chappy_outer_attack_ticket_decision_gate_v1";
  const HOOK_MARK = "__chappyOuterAttackTicketDecisionGateV1";
  const CONFIG = deepFreeze({
    schemaVersion: 1,
    gateId: VERSION,
    sourceSettlementVersion: "outer-attack-ticket-settlement-v1",
    sourceReportId: "outer-attack-ticket-ab-report-v1",
    sourceMainCommit: "ee644d55b889c0ff38f198b9747c9c4d86c83425",
    frozenAt: "2026-08-31T01:40:00.000Z",
    prospectiveStartAt: "2026-08-31T02:00:00.000Z",
    primaryCohort: "prediction-before-result",
    variantOrder: ["cover", "flow", "hole"],
    milestones: [100, 250, 500],
    minimumDistinctDates: { interim: 10, final: 20 },
    sameStakeCoverageMinimumPercent: 100,
    harmReview: {
      minimumSampleCount: 100,
      combination: "all",
      maximumHitCountDelta: -3,
      maximumRoiPointDelta: -10
    },
    interimGate: {
      minimumSampleCount: 250,
      minimumHitCountDelta: 3,
      minimumHitRatePointDelta: 1,
      minimumProfitDeltaYen: 1,
      minimumRoiPointDelta: 5,
      maximumOneSidedPairedPValue: 0.1,
      requireBothHalvesNonNegativeHitDelta: true,
      requireBothHalvesNonNegativeProfitDelta: true,
      requireJackknifeProfitPositive: true
    },
    finalGate: {
      minimumSampleCount: 500,
      minimumHitCountDelta: 5,
      minimumHitRatePointDelta: 1,
      minimumProfitDeltaYen: 1,
      minimumRoiPointDelta: 5,
      maximumOneSidedPairedPValue: 0.05,
      requireBothHalvesNonNegativeHitDelta: true,
      requireBothHalvesNonNegativeProfitDelta: true,
      requireJackknifeProfitPositive: true
    },
    splitPolicy: "chronological-halves-by-shadowCaptureAt-then-raceKey",
    singleRaceDominancePolicy: "remove-largest-positive-race-profit-delta-and-require-remaining-positive",
    selectionOrder: [
      "jackknifeProfitDeltaYen desc",
      "oneSidedPairedPValue asc",
      "hitCountDelta desc",
      "roiPointDelta desc",
      "preRegisteredVariantOrder asc"
    ],
    safety: {
      productionChanged: false,
      automaticApplication: false,
      humanApprovalRequired: true,
      thresholdSearchPerformed: false,
      resultUsedForPredictionGeneration: false,
      oddsUsedForTicketGenerationOrDeletion: false,
      resultFirstExcludedFromPrimaryDecision: true,
      unknownCaptureOrderExcludedFromPrimaryDecision: true,
      rowsBeforeProspectiveStartExcluded: true,
      uiChanged: false
    }
  });

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const finite = value => Number.isFinite(Number(value));
  const num = (value, fallback = 0) => finite(value) ? Number(value) : fallback;
  const round = (value, digits = 1) => Math.round(num(value) * 10 ** digits) / 10 ** digits;
  const rate = (count, total) => total > 0 ? round(num(count) / total * 100, 1) : 0;
  const timestamp = value => {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const raceDate = row => String(row?.sourceRaceKey || "").slice(0, 8);
  const rowTime = row => timestamp(row?.shadowCaptureAt || row?.settledAt);

  function readJson(rootObject, key, fallback) {
    try {
      const raw = rootObject?.localStorage?.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value ?? fallback;
    } catch (error) {
      console.warn(`[outer-attack-ticket-decision-gate] ${key}を読み込めません`, error);
      return fallback;
    }
  }

  function writeJson(rootObject, key, value) {
    rootObject?.localStorage?.setItem(key, JSON.stringify(value));
    return value;
  }

  function readDecision(rootObject) {
    const value = readJson(rootObject, STORAGE_KEY, null);
    return value && typeof value === "object" ? value : null;
  }

  function readSettlements(rootObject) {
    if (typeof settlement?.readSettlements === "function") {
      return settlement.readSettlements(rootObject);
    }
    const key = settlement?.STORAGE_KEY || "chappy_outer_attack_ticket_settlements_v1";
    const rows = readJson(rootObject, key, []);
    return Array.isArray(rows) ? rows : [];
  }

  function classifySettlement(row = {}) {
    if (row?.status !== "settled-shadow-only") return "not-settled-shadow";
    if (row?.settlementVersion !== CONFIG.sourceSettlementVersion) return "settlement-version-mismatch";
    if (row?.comparisonEligible !== true || row?.resultUsedForGeneration === true) return "not-comparison-eligible";
    if (row?.captureOrder === "result-before-prediction") return "result-first";
    if (row?.captureOrder !== CONFIG.primaryCohort) return "unknown-capture-order";
    if (rowTime(row) < timestamp(CONFIG.prospectiveStartAt)) return "before-prospective-start";
    if (!row?.sourceRaceKey) return "race-key-missing";
    return "eligible";
  }

  function pairedOneSidedPValue(bOnlyHit, aOnlyHit) {
    const successes = Math.max(0, Math.trunc(num(bOnlyHit)));
    const failures = Math.max(0, Math.trunc(num(aOnlyHit)));
    const trials = successes + failures;
    if (!trials) return null;
    let combination = 1;
    let probability = 0;
    const base = Math.pow(0.5, trials);
    for (let count = 0; count <= trials; count += 1) {
      if (count >= successes) probability += combination * base;
      combination = count < trials
        ? combination * (trials - count) / (count + 1)
        : combination;
    }
    return Math.min(1, Number(probability.toFixed(6)));
  }

  function outcomeMetrics(rows, variantKey) {
    let aHitCount = 0;
    let bHitCount = 0;
    let aInvestmentYen = 0;
    let bInvestmentYen = 0;
    let aReturnYen = 0;
    let bReturnYen = 0;
    let bothHit = 0;
    let aOnlyHit = 0;
    let bOnlyHit = 0;
    let neitherHit = 0;
    let sameStakeCount = 0;
    const raceProfitDeltas = [];

    for (const row of rows) {
      const a = row?.comparison?.a || {};
      const b = row?.comparison?.variants?.[variantKey]?.outcome || {};
      const aHit = a.hit === true;
      const bHit = b.hit === true;
      const aInvestment = Math.max(0, num(a.investmentYen));
      const bInvestment = Math.max(0, num(b.investmentYen));
      const aReturn = Math.max(0, num(a.returnYen));
      const bReturn = Math.max(0, num(b.returnYen));
      aHitCount += Number(aHit);
      bHitCount += Number(bHit);
      aInvestmentYen += aInvestment;
      bInvestmentYen += bInvestment;
      aReturnYen += aReturn;
      bReturnYen += bReturn;
      sameStakeCount += Number(aInvestment === bInvestment && aInvestment > 0);
      if (aHit && bHit) bothHit += 1;
      else if (aHit) aOnlyHit += 1;
      else if (bHit) bOnlyHit += 1;
      else neitherHit += 1;
      raceProfitDeltas.push((bReturn - bInvestment) - (aReturn - aInvestment));
    }

    const sampleCount = rows.length;
    const aProfitYen = aReturnYen - aInvestmentYen;
    const bProfitYen = bReturnYen - bInvestmentYen;
    const aRoiPercent = aInvestmentYen ? round(aReturnYen / aInvestmentYen * 100, 1) : 0;
    const bRoiPercent = bInvestmentYen ? round(bReturnYen / bInvestmentYen * 100, 1) : 0;
    const largestPositiveRaceProfitDeltaYen = Math.max(0, ...raceProfitDeltas);
    const profitDeltaYen = bProfitYen - aProfitYen;

    return {
      sampleCount,
      a: {
        hitCount: aHitCount,
        hitRatePercent: rate(aHitCount, sampleCount),
        investmentYen: aInvestmentYen,
        returnYen: aReturnYen,
        profitYen: aProfitYen,
        roiPercent: aRoiPercent
      },
      b: {
        hitCount: bHitCount,
        hitRatePercent: rate(bHitCount, sampleCount),
        investmentYen: bInvestmentYen,
        returnYen: bReturnYen,
        profitYen: bProfitYen,
        roiPercent: bRoiPercent
      },
      pairOutcomes: { bothHit, aOnlyHit, bOnlyHit, neitherHit },
      hitCountDelta: bHitCount - aHitCount,
      hitRatePointDelta: round(rate(bHitCount, sampleCount) - rate(aHitCount, sampleCount), 1),
      returnDeltaYen: bReturnYen - aReturnYen,
      profitDeltaYen,
      roiPointDelta: round(bRoiPercent - aRoiPercent, 1),
      sameStakeCount,
      sameStakeCoveragePercent: rate(sameStakeCount, sampleCount),
      largestPositiveRaceProfitDeltaYen,
      jackknifeProfitDeltaYen: profitDeltaYen - largestPositiveRaceProfitDeltaYen,
      oneSidedPairedPValue: pairedOneSidedPValue(bOnlyHit, aOnlyHit)
    };
  }

  function variantRows(rows, variantKey) {
    return rows.filter(row =>
      row?.variantMetadata?.[variantKey]?.status === "ready" &&
      row?.comparison?.variants?.[variantKey]?.status === "ready" &&
      row?.comparison?.a &&
      row?.comparison?.variants?.[variantKey]?.outcome
    );
  }

  function chronological(rows) {
    return rows.slice().sort((left, right) =>
      rowTime(left) - rowTime(right) ||
      String(left?.sourceRaceKey || "").localeCompare(String(right?.sourceRaceKey || ""))
    );
  }

  function splitMetrics(rows, variantKey) {
    const ordered = chronological(rows);
    const midpoint = Math.floor(ordered.length / 2);
    return {
      first: outcomeMetrics(ordered.slice(0, midpoint), variantKey),
      second: outcomeMetrics(ordered.slice(midpoint), variantKey)
    };
  }

  function gateChecks(metrics, halves, gate, distinctDateCount, minimumDistinctDates) {
    const checks = {
      sampleCount: metrics.sampleCount >= gate.minimumSampleCount,
      distinctDates: distinctDateCount >= minimumDistinctDates,
      sameStakeCoverage: metrics.sameStakeCoveragePercent >= CONFIG.sameStakeCoverageMinimumPercent,
      hitCountDelta: metrics.hitCountDelta >= gate.minimumHitCountDelta,
      hitRatePointDelta: metrics.hitRatePointDelta >= gate.minimumHitRatePointDelta,
      profitDelta: metrics.profitDeltaYen >= gate.minimumProfitDeltaYen,
      roiPointDelta: metrics.roiPointDelta >= gate.minimumRoiPointDelta,
      pairedEvidence: metrics.oneSidedPairedPValue !== null &&
        metrics.oneSidedPairedPValue <= gate.maximumOneSidedPairedPValue,
      firstHalfHitDelta: !gate.requireBothHalvesNonNegativeHitDelta || halves.first.hitCountDelta >= 0,
      secondHalfHitDelta: !gate.requireBothHalvesNonNegativeHitDelta || halves.second.hitCountDelta >= 0,
      firstHalfProfitDelta: !gate.requireBothHalvesNonNegativeProfitDelta || halves.first.profitDeltaYen >= 0,
      secondHalfProfitDelta: !gate.requireBothHalvesNonNegativeProfitDelta || halves.second.profitDeltaYen >= 0,
      jackknifeProfit: !gate.requireJackknifeProfitPositive || metrics.jackknifeProfitDeltaYen > 0
    };
    return { passed: Object.values(checks).every(Boolean), checks };
  }

  function variantDecision(rows, variantKey) {
    const eligibleRows = variantRows(rows, variantKey);
    const metrics = outcomeMetrics(eligibleRows, variantKey);
    const halves = splitMetrics(eligibleRows, variantKey);
    const distinctDateCount = new Set(eligibleRows.map(raceDate).filter(date => /^\d{8}$/.test(date))).size;
    const harm = metrics.sampleCount >= CONFIG.harmReview.minimumSampleCount &&
      metrics.hitCountDelta <= CONFIG.harmReview.maximumHitCountDelta &&
      metrics.roiPointDelta <= CONFIG.harmReview.maximumRoiPointDelta;
    const interim = gateChecks(
      metrics,
      halves,
      CONFIG.interimGate,
      distinctDateCount,
      CONFIG.minimumDistinctDates.interim
    );
    const final = gateChecks(
      metrics,
      halves,
      CONFIG.finalGate,
      distinctDateCount,
      CONFIG.minimumDistinctDates.final
    );

    let status = "collecting-to-100";
    if (harm) status = "harm-review";
    else if (metrics.sampleCount < CONFIG.milestones[0]) status = "collecting-to-100";
    else if (metrics.sampleCount < CONFIG.interimGate.minimumSampleCount) status = "collecting-to-250";
    else if (metrics.sampleCount < CONFIG.finalGate.minimumSampleCount) {
      status = interim.passed ? "interim-candidate-hold-to-500" : "collecting-to-500";
    } else if (final.passed) status = "approval-candidate-human-review";
    else status = "continue-monitoring-no-approval";

    const nextMilestone = CONFIG.milestones.find(value => metrics.sampleCount < value) || CONFIG.milestones.at(-1);
    return {
      variantKey,
      status,
      automaticApplication: false,
      humanApprovalRequired: true,
      sampleCount: metrics.sampleCount,
      distinctDateCount,
      nextMilestone,
      remainingToNextMilestone: Math.max(0, nextMilestone - metrics.sampleCount),
      metrics,
      halves,
      harmReview: {
        triggered: harm,
        fixedRule: clone(CONFIG.harmReview)
      },
      interimGate: {
        ...interim,
        fixedRule: clone(CONFIG.interimGate),
        minimumDistinctDates: CONFIG.minimumDistinctDates.interim
      },
      finalGate: {
        ...final,
        fixedRule: clone(CONFIG.finalGate),
        minimumDistinctDates: CONFIG.minimumDistinctDates.final
      }
    };
  }

  function diagnostics(rows) {
    const counts = {};
    rows.forEach(row => {
      const classification = classifySettlement(row);
      counts[classification] = (counts[classification] || 0) + 1;
    });
    return {
      sourceSettlementCount: rows.length,
      prospectiveForwardCount: counts.eligible || 0,
      exclusionCounts: Object.fromEntries(
        Object.entries(counts).filter(([key]) => key !== "eligible")
      )
    };
  }

  function chooseApproval(variants) {
    const approved = variants.filter(row => row.status === "approval-candidate-human-review");
    return approved.sort((left, right) =>
      right.metrics.jackknifeProfitDeltaYen - left.metrics.jackknifeProfitDeltaYen ||
      num(left.metrics.oneSidedPairedPValue, 1) - num(right.metrics.oneSidedPairedPValue, 1) ||
      right.metrics.hitCountDelta - left.metrics.hitCountDelta ||
      right.metrics.roiPointDelta - left.metrics.roiPointDelta ||
      CONFIG.variantOrder.indexOf(left.variantKey) - CONFIG.variantOrder.indexOf(right.variantKey)
    )[0] || null;
  }

  function buildDecisionReport(settlements, options = {}) {
    const sourceRows = Array.isArray(settlements) ? settlements.filter(Boolean) : [];
    const eligibleRows = sourceRows.filter(row => classifySettlement(row) === "eligible");
    const variants = CONFIG.variantOrder.map(key => variantDecision(eligibleRows, key));
    const recommended = chooseApproval(variants);
    const hasInterim = variants.some(row => row.status === "interim-candidate-hold-to-500");
    const hasHarm = variants.some(row => row.status === "harm-review");
    let nextStep = "continue-prospective-collection";
    if (recommended) nextStep = "human-review-one-ticket-outer-attack-variant";
    else if (hasHarm) nextStep = "review-harm-without-changing-frozen-thresholds";
    else if (hasInterim) nextStep = "continue-to-500-with-frozen-rules";

    return {
      schemaVersion: 1,
      gateId: VERSION,
      generatedAt: String(options.now || new Date().toISOString()),
      frozenAt: CONFIG.frozenAt,
      prospectiveStartAt: CONFIG.prospectiveStartAt,
      sourceMainCommit: CONFIG.sourceMainCommit,
      sourceSettlementVersion: CONFIG.sourceSettlementVersion,
      productionChanged: false,
      automaticApplication: false,
      humanApprovalRequired: true,
      thresholdSearchPerformed: false,
      primaryCohort: CONFIG.primaryCohort,
      diagnostics: diagnostics(sourceRows),
      variants: Object.fromEntries(variants.map(row => [row.variantKey, row])),
      recommendedVariant: recommended ? recommended.variantKey : null,
      recommendationStatus: recommended ? "approval-candidate-human-review" : "none",
      nextStep,
      fixedRules: clone(CONFIG),
      safety: clone(CONFIG.safety)
    };
  }

  function refresh(rootObject, options = {}) {
    const report = buildDecisionReport(readSettlements(rootObject), options);
    try {
      writeJson(rootObject, STORAGE_KEY, report);
    } catch (error) {
      console.warn("[outer-attack-ticket-decision-gate] 読取専用判定の保存を継続できません", error);
    }
    return report;
  }

  function install(rootObject) {
    if (!rootObject || rootObject[HOOK_MARK]) return false;
    Object.defineProperty(rootObject, HOOK_MARK, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    const update = () => {
      try { refresh(rootObject); }
      catch (error) { console.warn("[outer-attack-ticket-decision-gate] 判定更新を継続できません", error); }
    };
    rootObject.addEventListener?.("chappy:stats-requested", update);
    rootObject.addEventListener?.("chappy:stats-runtime-ready", update);
    rootObject.addEventListener?.("storage", event => {
      const settlementKey = settlement?.STORAGE_KEY || "chappy_outer_attack_ticket_settlements_v1";
      if (event?.key === settlementKey) update();
    });
    update();
    return true;
  }

  return Object.freeze({
    VERSION,
    STORAGE_KEY,
    CONFIG,
    classifySettlement,
    pairedOneSidedPValue,
    outcomeMetrics,
    splitMetrics,
    gateChecks,
    variantDecision,
    buildDecisionReport,
    readDecision,
    refresh,
    install
  });
});
