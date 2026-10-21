'use strict';
const assert = require('node:assert/strict');
const gate = require('../js/wake-crossing-head-gate.js');
const mod = require('../scripts/build-wake-crossing-head-gate-report.cjs');
const f = require('./helpers/report-input-fixture.cjs');

function role(boatNo, course, starts, methods) {
  const winningMethods = Object.entries(methods).map(([key, count]) => ({ key, count, rate: 0 }));
  const wins = winningMethods.reduce((sum, item) => sum + item.count, 0);
  return { boatNo, course, courseHistory: { all3Years: { starts, wins, winningMethods }, recent1Year: { starts: 1 } }, score: 50, reason: 'x' };
}
function withRoles(record, roles, tickets) {
  record.prediction.preRaceConditions.escapeEvaluationEvidence = { racerSkillTheory: { roles }, historyContext: { racers: [] } };
  record.prediction.practicalTickets = tickets.map(ticket => ({ ticket, category: '本線', reason: 'long text' }));
  return record;
}
const baseRoles = () => [
  role(1, 1, 100, { 逃げ: 50 }),
  role(2, 2, 60, { 差し: 3 }),
  role(3, 3, 60, { まくり差し: 1, 差し: 1 }),
  role(4, 4, 60, { まくり: 6 }),      // まくりだけ → 降格
  role(5, 5, 8, { 差し: 2 }),         // 走数不足 → 判定保留
  role(6, 6, 40, { まくり差し: 1 })   // 1勝だけ → 降格
];

// --- 単体判定 ---
const boats = baseRoles().map(gate.evaluateBoat);
assert.deepEqual(boats.map(b => b.status), ['exempt-inside', 'qualified', 'qualified', 'demote', 'insufficient-samples', 'demote']);
assert.equal(boats[3].makuriWins, 6); assert.equal(boats[3].wakeCrossingWins, 0);
assert.equal(gate.evaluateBoat({ boatNo: 2, course: 2 }).status, 'history-missing');
assert.equal(gate.normalizeTicket({ ticket: '4-1-2' }), '4-1-2');
assert.equal(gate.normalizeTicket('1-1-2'), '');

f.withArchive(root => {
  const r1 = withRoles(f.prediction(1), baseRoles(), ['4-1-2', '4-2-1', '1-4-2', '2-1-3']); // 4号艇頭が降格
  const r2 = withRoles(f.prediction(2), baseRoles(), ['6-1-2']);                           // 全券降格 → B見送り
  const r3 = withRoles(f.prediction(3), baseRoles(), ['1-2-3', '3-1-2']);                   // 変更なし
  const r4 = withRoles(f.prediction(4), baseRoles(), ['5-1-2']);                            // 判定保留は残す
  const r5 = f.prediction(5);                                                               // 根拠なし
  r5.prediction.practicalTickets = ['1-2-3'];
  const r6 = withRoles(f.prediction(6), baseRoles(), ['4-1-2']);
  r6.selectedAt = r6.deadlineAt;                                                             // 締切後保存は対象外
  const records = [r1, r2, r3, r4, r5, r6];
  const races = [
    f.official(r1, '1-4-2', 1500), f.official(r2, '1-6-2', 3000), f.official(r3, '3-1-2', 2000),
    f.official(r4, '5-1-2', 9000), f.official(r5, '1-2-3', 500), f.official(r6, '4-1-2', 700)
  ];
  f.saveDay(root, '20261003', records, [], races);
  const r = f.parity(mod, root);

  assert.equal(r.productionChanged, false);
  assert.equal(r.automaticApplication, false);
  assert.equal(r.usableForPrediction, false);
  assert.equal(r.cohort.excludedPredictionCount, 1);
  assert.equal(r.counts.settled, 5);
  assert.equal(r.counts.basisValid, 4);
  assert.deepEqual(r.counts.basisInvalid, { 'racer-skill-roles-missing': 1 });
  assert.equal(r.counts.changed, 2);
  assert.equal(r.counts.skippedByB, 1);

  // A: r1(4券,的中1500) r2(1券,外れ) r3(2券,的中2000) r4(1券,的中9000)
  assert.equal(r.ledgers.allA.tickets, 8); assert.equal(r.ledgers.allA.hitRaces, 3); assert.equal(r.ledgers.allA.returnYen, 12500);
  // B: r1は1-4-2,2-1-3の2券で的中、r2は見送り
  assert.equal(r.ledgers.allB.tickets, 5); assert.equal(r.ledgers.allB.skippedRaces, 1); assert.equal(r.ledgers.allB.returnYen, 12500);
  assert.equal(r.ledgers.changedA.stakeYen, 500); assert.equal(r.ledgers.changedB.stakeYen, 200);

  assert.equal(r.headOutcomes.demote.count, 2);               // r1の4号艇、r2の6号艇
  assert.equal(r.headOutcomes.demote.wins, 0);
  assert.equal(r.headOutcomes.demote.seconds, 2);              // どちらも2着 → ヒモ向き
  assert.equal(r.headOutcomes['insufficient-samples'].wins, 1);
  assert.equal(r.readiness, 'collecting');
  assert.deepEqual(r.rows.map(row => row.raceKey), ['20261003-20-1', '20261003-20-2']);
  assert.deepEqual(r.rows[0].bTickets, ['1-4-2', '2-1-3']);
  assert.equal(r.rows[0].demotedHeads[0].makuriWins, 6);
});

console.log('wake crossing head gate: fixed rule, A/B ledger, pre-deadline filter, projection parity passed');
