'use strict';
const assert = require('node:assert/strict');
const { evaluatePair, aggregate } = require('../scripts/final-ticket-candidate-evaluator.cjs');

const baseline = {
  ranking: [{ boatNo: 1 }],
  aiCore: { scenario: { main: { type: 'escape', attackerBoatNo: 1 } } },
  buyTickets: ['1-2-3', '1-3-2']
};
const candidate = {
  ranking: [{ boatNo: 3 }],
  aiCore: { scenario: { main: { type: 'threeAttack', attackerBoatNo: 3 } } },
  buyTickets: ['3-1-2', '3-2-1']
};
const row = evaluatePair({ baseline, candidate, result: { order: [3, 1, 2], trifectaPayout: 2400 } });
assert.equal(row.rankingChanged, true);
assert.equal(row.scenarioChanged, true);
assert.equal(row.attackerChanged, true);
assert.equal(row.ticketsChanged, true);
assert.equal(row.addedHit, true);
assert.equal(row.lostHit, false);

const report = aggregate([row]);
assert.deepEqual(report.propagation, { rankingChanged: 1, scenarioChanged: 1, attackerChanged: 1, ticketsChanged: 1 });
assert.equal(report.hits.net, 1);
assert.equal(report.roi.baseline, 0);
assert.equal(report.roi.candidate, 1200);

const unchanged = evaluatePair({ baseline, candidate: baseline, result: { order: [1, 2, 3], trifectaPayout: 800 } });
assert.equal(unchanged.rankingChanged, false);
assert.equal(unchanged.scenarioChanged, false);
assert.equal(unchanged.attackerChanged, false);
assert.equal(unchanged.ticketsChanged, false);
assert.equal(unchanged.baseline.hit, true);
assert.equal(unchanged.candidate.hit, true);

console.log('final-ticket-candidate-evaluator: OK');
