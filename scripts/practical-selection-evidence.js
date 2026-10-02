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
  const excludedCandidates = list(selection.excludedCandidates).map(row => pick(row, decisionKeys));
  const targetDecisions = list(selection.targetDecisions).map(row => ({
    ...pick(row,['evaluationId','boatNo','selected','selectedTickets','adoptionSupported','supportedSelectedTickets',
      'candidateCount','selectedCandidateCount','excludedCandidateCount','hiddenCandidateCount',
      'bestCandidateTicket','bestCandidateScore','selectionBoundary','comparisonTicket','comparisonScore','scoreGap','reasonCode','reason']),
    candidateDecisions:list(row.candidateDecisions).map(d => pick(d, decisionKeys))
  }));
  return finish({status:'captured',selectionStatus:selection.status,selectionReason:selection.reason,
    practicalTickets:expected,candidateDecisions,excludedCandidates,targetDecisions,
    generation:selection.verificationEvidence?.generation || null,
    decisionCount:candidateDecisions.length + excludedCandidates.length + targetDecisions.reduce((n,r)=>n+r.candidateDecisions.length,0)});
}
module.exports = { capture };
