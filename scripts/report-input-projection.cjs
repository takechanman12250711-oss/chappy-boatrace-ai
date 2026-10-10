'use strict';

// Read-only projections for these reports, applied by analysis-input-contract
// immediately after each daily file is parsed. Never rewrite saved predictions.
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key]]));
const project = (value, fn) => value && typeof value === 'object' ? fn(value) : value;
const map = (value, fn) => Array.isArray(value) ? value.map(fn) : value;
const conditionKeys = ['schemaVersion', 'source', 'dataSource', 'sourceTiming', 'sourceFetchedAt', 'officialResultUsed'];
const predictionFlags = ['isRetrospective', 'predictionMode', 'officialResultUsedForPrediction', 'officialResultUsedForEvaluation'];

function conditions(value) { return project(value, source => pick(source, conditionKeys)); }
function predictionEnvelope(value) {
  return project(value, source => ({ ...pick(source, predictionFlags), preRaceConditions: conditions(source.preRaceConditions) }));
}
function envelope(record) {
  return {
    ...pick(record, ['raceKey', 'date', 'raceDate', 'targetDate', 'jcd', 'placeCode', 'raceNo', 'rno',
      'selectedAt', 'capturedAt', 'createdAt', 'deadlineAt', 'deadline', 'verificationMode',
      'isRetrospective', 'predictionMode', 'officialResultUsedForPrediction', 'officialResultUsedForEvaluation']),
    race: project(record?.race, value => pick(value, ['date', 'jcd', 'placeCode', 'raceNo', 'rno'])),
    preRaceConditions: conditions(record?.preRaceConditions),
    prediction: predictionEnvelope(record?.prediction)
  };
}
function ledgerTicket(value) {
  return project(value, row => pick(row, ['ticket', 'combination', 'text']));
}
function evidence(value) {
  return project(value, row => ({ generation: project(row.generation, generation =>
    pick(generation, ['logicFingerprint', 'confidenceDefinitionVersion', 'ticketPolicyVersion'])) }));
}
function ledgerFields(value) {
  return {
    practicalTickets: map(value?.practicalTickets, ledgerTicket),
    verificationEvidence: evidence(value?.verificationEvidence),
    practicalSelection: project(value?.practicalSelection, selection => ({
      tickets: map(selection.tickets, ledgerTicket), verificationEvidence: evidence(selection.verificationEvidence)
    }))
  };
}
function compactLedgerRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const out = envelope(record);
  // Preserve prediction || record fallback, including an explicitly empty prediction.
  if (record.prediction) out.prediction = { ...out.prediction, ...ledgerFields(record.prediction) };
  else Object.assign(out, ledgerFields(record));
  return out;
}
function basis(value) {
  return project(value, source => ({ analyses: map(source.analyses, row => project(row, analysis => ({
    boatNo: analysis.boatNo,
    indexes: project(analysis.indexes, indexes => pick(indexes, ['raceFlow', 'st', 'exhibition', 'local', 'turn', 'national', 'motor'])),
    roleScores: project(analysis.roleScores, roles => pick(roles, ['attack', 'hold', 'pickup'])),
    courseStructureTheory: project(analysis.courseStructureTheory, course => pick(course, ['appliedIndex']))
  }))) }));
}
function selectionBasis(value) {
  return project(value, selection => ({ frameRiseFallReplayBasis: basis(selection.frameRiseFallReplayBasis) }));
}
function compactOuterAttackRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const out = envelope(record);
  out.frameRiseFallReplayBasis = basis(record.frameRiseFallReplayBasis);
  out.practicalSelection = selectionBasis(record.practicalSelection);
  if (record.prediction) out.prediction = {
    ...out.prediction, practicalSelection: selectionBasis(record.prediction.practicalSelection)
  };
  return out;
}
// normalizeTicket also accepts nested ticket objects and three-element arrays.
// Keep those shapes and their fallback precedence instead of normalizing twice.
function playfulTicket(value) {
  if (Array.isArray(value)) return value.slice(0, 3);
  return project(value, row => Object.fromEntries(['combination', 'ticket', 'resultTicket', 'boats']
    .map(key => [key, playfulTicket(row[key])])));
}
function evaluations(value) {
  return map(value, row => project(row, item => pick(item,
    ['boatNo', 'number', 'waku', 'boat', 'attack', 'tenkai', 'hold', 'expected', 'pickup'])));
}
function entries(value) {
  return map(value, row => project(row, item => pick(item,
    ['boatNo', 'number', 'waku', 'boat', 'registerNo', 'registrationNumber', 'racerName', 'name'])));
}
function compactPlayfulRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const out = envelope(record);
  const p = record.prediction;
  if (!p) return out; // This report's candidate reader intentionally has no root fallback.
  out.prediction = {
    ...out.prediction,
    practicalTickets: map(p.practicalTickets, playfulTicket),
    practicalSelection: project(p.practicalSelection, selection => ({ tickets: map(selection.tickets, playfulTicket) })),
    candidate24Tickets: map(p.candidate24Tickets, playfulTicket),
    boatEvaluation: project(p.boatEvaluation, value => ({ evaluations: evaluations(value.evaluations) })),
    mainSheet: project(p.mainSheet, value => ({
      evaluations: evaluations(value.evaluations), honmei: project(value.honmei, mark => pick(mark, ['boatNo']))
    })),
    verificationEvidence: project(p.verificationEvidence, value => ({ marks: project(value.marks, marks => ({
      honmei: project(marks.honmei, mark => pick(mark, ['boatNo']))
    })) })),
    entries: entries(p.entries),
    preRaceConditions: project(p.preRaceConditions, value => ({
      ...conditions(value), boats: entries(value.boats),
      escapeEvaluationEvidence: project(value.escapeEvaluationEvidence, evidence => ({ entries: entries(evidence.entries) }))
    }))
  };
  return out;
}
module.exports = { compactLedgerRecord, compactOuterAttackRecord, compactPlayfulRecord };
