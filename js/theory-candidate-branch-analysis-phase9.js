"use strict";

const crypto = require("node:crypto");

const THEORY_KEY = "frame-rise-fall";
const SOURCE_THEORY_KEY = "frameRiseSink";
const MINIMUM_FORMAL_RACES = 30;
const SUPPORTED_FOCUS_METRIC = "recoveryRate";
const SUPPORTED_CHANGE_CANDIDATE =
  "低回収の成立条件を分解し、利益を落としている枝だけをA/B検証候補にする";
const MOVEMENT_DELTA_BANDS = Object.freeze([
  "< -20",
  "[-20,-15)",
  "[-15,-10)",
  "[-10,0)",
  "[0,5)",
  "[5,10)",
  "[10,15)",
  "[15,20)",
  "[20,30)",
  ">=30",
  "unknown"
]);

function pct(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTicket(value) {
  const match = String(value || "").trim().match(
    /^([1-6])\s*-\s*([1-6])\s*-\s*([1-6])$/
  );
  if (!match) return "";
  const boats = match.slice(1);
  return new Set(boats).size === 3 ? boats.join("-") : "";
}

function frameDiagnostic(record = {}) {
  const rows = record?.theoryTagSnapshot?.evidenceDiagnostics?.rows;
  return (Array.isArray(rows) ? rows : []).find(row =>
    row?.theoryKey === THEORY_KEY && row?.formal === true
  ) || null;
}

function frameTheory(record = {}) {
  const rows = record?.theoryTagSnapshot?.theories;
  return (Array.isArray(rows) ? rows : []).find(row =>
    row?.theoryKey === SOURCE_THEORY_KEY && row?.formal === true
  ) || null;
}

function frameEvaluation(record = {}) {
  const rows = record?.theoryEvaluationSnapshot?.evaluations;
  return (Array.isArray(rows) ? rows : []).find(row =>
    row?.theoryKey === THEORY_KEY &&
    row?.status === "evaluated" &&
    row?.used === true
  ) || null;
}

function movementDeltaBand(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  if (number < -20) return "< -20";
  if (number < -15) return "[-20,-15)";
  if (number < -10) return "[-15,-10)";
  if (number < 0) return "[-10,0)";
  if (number < 5) return "[0,5)";
  if (number < 10) return "[5,10)";
  if (number < 15) return "[10,15)";
  if (number < 20) return "[15,20)";
  if (number < 30) return "[20,30)";
  return ">=30";
}

function adjustmentSign(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  if (number < 0) return "negative";
  if (number > 0) return "positive";
  return "zero";
}

function selectedAtEpoch(record = {}) {
  const selectedAt = String(record?.selectedAt || "");
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(selectedAt)) return null;
  const value = Date.parse(selectedAt);
  return Number.isFinite(value) ? value : null;
}

function assertUniqueRaceKeys(rows = []) {
  const seen = new Set();
  rows.forEach(row => {
    if (!row?.raceKey) throw new Error("正式証拠行のraceKeyが欠落しています");
    if (seen.has(row.raceKey)) throw new Error(`正式証拠行のraceKeyが重複しています: ${row.raceKey}`);
    seen.add(row.raceKey);
  });
}

function buildRows(records = []) {
  const rows = (Array.isArray(records) ? records : []).flatMap(record => {
    if (record?.result?.settled !== true) return [];
    const diagnostic = frameDiagnostic(record);
    const theory = frameTheory(record);
    const evaluation = frameEvaluation(record);
    if (!diagnostic || !theory || !evaluation) return [];

    const metrics = diagnostic?.metrics || {};
    const frameNo = finiteNumber(metrics.frameNo);
    const scoreAdjustment = finiteNumber(metrics.scoreAdjustment);
    const movementDelta = finiteNumber(metrics.movementDelta);
    if (
      metrics.approved !== true ||
      metrics.applied !== true ||
      frameNo === null ||
      !Number.isInteger(frameNo) ||
      frameNo < 1 ||
      frameNo > 6 ||
      scoreAdjustment === null ||
      movementDelta === null
    ) return [];

    const rawTickets = Array.isArray(evaluation.tickets) ? evaluation.tickets : [];
    const normalizedTickets = rawTickets.map(normalizeTicket);
    if (!rawTickets.length || normalizedTickets.some(ticket => !ticket)) return [];
    const tickets = [...new Set(normalizedTickets)];

    const storedRaceKey = String(record?.raceKey || "");
    const analysisRaceKey = String(record?.__analysisRaceKey || "");
    if (storedRaceKey && analysisRaceKey && storedRaceKey !== analysisRaceKey) return [];
    const raceKey = storedRaceKey || analysisRaceKey;
    const selectedEpoch = selectedAtEpoch(record);
    if (
      !/^\d{8}-(?:0[1-9]|1\d|2[0-4])-(?:[1-9]|1[0-2])$/.test(raceKey) ||
      selectedEpoch === null
    ) return [];

    const hit = evaluation.matched === true;
    const payout = Math.max(0, finiteNumber(record?.result?.payout) || 0);
    const stake = tickets.length * 100;
    const type = String(metrics.type || "");
    const directionMismatch =
      (type === "rise" && scoreAdjustment < 0) ||
      (type === "sink" && scoreAdjustment > 0);

    return [{
      selectedAtEpoch: selectedEpoch,
      raceKey,
      date: String(record?.date || ""),
      selectedAt: String(record?.selectedAt || ""),
      jcd: String(record?.jcd || "").padStart(2, "0"),
      place: String(record?.place || ""),
      raceNo: Number(record?.raceNo || 0),
      frameNo,
      type,
      scenarioType: String(metrics.scenarioType || ""),
      scoreAdjustment,
      adjustmentSign: adjustmentSign(scoreAdjustment),
      movementDelta,
      movementDeltaBand: movementDeltaBand(movementDelta),
      rate: finiteNumber(metrics.rate),
      samples: finiteNumber(metrics.samples),
      directionMismatch,
      ticketCount: tickets.length,
      tickets,
      hit,
      practicalHit: record?.result?.practicalHit === true,
      stake,
      return: hit ? payout : 0,
      profit: (hit ? payout : 0) - stake
    }];
  }).sort((a, b) => a.selectedAtEpoch - b.selectedAtEpoch || a.raceKey.localeCompare(b.raceKey));
  assertUniqueRaceKeys(rows);
  return rows;
}

function summarize(rows = []) {
  assertUniqueRaceKeys(rows);
  const totals = (Array.isArray(rows) ? rows : []).reduce((result, row) => {
    result.raceKeys.add(row.raceKey);
    result.ticketCount += row.ticketCount;
    result.hitCount += row.hit ? 1 : 0;
    result.practicalHitCount += row.practicalHit ? 1 : 0;
    result.stake += row.stake;
    result.return += row.return;
    return result;
  }, {
    raceKeys: new Set(),
    ticketCount: 0,
    hitCount: 0,
    practicalHitCount: 0,
    stake: 0,
    return: 0
  });
  const raceCount = totals.raceKeys.size;
  return {
    raceCount,
    ticketCount: totals.ticketCount,
    hitCount: totals.hitCount,
    missCount: raceCount - totals.hitCount,
    hitRate: pct(totals.hitCount, raceCount),
    practicalHitCount: totals.practicalHitCount,
    practicalHitRate: pct(totals.practicalHitCount, raceCount),
    stake: totals.stake,
    return: totals.return,
    profit: totals.return - totals.stake,
    recoveryRate: pct(totals.return, totals.stake)
  };
}

function groupRows(rows, field) {
  const groups = new Map();
  rows.forEach(row => {
    const value = row[field];
    const key = String(value ?? "unknown");
    if (!groups.has(key)) groups.set(key, { value, rows: [] });
    groups.get(key).rows.push(row);
  });
  return [...groups.values()]
    .map(group => ({ value: group.value, ...summarize(group.rows) }))
    .sort((a, b) => {
      if (field === "movementDeltaBand") {
        return MOVEMENT_DELTA_BANDS.indexOf(a.value) - MOVEMENT_DELTA_BANDS.indexOf(b.value);
      }
      if (typeof a.value === "number" && typeof b.value === "number") return a.value - b.value;
      return String(a.value).localeCompare(String(b.value));
    });
}

function chronologicalThirds(rows) {
  if (!rows.length) return [];
  const boundaries = [0, Math.floor(rows.length / 3), Math.floor(rows.length * 2 / 3), rows.length];
  return ["first-third", "middle-third", "final-third"].map((period, index) => {
    const slice = rows.slice(boundaries[index], boundaries[index + 1]);
    return {
      period,
      startRaceKey: slice[0]?.raceKey || "",
      endRaceKey: slice.at(-1)?.raceKey || "",
      startSelectedAt: slice[0]?.selectedAt || "",
      endSelectedAt: slice.at(-1)?.selectedAt || "",
      ...summarize(slice)
    };
  });
}

function fingerprintRows(rows) {
  const stable = rows.map(row => ({ ...row }));
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function proposalFingerprint(proposal = {}) {
  return sha256({
    theoryKey: String(proposal?.theoryKey || ""),
    evidenceCount: Number(proposal?.evidenceCount || 0),
    focusMetric: String(proposal?.focusMetric || ""),
    currentValue: finiteNumber(proposal?.currentValue),
    changeCandidate: String(proposal?.changeCandidate || "")
  });
}

function candidateSpecification(candidate = {}) {
  return {
    candidateId: String(candidate?.candidateId || ""),
    applicability: candidate?.applicability || null,
    proposedChange: candidate?.proposedChange || null,
    prospectiveProtocol: candidate?.prospectiveProtocol || null
  };
}

function candidateSpecFingerprint(candidate = {}) {
  return sha256(candidateSpecification(candidate));
}

function candidateDefinition(sourceProposalFingerprint) {
  const specification = {
    candidateId: "frame-rise-fall-shadow-off-v1",
    applicability: {
      all: [
        { field: "theoryKey", operator: "equals", value: THEORY_KEY },
        { field: "formal", operator: "equals", value: true },
        { field: "approved", operator: "equals", value: true },
        { field: "applied", operator: "equals", value: true },
        { field: "scoreAdjustment", operator: "not-equals", value: 0 }
      ]
    },
    proposedChange: {
      scope: "shadow-B-only",
      action: "set-effective-frame-movement-adjustment",
      effectiveValue: 0,
      preserveRawAdjustmentEvidence: true,
      preserveAllOtherScenarioInputs: true,
      productionAUnchanged: true,
      ticketContractUnchanged: true
    },
    prospectiveProtocol: {
      cutoff: {
        selectedAtExclusiveLowerBound: null,
        sourceCommit: null,
        logicFingerprint: null,
        status: "freeze-when-shadow-implementation-is-approved"
      },
      eligibleRace: "cutoff後の同一締切前入力でA/B判断fingerprintが異なる正式証拠レース",
      decisionFingerprint: ["skipDecision", "mainScenario", "practicalTickets"],
      fixedComparableRaces: 100,
      validationHalf: { start: 1, end: 50 },
      sealedConfirmationHalf: { start: 51, end: 100 },
      ordering: ["selectedAt", "raceKey"],
      deduplicationKey: "raceKey",
      officialResultRequired: true,
      voidRaceTreatment: "母数へ入れず、次のeligible raceで固定100Rを満たす",
      earlyStoppingAllowed: false,
      conditionChangesAllowed: false,
      reportScopes: ["decision-changed-races", "all-formal-races"],
      adoptionGate: {
        bothHalvesBOnlyHitsAtLeastAOnlyHits: true,
        overallMinimumNetBOnlyHits: 5,
        pairedOutcomeExactTest: { alternative: "B-better", maximumPValue: 0.05 },
        bRecoveryRateMustExceedA: true,
        pairedProfitDeltaMustBePositive: true,
        pairedProfitBootstrap: { confidenceLevel: 0.95, lowerBoundMustExceed: 0 },
        bothHalvesProfitDeltaMustBeNonNegative: true,
        bStakeMustNotExceedA: true,
        ticketContractViolationsMustEqual: 0,
        automaticWinnerSelection: false,
        finalHumanApprovalRequired: true
      }
    }
  };
  const specificationFingerprint = candidateSpecFingerprint(specification);
  return {
    ...specification,
    candidateSpecFingerprint: specificationFingerprint,
    sourceProposalFingerprint,
    label: "枠別浮沈補正の全面OFFシャドー",
    status: "proposed-awaiting-human-approval-and-shadow-implementation",
    selectionBasis: "過去枝の勝者ではなく、枠別浮沈補正1要素の因果寄与を分離できる単一ablation",
    scopeResolution: {
      changesPhase9BranchScope: true,
      reason: "既存84Rに独立holdoutがなく弱い枝の後付け選定を避けるため、理論寄与全体のablationへ変更",
      specificHumanApprovalRequired: true
    },
    approved: false,
    approvedSpecFingerprint: null,
    shadowImplementationPresent: false,
    shadowImplementationSpecFingerprint: null,
    historicalPerformanceClaim: false,
    shadowOnly: true,
    productionPredictionChanged: false,
    productionTicketSelectionChanged: false,
    humanApprovalRequired: true
  };
}

function waiting(status, sourceStatus, reason) {
  return {
    schemaVersion: 1,
    engineVersion: "theory-candidate-branch-analysis-phase9-20260814",
    status,
    sourceStatus,
    targetTheoryKey: THEORY_KEY,
    reason,
    formalRaceCount: 0,
    candidateCount: 0,
    candidate: null,
    oneCandidateOnly: true,
    retrospectiveOnly: true,
    causalClaim: false,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

function build(records = [], phase9 = {}) {
  const sourceStatus = String(phase9?.status || "unknown");
  const proposal = phase9?.proposal || null;
  if (sourceStatus !== "proposal-ready" || !proposal) {
    return waiting("waiting-for-phase9-proposal", sourceStatus, "Phase9の単一提案が未準備");
  }
  if (proposal.theoryKey !== THEORY_KEY) {
    return waiting("unsupported-phase9-theory", sourceStatus, "枠別浮沈率以外は専用分析の対象外");
  }
  if (
    proposal.focusMetric !== SUPPORTED_FOCUS_METRIC ||
    proposal.changeCandidate !== SUPPORTED_CHANGE_CANDIDATE
  ) {
    return waiting("unsupported-phase9-proposal", sourceStatus, "回収率の枝分解提案以外は再レビューが必要");
  }

  const rows = buildRows(records);
  if (rows.length < MINIMUM_FORMAL_RACES) {
    return {
      ...waiting("collecting-formal-evidence", sourceStatus, `正式証拠${MINIMUM_FORMAL_RACES}R未満`),
      formalRaceCount: rows.length,
      minimumFormalRaces: MINIMUM_FORMAL_RACES
    };
  }

  const dates = [...new Set(rows.map(row => row.date).filter(Boolean))].sort();
  const mismatchCount = rows.filter(row => row.directionMismatch).length;
  const evidenceCount = Number(proposal.evidenceCount || 0);
  const sourceProposalFingerprint = proposalFingerprint(proposal);
  if (evidenceCount !== rows.length) {
    return {
      ...waiting("evidence-count-mismatch", sourceStatus, "Phase9証拠数と正式枝抽出数が一致しない"),
      formalRaceCount: rows.length,
      evidenceConsistency: {
        phase9EvidenceCount: evidenceCount,
        extractedFormalRaceCount: rows.length,
        exactMatch: false
      }
    };
  }
  return {
    schemaVersion: 1,
    engineVersion: "theory-candidate-branch-analysis-phase9-20260814",
    status: "candidate-ready-for-human-review",
    sourceStatus,
    targetTheoryKey: THEORY_KEY,
    phase9ProposalFingerprint: sourceProposalFingerprint,
    formalRaceCount: rows.length,
    minimumFormalRaces: MINIMUM_FORMAL_RACES,
    evidenceConsistency: {
      phase9EvidenceCount: evidenceCount,
      extractedFormalRaceCount: rows.length,
      exactMatch: evidenceCount === rows.length
    },
    cohortFingerprint: `sha256:${fingerprintRows(rows)}`,
    inputWindow: {
      dateCount: dates.length,
      startDate: dates[0] || "",
      endDate: dates.at(-1) || "",
      startSelectedAt: rows[0]?.selectedAt || "",
      endSelectedAt: rows.at(-1)?.selectedAt || ""
    },
    accountingDefinition: {
      stake: "正式証拠が帰属した重複なし3連単を各100円として合算",
      return: "帰属買い目に公式3連単結果が含まれる場合だけ払戻金を計上",
      practicalHit: "実戦選択全体の的中であり、枠別浮沈率帰属買い目のhitとは別指標"
    },
    overall: summarize(rows),
    branchDefinitions: {
      type: "保存された浮上・沈下ラベル。調整符号とは一致しないためB条件に使用しない",
      scenarioType: "主展開種別。現母集団ではframeNoと強く結び付く",
      scoreAdjustment: "本番Aで主展開スコアへ適用された枠別浮沈補正",
      movementDeltaBand: "保存済みmovementDeltaの固定帯域"
    },
    branches: {
      frameNo: groupRows(rows, "frameNo"),
      type: groupRows(rows, "type"),
      scenarioType: groupRows(rows, "scenarioType"),
      scoreAdjustment: groupRows(rows, "scoreAdjustment"),
      adjustmentSign: groupRows(rows, "adjustmentSign"),
      movementDeltaBand: groupRows(rows, "movementDeltaBand")
    },
    directionCaution: {
      definition: "type=riseかつ負補正、またはtype=sinkかつ正補正",
      mismatchCount,
      mismatchRate: pct(mismatchCount, rows.length),
      typeMustNotDriveCandidate: true
    },
    chronologicalThirds: chronologicalThirds(rows),
    retrospectiveLimits: {
      independentHoldout: false,
      reason: `正式証拠は${dates.length}日分だけで、全件を問題発見と候補定義に使用するため独立holdoutではない`,
      exactCounterfactualTicketsAvailable: false,
      historicalBPerformanceClaimAllowed: false,
      multipleBranchWinnerSelectionAllowed: false
    },
    candidateCount: 1,
    candidate: candidateDefinition(sourceProposalFingerprint),
    oneCandidateOnly: true,
    retrospectiveOnly: true,
    causalClaim: false,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = {
  THEORY_KEY,
  SOURCE_THEORY_KEY,
  MINIMUM_FORMAL_RACES,
  SUPPORTED_FOCUS_METRIC,
  SUPPORTED_CHANGE_CANDIDATE,
  MOVEMENT_DELTA_BANDS,
  pct,
  finiteNumber,
  normalizeTicket,
  frameDiagnostic,
  frameTheory,
  frameEvaluation,
  movementDeltaBand,
  adjustmentSign,
  selectedAtEpoch,
  assertUniqueRaceKeys,
  buildRows,
  summarize,
  groupRows,
  chronologicalThirds,
  fingerprintRows,
  sha256,
  proposalFingerprint,
  candidateSpecification,
  candidateSpecFingerprint,
  candidateDefinition,
  build
};
