"use strict";

const priorityShadow = require(
  "./practical-priority-shadow"
);
const registeredContract = require(
  "../config/chappy-charter.json"
).practicalPriorityProspectiveShadow;

if (
  String(registeredContract.sourceSelectionFingerprint) !==
  priorityShadow.REQUIRED_SOURCE_SELECTION_FINGERPRINT
) {
  throw new Error(
    "順位候補シャドーの実戦厳選世代が固定契約と一致しません"
  );
}

const VERSION = "1.0.0";
const CONTRACT_START_DATE = String(
  registeredContract.startDate
);
const TARGET_REPLACEMENT_COUNT = Number(
  registeredContract.targetReplacementCount
);
const MINIMUM_DISCORDANT_COUNT = Number(
  registeredContract.minimumDiscordantCount
);
const MAXIMUM_LOSS_COUNT = Number(
  registeredContract.maximumLossCount
);
const MAXIMUM_ONE_SIDED_P_VALUE = Number(
  registeredContract.maximumOneSidedPValue
);

function contractHash(value) {
  let hash = 2166136261;
  const text = JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const REGISTERED_CONTRACT = Object.freeze({
  shadowSelectionLogicFingerprint:
    priorityShadow.LOGIC_FINGERPRINT,
  startDate: CONTRACT_START_DATE,
  targetReplacementCount:
    TARGET_REPLACEMENT_COUNT,
  fixedEndpoint:
    registeredContract.fixedEndpoint === true,
  earlyStoppingAllowed:
    registeredContract.earlyStoppingAllowed === true,
  candidateReasonCode: String(
    registeredContract.candidateReasonCode
  ),
  firstFormationBranch: String(
    registeredContract.firstFormationBranch
  ),
  headBoatNo: Number(registeredContract.headBoatNo),
  structuredRoles: Object.freeze([
    ...(registeredContract.structuredRoles || [])
  ]),
  priorityScoreExclusiveMinimum: Number(
    registeredContract.priorityScoreExclusiveMinimum
  ),
  sourceSelectionFingerprint: String(
    registeredContract.sourceSelectionFingerprint
  ),
  protectedSelectedCategories: Object.freeze([
    ...(registeredContract.protectedSelectedCategories || [])
  ]),
  replacementMode: String(
    registeredContract.replacementMode
  ),
  voidHandling: String(
    registeredContract.voidHandling
  ),
  settledPayoutPolicy: String(
    registeredContract.settledPayoutPolicy
  ),
  minimumDiscordantCount:
    MINIMUM_DISCORDANT_COUNT,
  maximumLossCount: MAXIMUM_LOSS_COUNT,
  maximumOneSidedPValue:
    MAXIMUM_ONE_SIDED_P_VALUE,
  firstAndSecondHalfMustBeNonHarmful:
    registeredContract
      .firstAndSecondHalfMustBeNonHarmful === true,
  conditionsMayChangeDuringCohort:
    registeredContract
      .conditionsMayChangeDuringCohort === true,
  requiresHumanApproval:
    registeredContract.requiresHumanApproval === true,
  automaticApplication:
    registeredContract.automaticApplication === true,
  usableForPrediction:
    registeredContract.usableForPrediction === true
});
const CONTRACT_FINGERPRINT =
  `practical-priority-prospective-v1-${contractHash(REGISTERED_CONTRACT)}`;

function ticketOf(value) {
  const numbers = String(
    value?.ticket || value || ""
  ).match(/[1-6]/g) || [];
  return numbers.length >= 3
    ? numbers.slice(0, 3).join("-")
    : "";
}

function payoutOf(result) {
  return Number(
    result?.payoutPer100 ||
    result?.review?.payoutPer100 ||
    0
  ) || 0;
}

function actualTicketOf(result) {
  return ticketOf(
    result?.resultTicket ||
    result?.review?.resultTicket
  );
}

function oneSidedBinomialPValue(gains, losses) {
  const success = Math.max(0, Number(gains) || 0);
  const failure = Math.max(0, Number(losses) || 0);
  const total = success + failure;
  if (!total) return 1;

  let probability = 2 ** -total;
  let tail = success === 0 ? probability : 0;
  for (let count = 1; count <= total; count += 1) {
    probability *= (total - count + 1) / count;
    if (count >= success) tail += probability;
  }
  return Math.round(Math.min(1, tail) * 1e8) / 1e8;
}

function emptyMetrics() {
  return {
    sampleCount: 0,
    resolvedCount: 0,
    settledCount: 0,
    voidCount: 0,
    invalidResultCount: 0,
    pendingCount: 0,
    baseHits: 0,
    shadowHits: 0,
    gains: 0,
    losses: 0,
    neutral: 0,
    discordantCount: 0,
    hitDelta: 0,
    baseReturn: 0,
    shadowReturn: 0,
    returnDelta: 0,
    stakeInvariant: true
  };
}

function metricsOf(rows) {
  const metrics = emptyMetrics();
  metrics.sampleCount = rows.length;

  rows.forEach(row => {
    if (row.baseStake !== row.shadowStake) {
      metrics.stakeInvariant = false;
    }
    if (row.void) {
      metrics.resolvedCount += 1;
      metrics.voidCount += 1;
      metrics.neutral += 1;
      return;
    }
    if (!row.settled) {
      metrics.pendingCount += 1;
      if (row.invalidResult) {
        metrics.invalidResultCount += 1;
      }
      return;
    }
    metrics.resolvedCount += 1;
    metrics.settledCount += 1;
    if (row.baseHit) {
      metrics.baseHits += 1;
      metrics.baseReturn += row.payout;
    }
    if (row.shadowHit) {
      metrics.shadowHits += 1;
      metrics.shadowReturn += row.payout;
    }
    if (!row.baseHit && row.shadowHit) {
      metrics.gains += 1;
    } else if (row.baseHit && !row.shadowHit) {
      metrics.losses += 1;
    } else {
      metrics.neutral += 1;
    }
  });

  metrics.discordantCount =
    metrics.gains + metrics.losses;
  metrics.hitDelta =
    metrics.shadowHits - metrics.baseHits;
  metrics.returnDelta =
    metrics.shadowReturn - metrics.baseReturn;
  return metrics;
}

function normalizedSample(row) {
  const shadow = row?.practicalPriorityShadow || null;
  const baseTickets = Array.isArray(shadow?.baseTickets)
    ? shadow.baseTickets.map(ticketOf).filter(Boolean)
    : [];
  const shadowTickets = Array.isArray(shadow?.shadowTickets)
    ? shadow.shadowTickets.map(ticketOf).filter(Boolean)
    : [];
  const result = row?.result || null;
  const actualTicket = actualTicketOf(result);
  const voidRace = Boolean(
    result?.void === true ||
    result?.resolvedVoid === true ||
    result?.status === "void"
  );
  const officialPayout = payoutOf(result);
  const invalidResult = Boolean(
    !voidRace &&
    result?.settled === true &&
    (!actualTicket || officialPayout <= 0)
  );
  const settled = Boolean(
    !voidRace &&
    result?.settled === true &&
    actualTicket &&
    officialPayout > 0
  );
  const payout = settled ? officialPayout : 0;

  return {
    raceKey: String(row?.raceKey || ""),
    date: String(row?.date || ""),
    deadlineAt: String(row?.deadlineAt || ""),
    capturedAt: String(
      shadow?.capturedAt || row?.selectedAt || ""
    ),
    sourceCommit: String(shadow?.sourceCommit || ""),
    sourceSelectionFingerprint: String(
      shadow?.sourceSelectionFingerprint || ""
    ),
    addedTicket: ticketOf(
      shadow?.replacement?.addedTicket
    ),
    removedTicket: ticketOf(
      shadow?.replacement?.removedTicket
    ),
    addedPriorityScore: Number(
      shadow?.replacement?.addedPriorityScore || 0
    ),
    removedPriorityScore: Number(
      shadow?.replacement?.removedPriorityScore || 0
    ),
    void: voidRace,
    invalidResult,
    settled,
    actualTicket: settled ? actualTicket : "",
    payout,
    baseHit: settled && baseTickets.includes(actualTicket),
    shadowHit:
      settled && shadowTickets.includes(actualTicket),
    baseStake: baseTickets.length * 100,
    shadowStake: shadowTickets.length * 100
  };
}

function newerRow(left, right) {
  const resolved = row => Boolean(
    row?.result?.settled === true ||
    row?.result?.void === true ||
    row?.result?.resolvedVoid === true ||
    row?.result?.status === "void"
  );
  const leftResolved = resolved(left);
  const rightResolved = resolved(right);
  if (leftResolved !== rightResolved) {
    return rightResolved ? right : left;
  }
  const leftTime = Date.parse(
    left?.practicalPriorityShadow?.capturedAt ||
    left?.selectedAt ||
    ""
  );
  const rightTime = Date.parse(
    right?.practicalPriorityShadow?.capturedAt ||
    right?.selectedAt ||
    ""
  );
  return Number.isFinite(rightTime) &&
    (!Number.isFinite(leftTime) || rightTime > leftTime)
    ? right
    : left;
}

function eligibleRows(rows) {
  const byRaceKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const raceKey = String(row?.raceKey || "");
    const date = String(row?.date || raceKey.slice(0, 8));
    if (!raceKey || date < CONTRACT_START_DATE) return;
    const previous = byRaceKey.get(raceKey);
    byRaceKey.set(
      raceKey,
      previous ? newerRow(previous, row) : row
    );
  });

  return [...byRaceKey.values()]
    .filter(row => {
      const shadow = row?.practicalPriorityShadow;
      const capturedTime = Date.parse(
        shadow?.capturedAt || row?.selectedAt || ""
      );
      const deadlineTime = Date.parse(
        row?.deadlineAt || ""
      );
      return (
        shadow?.eligible === true &&
        shadow?.logicFingerprint ===
          priorityShadow.LOGIC_FINGERPRINT &&
        shadow?.cohortContractFingerprint ===
          CONTRACT_FINGERPRINT &&
        shadow?.sourceSelectionFingerprint ===
          REGISTERED_CONTRACT.sourceSelectionFingerprint &&
        Number.isFinite(capturedTime) &&
        Number.isFinite(deadlineTime) &&
        capturedTime < deadlineTime &&
        Boolean(String(shadow?.sourceCommit || ""))
      );
    })
    .sort((left, right) =>
      Date.parse(left?.deadlineAt || "") -
        Date.parse(right?.deadlineAt || "") ||
      String(left?.raceKey || "")
        .localeCompare(String(right?.raceKey || ""))
    );
}

function build(rows) {
  const targetCount = TARGET_REPLACEMENT_COUNT;
  const allEligible = eligibleRows(rows);
  const cohort = allEligible
    .slice(0, targetCount)
    .map(normalizedSample);
  const metrics = metricsOf(cohort);
  const firstHalf = metricsOf(
    cohort.slice(0, Math.ceil(targetCount / 2))
  );
  const secondHalf = metricsOf(
    cohort.slice(Math.ceil(targetCount / 2), targetCount)
  );
  const cohortComplete =
    cohort.length === targetCount &&
    metrics.resolvedCount === targetCount;
  const pValue = oneSidedBinomialPValue(
    metrics.gains,
    metrics.losses
  );
  const checks = {
    cohortComplete,
    stakeInvariant: metrics.stakeInvariant,
    enoughDiscordant:
      metrics.discordantCount >=
      MINIMUM_DISCORDANT_COUNT,
    lossWithinLimit:
      metrics.losses <= MAXIMUM_LOSS_COUNT,
    hitDeltaPositive: metrics.hitDelta > 0,
    returnPositive: metrics.returnDelta > 0,
    exactTestPass:
      pValue <= MAXIMUM_ONE_SIDED_P_VALUE,
    firstHalfNonHarmful:
      firstHalf.hitDelta >= 0 &&
      firstHalf.returnDelta >= 0,
    secondHalfNonHarmful:
      secondHalf.hitDelta >= 0 &&
      secondHalf.returnDelta >= 0
  };
  const reviewCandidateReady =
    cohortComplete &&
    Object.values(checks).every(Boolean);
  const status = cohort.length < targetCount
    ? "collecting-prospective-shadow"
    : !cohortComplete
      ? metrics.invalidResultCount > 0
        ? "awaiting-valid-official-result"
        : "awaiting-cohort-settlement"
      : reviewCandidateReady
        ? "review-candidate-ready"
        : "review-candidate-rejected";

  return {
    version: VERSION,
    logicFingerprint:
      priorityShadow.LOGIC_FINGERPRINT,
    cohortContractFingerprint:
      CONTRACT_FINGERPRINT,
    status,
    contract: {
      startDate: CONTRACT_START_DATE,
      targetReplacementCount: targetCount,
      fixedEndpoint:
        registeredContract.fixedEndpoint === true,
      earlyStoppingAllowed:
        registeredContract.earlyStoppingAllowed === true,
      minimumDiscordantCount:
        MINIMUM_DISCORDANT_COUNT,
      maximumLossCount: MAXIMUM_LOSS_COUNT,
      maximumOneSidedPValue:
        MAXIMUM_ONE_SIDED_P_VALUE,
      firstAndSecondHalfMustBeNonHarmful:
        registeredContract
          .firstAndSecondHalfMustBeNonHarmful === true,
      conditionsMayChangeDuringCohort:
        registeredContract
          .conditionsMayChangeDuringCohort === true,
      sourceSelectionFingerprint:
        REGISTERED_CONTRACT.sourceSelectionFingerprint,
      voidHandling:
        REGISTERED_CONTRACT.voidHandling,
      settledPayoutPolicy:
        REGISTERED_CONTRACT.settledPayoutPolicy
    },
    observedEligibleCount: allEligible.length,
    cohortCount: cohort.length,
    remainingCount:
      Math.max(0, targetCount - cohort.length),
    metrics: {
      ...metrics,
      oneSidedBinomialPValue: pValue
    },
    halves: { first: firstHalf, second: secondHalf },
    checks,
    samples: cohort,
    reviewCandidateReady,
    requiresHumanApproval:
      registeredContract.requiresHumanApproval === true,
    automaticApplication:
      registeredContract.automaticApplication === true,
    usableForPrediction:
      registeredContract.usableForPrediction === true
  };
}

module.exports = {
  VERSION,
  CONTRACT_START_DATE,
  TARGET_REPLACEMENT_COUNT,
  MINIMUM_DISCORDANT_COUNT,
  MAXIMUM_LOSS_COUNT,
  MAXIMUM_ONE_SIDED_P_VALUE,
  REGISTERED_CONTRACT,
  CONTRACT_FINGERPRINT,
  ticketOf,
  oneSidedBinomialPValue,
  metricsOf,
  eligibleRows,
  build
};
