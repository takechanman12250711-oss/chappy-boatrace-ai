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
// Four-stage uses collectTicketPool's saved ordering, including both root and
// prediction practicalTickets. Keep each source and its score/fallback shape;
// never select or truncate candidates while projecting the input.
function expansionTicket(value) {
  if (Array.isArray(value)) return value.slice(0, 3);
  return project(value, row => ({
    ...playfulTicket(row),
    ...pick(row, ['priorityScore', 'score', 'effectiveScore', 'selectionScore', 'candidateScore',
      'scenarioSummary', 'scenario', 'reason'])
  }));
}
function expansionSelection(value) {
  return project(value, selection => ({
    targetDecisions: map(selection.targetDecisions, decision => project(decision, row => ({
      scenarioSummary: row.scenarioSummary,
      candidateDecisions: map(row.candidateDecisions, expansionTicket),
      bestCandidateTicket: expansionTicket(row.bestCandidateTicket)
    }))),
    expansionSummary: project(selection.expansionSummary, summary => ({
      addedTickets: map(summary.addedTickets, expansionTicket)
    }))
  }));
}
function expansionFields(value) {
  return {
    practicalTickets: map(value?.practicalTickets, expansionTicket),
    tickets: map(value?.tickets, expansionTicket),
    formations: project(value?.formations, formations => Object.fromEntries(
      ['main', 'mainline', 'cover', 'flow', 'hole'].map(key => [key, map(formations[key], expansionTicket)]))),
    practicalSelection: expansionSelection(value?.practicalSelection)
  };
}
function compactFourStageRecord(record = {}) {
  if (!record || typeof record !== 'object') return null;
  const out = { ...envelope(record), ...expansionFields(record) };
  if (record.prediction) out.prediction = { ...out.prediction, ...expansionFields(record.prediction) };
  return out;
}
// These forward audits share the saved candidate pool, capture-time fallbacks,
// and a small set of frozen boat/weather signals. Preserve both root and nested
// conditions: an explicitly empty nested object must still suppress root fallback.
const forwardTimes = ['selectedAt', 'capturedAt', 'savedAt', 'createdAt', 'generatedAt'];
function forwardConditions(value) {
  return project(value, source => ({
    ...conditions(source),
    ...pick(source, ['windSpeed', 'waveHeight']),
    weather: project(source.weather, weather => pick(weather, ['windSpeed', 'wind', 'waveHeight', 'wave'])),
    boats: map(source.boats, boat => project(boat, row => pick(row,
      ['boatNo', 'boat', 'frameNo', 'attackStrength', 'raceFlowPower', 'totalScore', 'exhibitionST'])))
  }));
}
function compactForwardResearchRecord(record = {}) {
  const out = compactFourStageRecord(record);
  if (!out) return out;
  Object.assign(out, pick(record, forwardTimes), { preRaceConditions: forwardConditions(record.preRaceConditions) });
  if (record.prediction) out.prediction = {
    ...out.prediction, ...pick(record.prediction, forwardTimes),
    preRaceConditions: forwardConditions(record.prediction.preRaceConditions)
  };
  return out;
}
module.exports = { compactForwardResearchRecord, compactLedgerRecord, compactOuterAttackRecord, compactPlayfulRecord, compactFourStageRecord };
