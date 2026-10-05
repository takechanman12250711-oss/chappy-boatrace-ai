'use strict';
// Records independent decisions; never generates tickets or calls the normal AI.
const { independentArticle } = require('./note-independent-monitor-source');
const { requireExhibition } = require('./note-exhibition');
const VERSION = 'independent-monitor-decision-v1';
const STAGES = ['flow', 'course', 'start', 'exhibition', 'remainPickup', 'localWater', 'skill', 'motor'];
const fail = code => { throw new Error(`independent_decision_${code}`); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const ticketOf = row => typeof row === 'string' ? row : row?.ticket;
function validateDecisionEvidence(bundle) {
  const d = bundle?.monitor?.decisionEvidence;
  if (d === undefined) return { status: 'legacy_unstructured', recorded: false, automaticReady: false };
  independentArticle(bundle);
  requireExhibition(bundle.record);
  if (!d || d.version !== VERSION || d.origin !== 'independent-human' ||
      d.raceKey !== bundle.record.raceKey || d.kind !== bundle.monitor.kind ||
      d.decidedAt !== bundle.monitor.confirmedAt) fail('identity_invalid');
  const sources = new Map(bundle.monitor.sources.map(s => [s.sha256, s]));
  const refs = value => {
    if (!Array.isArray(value) || !value.length) fail('references_missing');
    for (const ref of value) {
      const source = sources.get(ref?.sourceSha256);
      if (!source || source.role === 'odds' || !nonempty(ref.quote) || !source.text.includes(ref.quote)) fail('reference_invalid');
    }
  };
  if (!Array.isArray(d.stages) || d.stages.length !== STAGES.length ||
      d.stages.some((s, i) => s.stage !== STAGES[i])) fail('stage_order_invalid');
  for (const s of d.stages) {
    if (!['observed', 'unknown'].includes(s.status) || !nonempty(s.reason)) fail('stage_invalid');
    if (s.status === 'observed') refs(s.references);
    else if (!Array.isArray(s.references) || s.references.length) fail('unknown_references_invalid');
  }
  const s = d.scenario;
  if (!s || !Number.isInteger(s.primaryActor) || s.primaryActor < 1 || s.primaryActor > 6 || !nonempty(s.reason)) fail('scenario_invalid');
  refs(s.references);
  if (bundle.monitor.kind === 'escape') {
    const courseOne = bundle.record.exhibitionSnapshot.startExhibition.find(r => r.course === 1)?.boat;
    if (s.type !== 'escape' || s.primaryActor !== courseOne) fail('escape_course_invalid');
  } else if (s.type !== 'upset' || !nonempty(s.innerBreakReason)) fail('upset_reason_missing');
  if (!Array.isArray(d.candidates) || !d.candidates.length || d.candidates.length > 120) fail('candidates_missing');
  const tickets = new Set(), ranks = new Set();
  for (const c of d.candidates) {
    if (!/^[1-6]-[1-6]-[1-6]$/.test(c.ticket) || new Set(c.ticket.split('-')).size !== 3 ||
        tickets.has(c.ticket) || !Number.isInteger(c.priority) || c.priority < 1 || ranks.has(c.priority) ||
        !['selected', 'rejected'].includes(c.decision) || !nonempty(c.reason)) fail('candidate_invalid');
    tickets.add(c.ticket); ranks.add(c.priority); refs(c.references);
    const boats = c.ticket.split('-').map(Number);
    if (!Array.isArray(c.roles) || c.roles.length !== 3 || c.roles.some((role, i) =>
      role.position !== i + 1 || role.boat !== boats[i] || !nonempty(role.reason))) fail('ticket_roles_invalid');
    c.roles.forEach(role => refs(role.references));
  }
  const selected = d.candidates.filter(c => c.decision === 'selected').sort((a,b) => a.priority - b.priority).map(c => c.ticket);
  if (JSON.stringify(selected) !== JSON.stringify(bundle.monitor.tickets.map(ticketOf))) fail('selected_tickets_mismatch');
  return { status: 'structured_human_decision', recorded: true,
    unknownStages: d.stages.filter(s => s.status === 'unknown').map(s => s.stage),
    selectedCount: selected.length, rejectedCount: d.candidates.filter(c => c.decision === 'rejected').length,
    automaticReady: false };
}
module.exports = { VERSION, STAGES, validateDecisionEvidence };
