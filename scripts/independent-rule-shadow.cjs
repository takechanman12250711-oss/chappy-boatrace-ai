'use strict';
const fs = require('node:fs');
const { select, hash } = require('./independent-role-selector.cjs');
const { validateDecisionEvidence } = require('./independent-monitor-decision.cjs');
const { independentArticle } = require('./note-independent-monitor-source');
const { requireExhibition } = require('./note-exhibition');
const selectorHash = () => hash(fs.readFileSync(require.resolve('./independent-role-selector.cjs')));
function buildShadow(bundle) {
  if (bundle?.monitor?.ruleInput === undefined) return null;
  independentArticle(bundle); requireExhibition(bundle.record);
  const evidence = validateDecisionEvidence(bundle);
  if (!evidence.recorded) throw Error('independent_rule_decision_required');
  const input = bundle.monitor.ruleInput, d = bundle.monitor.decisionEvidence;
  if (input.raceKey !== bundle.record.raceKey || input.kind !== bundle.monitor.kind || input.decidedAt !== bundle.monitor.confirmedAt ||
      JSON.stringify(input.scenario) !== JSON.stringify(d.scenario) || input.limit !== bundle.monitor.tickets.length ||
      JSON.stringify(input.stages?.map(s => [s.stage, s.status])) !== JSON.stringify(d.stages.map(s => [s.stage, s.status]))) {
    throw Error('independent_rule_identity_mismatch');
  }
  // Pass only independently annotated inputs and official context. No baseline tickets/results/odds.
  const result = select(input, { sources: bundle.monitor.sources,
    courses: bundle.record.exhibitionSnapshot.startExhibition.map(r => ({ boat: r.boat, course: r.course })) });
  return { version: 'independent-rule-shadow-v1', selectorHash: selectorHash(), inputHash: hash(JSON.stringify(input)),
    raceKey: input.raceKey, kind: input.kind, decidedAt: input.decidedAt,
    baseline: bundle.monitor.tickets.map(t => typeof t === 'string' ? t : t.ticket),
    result, forwardEligible: false, evidenceState: 'remote_seal_required' };
}
function withShadow(bundle) {
  const shadow = buildShadow(bundle);
  if (!shadow) {
    if (bundle.independentRuleShadow !== undefined) throw Error('independent_rule_orphan_shadow');
    return bundle;
  }
  if (bundle.independentRuleShadow !== undefined && JSON.stringify(bundle.independentRuleShadow) !== JSON.stringify(shadow)) {
    throw Error('independent_rule_shadow_mismatch');
  }
  return { ...bundle, independentRuleShadow: shadow };
}
module.exports = { selectorHash, buildShadow, withShadow };
