"use strict";

function countSettled(records) {
  return (Array.isArray(records) ? records : []).filter(row => row?.result?.settled === true).length;
}

function countWith(records, selector) {
  return (Array.isArray(records) ? records : []).filter(row => row?.result?.settled === true && selector(row)).length;
}

function build(records, proposalReport) {
  const settledRaceCount = countSettled(records);
  const theoryEvaluationCount = countWith(records, row => row?.theoryEvaluationSnapshot?.status === "evaluated");
  const missCauseAnalysisCount = countWith(records, row => Boolean(row?.result?.missCauseAnalysis));
  const proposal = proposalReport && typeof proposalReport === "object" ? proposalReport : {};
  const safetyViolations = [];

  if (proposal.automaticApplication === true) safetyViolations.push("automatic-application-enabled");
  if (proposal.usableForPrediction === true) safetyViolations.push("prediction-use-enabled");
  if (proposal.uiVisible === true) safetyViolations.push("ui-visible-enabled");
  if (proposal.humanApprovalRequired === false) safetyViolations.push("human-approval-disabled");
  if (proposal.proposalOnly === false) safetyViolations.push("proposal-only-disabled");

  const pipelineCoverage = {
    theoryEvaluation: settledRaceCount ? Math.round(theoryEvaluationCount / settledRaceCount * 1000) / 10 : 0,
    missCauseAnalysis: settledRaceCount ? Math.round(missCauseAnalysisCount / settledRaceCount * 1000) / 10 : 0
  };
  const proposalReady = proposal.status === "proposal-candidates-ready";
  const pipelineComplete = settledRaceCount === 0 || (
    theoryEvaluationCount === settledRaceCount &&
    missCauseAnalysisCount === settledRaceCount
  );

  return {
    schemaVersion: 1,
    engineVersion: "learning-pipeline-gate-phase4-20260806",
    status: safetyViolations.length
      ? "blocked-safety-violation"
      : !pipelineComplete
        ? "blocked-incomplete-pipeline"
        : proposalReady
          ? "awaiting-human-approval"
          : "collecting-data",
    settledRaceCount,
    theoryEvaluationCount,
    missCauseAnalysisCount,
    pipelineCoverage,
    proposalStatus: String(proposal.status || "missing"),
    proposalCount: Number(proposal.proposalCount || 0),
    safetyViolations,
    pipelineComplete,
    humanApprovalRequired: true,
    approvalGranted: false,
    usableForPrediction: false,
    automaticApplication: false,
    uiVisible: false
  };
}

module.exports = { countSettled, countWith, build };
