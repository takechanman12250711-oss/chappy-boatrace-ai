'use strict';
// Research only. Input is a human's cited role assessment, never AI tickets/odds/results.
const crypto = require('node:crypto');
const VERSION = 'independent-role-selector-v1';
const INPUT_VERSION = 'independent-role-input-v1';
const STAGES = Object.freeze(['flow', 'course', 'start', 'exhibition', 'remainPickup', 'localWater', 'skill', 'motor']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw Error(`independent_role_${code}`); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const boat = value => Number.isInteger(value) && value >= 1 && value <= 6;
function select(input, context) {
  if (input?.version !== INPUT_VERSION || !['escape', 'manshu'].includes(input.kind) ||
      !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 7) fail('input_invalid');
  const sources = new Map((context?.sources || []).map(s => [s.sha256, s]));
  const evidence = item => {
    if (!text(item?.reason) || !Array.isArray(item.references) || !item.references.length) fail('evidence_missing');
    for (const ref of item.references) {
      const source = sources.get(ref?.sourceSha256);
      if (!source || !['entry', 'exhibition'].includes(source.role) || !text(source.text) || hash(source.text) !== source.sha256 ||
          !text(ref.quote) || !source.text.includes(ref.quote)) fail('reference_invalid');
    }
  };
  const courses = context?.courses;
  if (!Array.isArray(courses) || courses.length !== 6 || new Set(courses.map(r => r.boat)).size !== 6 ||
      new Set(courses.map(r => r.course)).size !== 6 || courses.some(r => !boat(r.boat) || !boat(r.course))) fail('courses_invalid');
  const scenario = input.scenario;
  evidence(scenario);
  if (!boat(scenario.primaryActor) || scenario.type !== (input.kind === 'escape' ? 'escape' : 'upset')) fail('scenario_invalid');
  const inside = courses.find(r => r.course === 1).boat;
  if (input.kind === 'escape' && scenario.primaryActor !== inside) fail('escape_course_invalid');
  if (input.kind === 'manshu' && !text(scenario.innerBreakReason)) fail('upset_reason_missing');
  if (!Array.isArray(input.roles) || input.roles.length !== 3) fail('roles_invalid');
  let unknownRole = false;
  for (const [i, role] of input.roles.entries()) {
    if (role.position !== i + 1 || !Array.isArray(role.boats) || role.boats.length !== 6 ||
        new Set(role.boats.map(r => r.boat)).size !== 6) fail('roles_invalid');
    for (const row of role.boats) {
      if (!boat(row.boat) || ![true, false, null].includes(row.eligible) || !text(row.reason)) fail('role_invalid');
      if (row.eligible === null) {
        if (!Array.isArray(row.references) || row.references.length) fail('unknown_references_invalid');
        unknownRole = true;
      } else evidence(row);
    }
  }
  if (!Array.isArray(input.stages) || input.stages.length !== STAGES.length ||
      input.stages.some((s, i) => s.stage !== STAGES[i])) fail('stage_order_invalid');
  const unknownStages = [];
  const ranks = input.stages.map(s => {
    if (s.status === 'unknown') {
      if (!text(s.reason) || !Array.isArray(s.references) || s.references.length || s.roles !== null) fail('unknown_stage_invalid');
      unknownStages.push(s.stage); return null;
    }
    if (s.status !== 'observed' || !Array.isArray(s.roles) || s.roles.length !== 3) fail('stage_invalid');
    return s.roles.map((role, i) => {
      evidence(role);
      if (role.position !== i + 1 || !Array.isArray(role.groups) || !role.groups.length ||
          role.groups.some(g => !Array.isArray(g) || !g.length)) fail('groups_invalid');
      const flat = role.groups.flat();
      if (flat.length !== 6 || new Set(flat).size !== 6 || flat.some(b => !boat(b))) fail('groups_invalid');
      return Object.fromEntries(role.groups.flatMap((group, rank) => group.map(b => [b, rank])));
    });
  });
  const base = { version: VERSION, inputVersion: INPUT_VERSION, provenance: 'human-role-annotations',
    productionChanged: false, automaticProductionChange: false, usableForPrediction: false, automaticReady: false,
    limit: input.limit, candidates: [], layers: [], selected: [], unknownStages };
  const skip = (reason, extra = {}) => ({ ...base, status: 'skipped', reason, ...extra });
  if (unknownRole || unknownStages.length) return skip('incomplete_role_evidence');
  const allowed = input.roles.map(r => r.boats.filter(b => b.eligible).map(b => b.boat).sort((a,b) => a-b));
  // v1 covers one declared main branch. Additional heads require a new protocol.
  if (allowed[0].length !== 1 || allowed[0][0] !== scenario.primaryActor) return skip('single_main_branch_required');
  for (const a of allowed[0]) for (const b of allowed[1]) for (const c of allowed[2]) {
    if (new Set([a,b,c]).size === 3) base.candidates.push(`${a}-${b}-${c}`);
  }
  if (base.candidates.length < input.limit) return skip('candidate_shortfall');
  const dominates = (a, b) => {
    const aa = a.split('-'), bb = b.split('-');
    for (const stage of ranks) {
      const delta = stage.map((r, i) => r[aa[i]] - r[bb[i]]);
      if (delta.every(d => d === 0)) continue;
      // Cross-position tradeoffs stay unresolved; lower stages cannot override them.
      return delta.every(d => d <= 0) && delta.some(d => d < 0);
    }
    return false;
  };
  let remaining = [...base.candidates];
  while (remaining.length) {
    const front = remaining.filter(t => !remaining.some(other => dominates(other, t))).sort();
    if (!front.length) fail('dominance_cycle');
    base.layers.push(front); remaining = remaining.filter(t => !front.includes(t));
  }
  const chosen = [];
  for (const layer of base.layers) {
    if (chosen.length + layer.length > input.limit) return skip('ambiguous_cutoff');
    chosen.push(...layer);
    if (chosen.length === input.limit) break;
  }
  // Lexical order within a full accepted front is display order only, never a cutoff.
  return { ...base, status: 'selected', reason: 'complete_priority_fronts', selected: chosen };
}
module.exports = { VERSION, INPUT_VERSION, STAGES, select, hash };
