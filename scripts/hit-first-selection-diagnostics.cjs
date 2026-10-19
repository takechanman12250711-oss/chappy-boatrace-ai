'use strict';
// Saved-input coverage only. This module never generates or selects tickets.
const { selectionEvidence, actualSelectionDiagnostic } = require('./build-race-review-progress');
const VERSION = 'hit-first-saved-selection-diagnostics-v1';
const validTicket = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const reviewKeys = ['version', 'method', 'predictionMode', 'officialResultUsedForPrediction'];
const evidenceKeys = ['version', 'status', 'productionChanged', 'resultUsedForGeneration', 'raceKey',
  'selectedAt', 'deadlineAt', 'reviewEvidence', 'practicalTickets', 'selectionReason',
  'candidateDecisions', 'excludedCandidates', 'targetDecisions'];
const pick = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]])) : value;
function savedTime(value) {
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 ||
      Number(m[3]) > new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() ||
      Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return NaN;
  return Date.parse(value);
}

function project(record) {
  const prediction = record?.prediction || record || {};
  const evidence = pick(record?.practicalSelectionEvidence, evidenceKeys);
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence) && Object.hasOwn(evidence, 'reviewEvidence'))
    evidence.reviewEvidence = pick(evidence.reviewEvidence, reviewKeys);
  return { explicitCapture: { raceKey: record?.raceKey, selectedAt: record?.selectedAt, deadlineAt: record?.deadlineAt },
    candidate24Tickets: Array.isArray(prediction.candidate24Tickets)
      ? prediction.candidate24Tickets.map(t => typeof t === 'string' ? t : t?.ticket) : prediction.candidate24Tickets,
    practicalSelectionEvidence: evidence,
    reviewEvidence: pick(record?.reviewEvidence, reviewKeys) };
}
function diagnose(record, row, seal) {
  const input = seal ? { sha256: seal.inputSha256, matches: seal.matches } : null;
  if (!seal) return { version: VERSION, status: 'unknown', reason: 'diagnostic-seal-missing', input,
    candidate24: { status: 'unknown' }, selectionEvidence: { status: 'unknown' } };
  if (seal.conflict) return { version: VERSION, status: 'conflict',
    reason: seal?.reason || 'conflicting-saved-diagnostic-input', input,
    candidate24: { status: 'conflict' }, selectionEvidence: { status: 'conflict' } };
  const prediction = record?.prediction || record || {}, pool = prediction.candidate24Tickets;
  let candidate24;
  if (pool === undefined) candidate24 = { status: 'unknown', reason: 'candidate24-not-saved' };
  else {
    const normalized = Array.isArray(pool) ? pool.map(t => typeof t === 'string' ? t : t?.ticket) : null;
    if (!normalized || normalized.length > 24 || normalized.some(t => !validTicket(t)) || new Set(normalized).size !== normalized.length)
      candidate24 = { status: 'conflict', reason: 'invalid-saved-candidate24' };
    else candidate24 = { status: 'available', count: normalized.length,
      actualIncluded: normalized.includes(row.actual),
      winningHeadIncluded: normalized.some(t => t[0] === row.actual[0]),
      firstSecondIncluded: normalized.some(t => t.slice(0, 3) === row.actual.slice(0, 3)) };
  }
  let evidence;
  const selected = savedTime(record?.selectedAt), deadline = savedTime(record?.deadlineAt);
  const explicitIdentity = record?.raceKey === row.raceKey && record?.selectedAt === row.selectedAt &&
    Number.isFinite(selected) && Number.isFinite(deadline) && selected < deadline;
  try { evidence = record?.practicalSelectionEvidence && !explicitIdentity
    ? { status: 'rejected', reason: 'diagnostic-capture-identity-mismatch' } : selectionEvidence(record, row.base); }
  catch { evidence = { status: 'rejected', reason: 'invalid-history' }; }
  let selection;
  if (!evidence) selection = { status: 'unknown', reason: 'selection-evidence-not-saved' };
  else if (evidence.status !== 'validated') selection = { status: 'conflict', reason: evidence.reason || 'invalid-selection-evidence' };
  else {
    // Keep stage observations distinct from the final saved ticket membership.
    // Passing [] here must not turn an unknown display pool into a false claim.
    const detail = actualSelectionDiagnostic(evidence, row.actual, candidate24.status === 'available' ? pool.map(t => typeof t === 'string' ? t : t.ticket) : []);
    delete detail.actualInCandidatePool;
    selection = { ...detail, status: 'available' };
  }
  const states = [candidate24.status, selection.status];
  const status = states.includes('conflict') ? 'conflict' : states.every(s => s === 'available') ? 'available'
    : states.includes('available') ? 'partial' : 'unknown';
  return { version: VERSION, status, input, candidate24, selectionEvidence: selection };
}
function summarize(rows) {
  const counts = { available: 0, partial: 0, unknown: 0, conflict: 0 };
  const candidate24 = { available: 0, unknown: 0, conflict: 0, actualIncluded: 0, winningHeadIncluded: 0, firstSecondIncluded: 0 };
  const selectionEvidenceCounts = { available: 0, unknown: 0, conflict: 0 };
  for (const row of rows) {
    const d = row.savedSelectionDiagnostic;
    counts[d.status]++;
    candidate24[d.candidate24.status]++;
    selectionEvidenceCounts[d.selectionEvidence.status]++;
    if (d.candidate24.status === 'available') for (const key of ['actualIncluded', 'winningHeadIncluded', 'firstSecondIncluded'])
      if (d.candidate24[key]) candidate24[key]++;
  }
  return { version: VERSION, races: rows.length, counts, candidate24, selectionEvidence: selectionEvidenceCounts,
    productionChanged: false, automaticApplication: false, usableForPrediction: false,
    interpretation: 'Coverage of the saved display candidate24 and validated stage observations only. Absence from candidate24 does not prove a ticket was never generated. Stage selected flags are not final disposition or causal explanations. Missing evidence remains unknown; diagnostic conflicts never remove baseline races.' };
}
module.exports = { VERSION, project, diagnose, summarize };
