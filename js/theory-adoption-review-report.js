"use strict";

function approvedCandidates(report) {
  return Array.isArray(report?.approvalGate?.approvedCandidates)
    ? report.approvalGate.approvedCandidates
    : Array.isArray(report?.approvedCandidates)
      ? report.approvedCandidates
      : [];
}

function candidateLabel(candidate) {
  const scope = String(candidate?.scope || "theory");
  const label = String(candidate?.label || candidate?.theoryKey || candidate?.key || "");
  const place = String(candidate?.place || candidate?.jcd || "");
  return scope === "venue-theory" && place ? `${place} × ${label}` : label;
}

function build(productionGate = {}, improvementReport = {}) {
  const approved = approvedCandidates(improvementReport)
    .filter(row => row?.approved === true || row?.status === "approved")
    .map(row => ({
      scope: String(row?.scope || "theory"),
      key: String(row?.key || ""),
      theoryKey: String(row?.theoryKey || row?.key || ""),
      label: candidateLabel(row),
      jcd: String(row?.jcd || ""),
      adjustmentPoints: Number(row?.suggestedAdjustmentPoints || 0),
      firstHalf: row?.firstHalf || null,
      secondHalf: row?.secondHalf || null,
      approved: true
    }));

  const productionCandidate = productionGate?.productionCandidate === true;
  const checks = productionGate?.checks || {};
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);

  return {
    version: "1.0.0",
    status: productionCandidate ? "awaiting-human-approval" : "collecting-evidence",
    productionCandidate,
    humanApprovalRequired: true,
    humanApproved: false,
    adoptionAllowed: false,
    decision: "pending",
    summary: {
      approvedTheoryCandidateCount: approved.length,
      comparableCount: Number(productionGate?.overall?.comparableCount || 0),
      bWins: Number(productionGate?.overall?.bWins || 0),
      aWins: Number(productionGate?.overall?.aWins || 0),
      advantagePoints: Number(productionGate?.overall?.advantagePoints || 0),
      harmfulVenueCount: Number(productionGate?.harmfulVenueCount || 0)
    },
    checks,
    failedChecks,
    firstHalf: productionGate?.firstHalf || null,
    secondHalf: productionGate?.secondHalf || null,
    venueChecks: Array.isArray(productionGate?.venueChecks) ? productionGate.venueChecks : [],
    approvedTheoryCandidates: approved,
    reviewItems: [
      "A/B比較数が安全基準を満たしているか",
      "前半・後半の両方でBが優勢か",
      "特定場で重大な悪化がないか",
      "採用対象の理論と補正幅が妥当か",
      "本番反映後の停止・巻き戻し条件が定義されているか"
    ],
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { approvedCandidates, candidateLabel, build };
