#!/usr/bin/env node
'use strict';
// PR562 follow-up A/B. Uses discovery-only midpoint thresholds.
// Target: fixed5 has 1-4 and no 1-5. Reallocate one 1-4 slot to 1-5 when signal gate passes.
// Signals: ST / raceFlow / attack / hold / pickup. Exhibition excluded due direction reversal.
const THRESHOLDS = {
  st: -0.87405,
  flow: -9.3636,
  attack: -3.04335,
  hold: -8.4818,
  pickup: 2.08245,
};
const VARIANTS = [3, 4, 5];
console.log(JSON.stringify({schemaVersion:1,target:'fixed5 has 1-4 and no 1-5',thresholds:THRESHOLDS,variants:VARIANTS.map(n=>`${n}/5`),holdoutStart:'20260812',notes:{thresholdSource:'midpoint of discovery keep14 vs shift15 means from PR562',oddsUsed:false,fixed5Maintained:true}}, null, 2));
// The repository's daily-source evaluator is intentionally invoked by the workflow wrapper added with this PR.
require('./lib/fixed5-pair-conditional-ab-runner')({
  sourcePair: [1,4], targetPair: [1,5], targetBoat: 5, compareBoat: 4,
  thresholds: THRESHOLDS, variants: VARIANTS, holdoutStart: '20260812',
  signals: ['st','flow','attack','hold','pickup']
});
