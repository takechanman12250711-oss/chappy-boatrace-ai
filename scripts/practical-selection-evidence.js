'use strict';
// Snapshot existing decisions, never reconstruct them from a race result.
const value = t => typeof t === 'string' ? t : t?.ticket;
const list = a => Array.isArray(a) ? a : [];
const pick = (row, keys) => Object.fromEntries(keys.filter(k => row?.[k] !== undefined).map(k => [k, row[k]]));
const decisionKeys = ['ticket','selected','ticketSelected','relation','reasonCode','reason',
  'priorityScore','category','selectionTier','branchIds','requirementIds','coveredEvaluationIds',
  'candidateOnlyEvaluationIds','physicalCoverage','roleLabels','scenarioTitle','scenarioSummary'];
function capture(record, baseline, selection) {
  const evidence = { version:'practical-selection-evidence-v1', raceKey:record.raceKey,
    selectedAt:record.selectedAt, deadlineAt:record.deadlineAt,
    reviewEvidence:record.reviewEvidence, productionChanged:false, resultUsedForGeneration:false };
  const finish = payload => JSON.parse(JSON.stringify({...evidence,...payload}));
  if (!selection || !Array.isArray(selection.tickets)) return finish({status:'selection-unavailable'});
  const selected = selection.tickets.map(value), expected = list(baseline).map(value);
  const valid = a => a.length > 0 && a.length <= 10 && new Set(a).size === a.length &&
    a.every(t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3);
  if (!valid(selected) || !valid(expected) || JSON.stringify([...selected].sort()) !== JSON.stringify([...expected].sort()))
    return finish({status:'baseline-mismatch'});
  const candidateDecisions = list(selection.candidateDecisions).map(row => pick(row, decisionKeys));
  // Additive v1 sidecar. Old snapshots remain readable and are not backfilled.
  // Missing evidence/fields stay missing; stage observations are not final votes.
  const validation = selection.candidateValidationEvidence;
  const sidecarMatches = validation?.status === 'captured' && validation.resultUsedForGeneration === false &&
    Array.isArray(validation.poolTickets) && validation.poolTickets.length <= 120 &&
    new Set(validation.poolTickets).size === validation.poolTickets.length &&
    validation.poolTickets.every(t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3) &&
    Array.isArray(validation.finalSelectedTickets) &&
    JSON.stringify([...validation.finalSelectedTickets].sort()) === JSON.stringify([...expected].sort()) &&
    expected.every(t => validation.poolTickets.includes(t)) && Array.isArray(validation.observations) &&
    validation.observations.every(row => row && validation.poolTickets.includes(row.ticket) &&
      ['selection','pool-audit'].includes(row.stage)) &&
    validation.poolTickets.every(t => validation.observations.some(row => row.ticket === t));
  const candidateValidationEvidence = validation?.version === 'candidate-validation-evidence-v1' && sidecarMatches
    ? { ...pick(validation, ['version','status','resultUsedForGeneration','poolTickets','finalSelectedTickets']),
      branches:list(validation.branches).map(branch => ({
        ...pick(branch, ['id','ticket','scenarioId','kind','source','qualified','priorityScore']),
        roles:list(branch.roles).map(role => pick(role,['evaluationId','boatNo','role','eligiblePositions','score'])),
        evidenceChecks:list(branch.evidenceChecks).map(check => pick(check,
          ['key','matched','required','source','boatNo','role','score']))
      })),
      observations:list(validation.observations).map(row => ({
        ...pick(row, ['ticket','sourceCategory','stage','inputBranchIds','valid','purchaseEligible',
          'expansionEligible','validBranchIds','validPurchaseBranchIds','validIndependentBranchIds',
          'validScenarioIds','requirementIds','coveredEvaluationIds','coveredBoatNos','priorityScore',
          'invalidReasons','reasonCode','reason']),
        coverage:list(row.coverage).map(claim => pick(claim,
          ['evaluationId','boatNo','position','role','branchId'])),
        physicalCoverage:list(row.physicalCoverage).map(claim => pick(claim,
          ['evaluationId','boatNo','position','role','score','branchId']))
      })) }
    : validation ? {version:'candidate-validation-evidence-v1', status:'invalid-or-unavailable'} : undefined;
  const excludedCandidates = list(selection.excludedCandidates).map(row => pick(row, decisionKeys));
  const targetDecisions = list(selection.targetDecisions).map(row => ({
    ...pick(row,['evaluationId','boatNo','selected','selectedTickets','adoptionSupported','supportedSelectedTickets',
      'candidateCount','selectedCandidateCount','excludedCandidateCount','hiddenCandidateCount',
      'bestCandidateTicket','bestCandidateScore','selectionBoundary','comparisonTicket','comparisonScore','scoreGap','reasonCode','reason']),
    candidateDecisions:list(row.candidateDecisions).map(d => pick(d, decisionKeys))
  }));
  return finish({status:'captured',selectionStatus:selection.status,selectionReason:selection.reason,
    practicalTickets:expected,candidateDecisions,excludedCandidates,targetDecisions,
    ...(candidateValidationEvidence ? {candidateValidationEvidence} : {}),
    generation:selection.verificationEvidence?.generation || null,
    decisionCount:candidateDecisions.length + excludedCandidates.length + targetDecisions.reduce((n,r)=>n+r.candidateDecisions.length,0)});
}
module.exports = { capture };
