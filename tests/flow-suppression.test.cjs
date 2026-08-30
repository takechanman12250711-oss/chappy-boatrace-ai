'use strict';

const assert = require('node:assert/strict');
const {
  FIXED_ROUTING_RULES,
  summarize,
  compareGroups,
  decideNextStep,
  build
} = require('../scripts/analyze-flow-suppression.cjs');

assert.equal(FIXED_ROUTING_RULES.minimumAttackWinCount, 10);
assert.equal(FIXED_ROUTING_RULES.minimumInnerWinCount, 30);

const summarized = summarize([
  { st: 1, roleAttack: 2, raceFlow: -3, exhibition: 4, courseIndex: -5 },
  { st: 3, roleAttack: 4, raceFlow: -1, exhibition: 2, courseIndex: -3 }
]);
assert.deepEqual(summarized, {
  count: 2,
  avg: {
    st: 2,
    roleAttack: 3,
    raceFlow: -2,
    exhibition: 3,
    courseIndex: -4
  }
});

function group(count, values) {
  return {
    count,
    avg: {
      st: 0,
      roleAttack: 0,
      raceFlow: 0,
      exhibition: 0,
      courseIndex: 0,
      ...values
    }
  };
}

{
  const attack = group(9, { raceFlow: -3, exhibition: 2 });
  const inner = group(30, { raceFlow: -1, exhibition: -1 });
  const decision = decideNextStep(attack, inner, compareGroups(attack, inner));
  assert.equal(decision.nextStep, 'continue-collecting-flow-suppression-discovery');
}

{
  const attack = group(10, { raceFlow: -3, exhibition: 0.2 });
  const inner = group(30, { raceFlow: -1, exhibition: 0.1 });
  const decision = decideNextStep(attack, inner, compareGroups(attack, inner));
  assert.equal(decision.nextStep, 'validate-raceflow-suppression-on-untouched-holdout');
  assert.equal(decision.raceFlowSuppressionSupported, true);
}

{
  const attack = group(10, { raceFlow: -2.1, exhibition: 0.9 });
  const inner = group(30, { raceFlow: -1.9, exhibition: -0.5 });
  const decision = decideNextStep(attack, inner, compareGroups(attack, inner));
  assert.equal(decision.nextStep, 'validate-st-role-attack-exhibition-on-untouched-holdout');
  assert.equal(decision.raceFlowSuppressionSupported, false);
}

{
  const attack = group(10, { raceFlow: -2.1, exhibition: 0.4 });
  const inner = group(30, { raceFlow: -1.9, exhibition: 0.1 });
  const decision = decideNextStep(attack, inner, compareGroups(attack, inner));
  assert.equal(decision.nextStep, 'close-flow-suppression-without-production-change');
}

const report = build();
assert.equal(report.schemaVersion, 2);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.scope.dataset, 'discovery-only');
assert.equal(report.scope.holdoutUsed, false);
assert.equal(report.scope.resultUsedForCandidateSelection, false);
assert.ok(report.attackWin.count + report.innerWin.count > 0);
assert.equal(report.records.attackWin.length, report.attackWin.count);
assert.equal(report.records.innerWin.length, report.innerWin.count);
assert.equal(typeof report.nextStep, 'string');
assert.ok(report.nextStep.length > 0);

console.log('flow suppression tests passed');
