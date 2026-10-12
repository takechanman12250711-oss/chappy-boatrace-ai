'use strict';
// Research only. Never connected to capture, publication, or production selection.
const source = require('./independent-partner-selector-v2.cjs');
const { hash } = require('./independent-autonomous-candidate.cjs');
const VERSION = 'independent-pair-stage-research-v1';
const STAGES = ['start', 'exhibition', 'remainPickup', 'localWater', 'skill'];
const json = x => JSON.stringify(x) + '\n';

// Internal comparison of evidence already verified by source.validate in judge().
function comparePairs(a, b, comparisons) {
  const evaluated = [];
  for (const stage of STAGES) {
    const positions = [2, 3].map(position => {
      const key = position === 2 ? 'second' : 'third';
      if (a[key] === b[key]) return { position, outcome: 0, sourceIndex: null, stageIndex: null };
      const sourceIndex = comparisons.findIndex(c => c.position === position &&
        ((c.a === a[key] && c.b === b[key]) || (c.a === b[key] && c.b === a[key])));
      if (sourceIndex < 0) throw Error('pair_stage_comparison_missing');
      const c = comparisons[sourceIndex], stageIndex = c.evaluated.findIndex(s => s.stage === stage);
      if (stageIndex < 0) throw Error('pair_stage_evidence_missing');
      const original = c.evaluated[stageIndex].outcome;
      if (![null, -1, 0, 1].includes(original)) throw Error('pair_stage_outcome_invalid');
      const outcome = original === null || original === 0 ? original : (c.a === a[key] ? original : -original);
      return { position, outcome, sourceIndex, stageIndex };
    });
    const values = positions.map(p => p.outcome);
    const outcome = values.includes(null) || (values.includes(-1) && values.includes(1)) ? null
      : values.includes(-1) ? -1 : values.includes(1) ? 1 : 0;
    evaluated.push({ stage, positions, outcome });
    if (outcome !== 0) return { outcome, decidingStage: stage, evaluated };
  }
  return { outcome: 0, decidingStage: 'tie', evaluated };
}

function judge(input, context, flow, support, routeWater, baseline) {
  source.validate(baseline, input, context, flow, support, routeWater);
  const base = { version: VERSION, raceKey: input.raceKey, inputHash: baseline.inputHash,
    sourceSelectionHash: hash(json(baseline)), scenarioId: baseline.scenarioId, head: baseline.head,
    stageOrder: STAGES, baselineStatus: baseline.status, baselineReason: baseline.reason,
    baselineTickets: [...baseline.tickets], budget: baseline.status === 'selected' ? baseline.tickets.length : null,
    comparisons: [], layers: [], pool: [], tickets: [],
    resultUsedForSelection: false, productionChanged: false, automaticApplication: false,
    usableForPrediction: false, actualTurnObserved: false, routeCompatibilityInferred: false,
    adoptionGate: null };
  const finish = extra => { const body = { ...base, ...extra }; return { ...body, researchHash: hash(json(body)) }; };
  if (baseline.pool.length !== 20) return finish({ status: 'skipped', reason: 'source-pool-not-evaluated' });
  base.pool = baseline.pool.map(p => ({ ticket: p.ticket, second: p.second, third: p.third, dominatedBy: [] }));
  for (let i = 0; i < base.pool.length; i++) for (let j = i + 1; j < base.pool.length; j++) {
    const a = base.pool[i], b = base.pool[j], c = comparePairs(a, b, baseline.comparisons);
    base.comparisons.push({ a: a.ticket, b: b.ticket, ...c });
    if (c.outcome === -1) b.dominatedBy.push(a.ticket);
    if (c.outcome === 1) a.dominatedBy.push(b.ticket);
  }
  let remaining = [...base.pool];
  while (remaining.length) {
    const keys = new Set(remaining.map(p => p.ticket));
    const layer = remaining.filter(p => !p.dominatedBy.some(t => keys.has(t)));
    if (!layer.length) throw Error('pair_stage_comparison_cycle');
    base.layers.push(layer.map(p => p.ticket));
    const taken = new Set(layer.map(p => p.ticket));
    remaining = remaining.filter(p => !taken.has(p.ticket));
  }
  if (baseline.status !== 'selected') return finish({ status: 'skipped', reason: 'baseline-not-selected' });
  const selected = [];
  for (const layer of base.layers) {
    if (selected.length + layer.length > base.budget)
      return finish({ status: 'skipped', reason: 'equal-budget-boundary-unresolved' });
    selected.push(...layer);
    if (selected.length === base.budget) break;
  }
  if (selected.length !== base.budget) throw Error('pair_stage_budget_mismatch');
  const changed = [...selected].sort().join('|') !== [...baseline.tickets].sort().join('|');
  return finish({ status: 'selected', reason: changed ? 'same-budget-stage-synchronous-candidate' : 'no-changed-tickets', tickets: selected, changed });
}
module.exports = { VERSION, STAGES, comparePairs, judge };
