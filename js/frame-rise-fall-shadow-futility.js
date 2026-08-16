"use strict";

const VERSION = "frame-rise-fall-shadow-futility-v1";
const REQUIRED_NET_B_ONLY_HITS = 5;

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluate(report = {}) {
  const target = n(report?.protocol?.fixedComparableRaces) || 100;
  const settled = n(report?.observation?.settledComparableCount);
  const remaining = Math.max(0, target - settled);
  const currentNetBOnlyHits = n(report?.overall?.netBOnlyHits);
  const maximumPossibleNetBOnlyHits = currentNetBOnlyHits + remaining;
  const alreadyComplete = report?.adoptionChecks?.fixed100Complete === true;
  const irreversible =
    !alreadyComplete &&
    settled > 0 &&
    maximumPossibleNetBOnlyHits < REQUIRED_NET_B_ONLY_HITS;

  const futility = {
    version: VERSION,
    evaluated: settled > 0,
    irreversible,
    targetComparableRaces: target,
    settledComparableCount: settled,
    remainingComparableResults: remaining,
    requiredNetBOnlyHits: REQUIRED_NET_B_ONLY_HITS,
    currentNetBOnlyHits,
    maximumPossibleNetBOnlyHits,
    reason: irreversible
      ? "remaining-races-cannot-reach-minimum-net-b-only-hits"
      : alreadyComplete
        ? "fixed-100-already-complete"
        : "minimum-net-b-only-hits-still-mathematically-reachable"
  };

  return {
    ...report,
    status: irreversible && report?.status === "collecting-fixed-100-results"
      ? "candidate-fails-futility"
      : report?.status,
    futility,
    adoptionCandidate: irreversible ? false : report?.adoptionCandidate === true,
    automaticApplication: false,
    usableForPrediction: false
  };
}

module.exports = {
  VERSION,
  REQUIRED_NET_B_ONLY_HITS,
  evaluate
};
