"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");
const GATE = path.join(stats, "unified-improvement-decision-gate.json");
const PROPOSALS = path.join(stats, "improvement-proposal-phase3.json");
const POLICY_REVIEW = path.join(root, "config", "phase3-candidate-policy-review.json");
const OUT = path.join(stats, "phase3-learning-handoff.json");

function read(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function mapHistorical(rows, status) {
  return (Array.isArray(rows) ? rows : []).map((item) => ({
    id: item.code,
    label: item.label,
    theory: item.theory,
    sampleCount: Number(item.sampleCount || 0),
    occurrenceRate: Number(item.occurrenceRate || 0),
    priority: item.priority || null,
    improvementCandidate: item.improvementCandidate || null,
    expectedEffect: item.expectedEffect || null,
    status,
    diagnosticOnly: item.diagnosticOnly === true,
    rootCauseCandidate: item.rootCauseCandidate !== false,
    usableForPrediction: false,
  }));
}

function historicalEvidence(proposalReport = {}) {
  return mapHistorical(proposalReport.proposals, "historical-evidence");
}

function historicalDiagnostics(proposalReport = {}) {
  return mapHistorical(proposalReport.outcomeDiagnostics, "historical-diagnostic");
}

function policyCompatibility(item, policyReviewReport = {}) {
  const review = policyReviewReport?.items?.[item?.id] || item?.policyCompatibility || {};
  const evidence = review.facts || review;
  const requirements = {
    preserveRealisticSecondCourseSashi: true,
    preserveRealisticFourthBoatHold: true,
    preserveEvaluatedScenarioCandidatesForEveryBoat: true,
    candidateGenerationPrecedesTicketLimit: true,
    excludedCandidatesRequireStructuredReason: true,
    numbersAloneMayDeleteTickets: false,
  };
  const missingOrMismatched = Object.entries(requirements)
    .filter(([key, expected]) => evidence[key] !== expected)
    .map(([key]) => key);
  const reviewed = review.reviewed === true;
  return {
    reviewed,
    verified: reviewed && missingOrMismatched.length === 0,
    missingOrMismatched,
    reasons: Array.isArray(review.reasons) ? review.reasons : [],
  };
}

function handoffItem(item, status) {
  return {
    id: item.id,
    sourceFile: item.file,
    affectedSettledCount: item.affectedSettledCount,
    minimumAffectedSettledCount: item.minimumAffectedSettledCount,
    aRecoveryRate: item.aRecoveryRate,
    bRecoveryRate: item.bRecoveryRate,
    aProfit: item.aProfit,
    bProfit: item.bProfit,
    status,
    approved: false,
    productionApplied: false,
  };
}

function build(gate, proposalReport = {}, policyReviewReport = {}) {
  if (!gate || gate.allSourcesConnected !== true) {
    throw new Error("unified gate is not fully connected");
  }

  const items = Array.isArray(gate.items) ? gate.items : [];
  const statisticalCandidates = items.filter(
    (item) => item.status === "available" && item.decision === "candidate",
  );
  const candidates = [];
  const policyReview = [];
  const policyRejected = [];

  for (const item of statisticalCandidates) {
    const compatibility = policyCompatibility(item, policyReviewReport);
    if (compatibility.verified) {
      candidates.push(handoffItem(item, "awaiting-user-approval"));
    } else if (compatibility.reviewed) {
      policyRejected.push({
        ...handoffItem(item, "rejected-policy-incompatible"),
        reason: compatibility.reasons.join(" / ") || "憲章適合条件を満たさない",
        failedRequirements: compatibility.missingOrMismatched,
      });
    } else {
      policyReview.push({
        ...handoffItem(item, "requires-policy-compatibility-review"),
        reason: "憲章適合証跡が不足しているため、数値判定だけでは承認候補へ送らない",
        missingOrMismatched: compatibility.missingOrMismatched,
      });
    }
  }

  const blocked = items
    .filter((item) => item.decision === "blocked")
    .map((item) => ({ id: item.id, reason: item.reason }));
  const historical = historicalEvidence(proposalReport);
  const diagnostics = historicalDiagnostics(proposalReport);
  const historicalSettledRaceCount = Number(proposalReport.settledRaceCount || 0);

  return {
    schemaVersion: 5,
    generatedAt: new Date().toISOString(),
    phase: "phase3",
    implementationComplete: true,
    productionChanged: false,
    automaticApplication: false,
    requiresUserApproval: true,
    allSourcesConnected: true,
    policy: "過去の公式締切前コホートから得た改善根拠を保持し、結果記述だけの診断は別枠で保存する。実A/Bの数値判定に加え、現実的な2コース差し・4号艇残し、候補群保持、点数制限前の候補生成、構造化除外理由、数値単独削除禁止の憲章適合証跡が揃った改善だけ承認候補へ渡す。過去根拠を捨てて0Rから再分析しない。承認前は本番予想へ一切反映しない。",
    policyReviewSource: "config/phase3-candidate-policy-review.json",
    historicalEvidence: {
      source: "improvement-proposal-phase3.json",
      settledRaceCount: historicalSettledRaceCount,
      proposalCount: historical.length,
      proposals: historical,
      diagnosticCount: diagnostics.length,
      diagnostics,
    },
    statisticalCandidateCount: statisticalCandidates.length,
    candidateCount: candidates.length,
    candidates,
    policyReviewCount: policyReview.length,
    policyReview,
    policyRejectedCount: policyRejected.length,
    policyRejected,
    blockedCount: blocked.length,
    blocked,
    nextStep: candidates.length
      ? "user-approval"
      : policyReview.length
        ? "policy-compatibility-review"
        : historical.length
          ? "continue-validation-from-historical-evidence"
          : "collect-more-settled-races",
  };
}

function main() {
  const gate = read(GATE);
  const proposalReport = read(PROPOSALS);
  const policyReviewReport = read(POLICY_REVIEW);
  const report = build(gate, proposalReport, policyReviewReport);
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = {
  mapHistorical,
  historicalEvidence,
  historicalDiagnostics,
  policyCompatibility,
  build,
};
