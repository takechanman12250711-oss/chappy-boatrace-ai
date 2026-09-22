'use strict';
const assert = require('node:assert/strict');
const { compact, resultOf, settle, build } = require('./audit-escape-main.cjs');
const conditions = require('../js/prediction-conditions');
const record = { raceKey: '20260921-15-10', date: '20260921', jcd: '15', raceNo: 10,
  selectedAt: '2026-09-21T10:00:00Z', prediction: {
    practicalTickets: [{ ticket: '4-1-2', category: '本線' }], candidate24Tickets: ['4-1-2', '1-2-6'],
    verificationEvidence: { marks: { honmei: { boatNo: 4 } }, mainScenario: { type: 'fourAttack', score: 89 },
      scenarios: [{ type: 'escape', headBoatNo: 1, score: 63 }] } } };
const official = { resultAvailable: true, source: 'boatrace-official', trifecta: { combination: '1-2-6', payout: 3620 }, winningMethod: '逃げ' };
let row = settle(compact(record, 'daily-primary'), resultOf(official));
assert.equal(row.missingStage, 'candidate-hit-practical-miss');
assert.equal(row.historyCaptured, false);
assert.equal(row.escapeTopButDifferentHead, false);
assert.equal(resultOf({ ...official, source: 'unofficial' }), null);
assert.equal(resultOf({ ...official, refund: true }).excluded, 'refund-or-void');
assert.equal(resultOf({ ...official, trifecta: { combination: '1-2-6' } }).excluded, 'unknown-payout');
const withoutPool = structuredClone(record); delete withoutPool.prediction.candidate24Tickets;
assert.equal(settle(compact(withoutPool, 'daily-primary'), resultOf(official)).missingStage, 'candidate-pool-unavailable');
const report = build([row]);
assert.equal(report.byVenue.length, 24);
assert.equal(new Set(report.byVenue.map(v => v.jcd)).size, 24);
assert.equal(report.total.stake, 100);
assert.equal(report.total.hits, 0);
assert.equal(report.byVenue[0].hitRate, null);
assert.equal(report.decisionGate.decision, 'INSUFFICIENT_EVIDENCE');
assert.equal(report.total.missedBoat1WinsWithoutAnyBoat1Ticket, 1);
// Actual entry, not the boat number, identifies the escape scenario's head.
const moved = structuredClone(record);
moved.prediction.verificationEvidence.scenarios[0].headBoatNo = 2;
moved.prediction.practicalTickets = [{ ticket: '2-1-6' }];
assert.equal(settle(compact(moved, 'daily-primary'), resultOf(official)).escapeInPractical, true);
const raw = { source: 'boatrace-official', fetchedAt: '2026-09-21T10:00:00Z', entries: [{ boat: 1, currentSeries: { st: [0.12] } }],
  historyContext: { racers: [{ registerNo: '1234', byCourse: { 1: { wins: 7 } } }] } };
const pred = { aiCore: { racerSkillTheory: { roles: [{ boatNo: 1, score: 80 }] }, raceScenarios: { mainScenario: { type: 'escape' } } } };
const original = JSON.stringify({ raw, pred });
const snapshot = conditions.capture(raw, pred);
assert.equal(JSON.stringify({ raw, pred }), original);
assert.equal(snapshot.escapeEvaluationEvidence.historyStatus, 'captured');
raw.historyContext.racers[0].byCourse[1].wins = 0;
pred.aiCore.racerSkillTheory.roles[0].score = 0;
assert.equal(snapshot.escapeEvaluationEvidence.historyContext.racers[0].byCourse[1].wins, 7);
assert.equal(snapshot.escapeEvaluationEvidence.racerSkillTheory.roles[0].score, 80);
assert.equal(conditions.capture({}, {}).escapeEvaluationEvidence.historyStatus, 'unavailable');
assert.equal(snapshot.escapeEvaluationEvidence.affectsPrediction, false);
console.log('escape main audit and immutable evidence tests passed');
