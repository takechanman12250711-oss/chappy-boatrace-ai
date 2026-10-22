'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const gate = require('../js/wake-crossing-head-gate.js');
const pit = require('../scripts/wake-crossing-point-in-time-history.cjs');
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
assert.equal(gate.swapToSecond('4-1-2'), '1-4-2');
const c = gate.evaluateRecord(withRoles(f.prediction(1), baseRoles(), ['4-1-2', '1-4-2', '4-2-1', '2-1-3']));
assert.deepEqual(c.bTickets, ['1-4-2', '2-1-3']);
assert.deepEqual(c.cTickets, ['1-4-2', '2-1-3', '2-4-1'], 'C案は2着へ回した券を重複なしで追加');
const c2 = gate.evaluateRecord(withRoles(f.prediction(1), baseRoles(), ['4-6-1', '6-4-2', '1-2-3']));
assert.deepEqual(c2.cTickets, ['1-2-3'], '入れ替え後の頭が別の降格艇なら追加しない');
const c3 = gate.evaluateRecord(withRoles(f.prediction(1), baseRoles(), ['4-6-1']));
assert.deepEqual(c3.cTickets, [], '2着の艇が頭にいなくても降格判定なら頭に上げない');

// --- 当日以前の結果だけで再構築する ---
function histRace(date, raceNo, entries, winningMethod) {
  // entries: [{boat, course, registerNo, rank}]
  return { source: 'boatrace-official', resultAvailable: true, date, jcd: '01', raceNo, winningMethod,
    starts: entries.map(e => ({ boat: e.boat, course: e.course })),
    finishers: entries.map(e => ({ boat: e.boat, rank: e.rank, registerNo: e.registerNo })) };
}
f.withArchive(root => {
  const resultsDir = path.join(root, 'data/results');
  const write = (date, races) => fs.writeFileSync(path.join(resultsDir, `${date}.json`), JSON.stringify({ source: 'boatrace-official', date, races }));
  // 9999番: 4コースで差し1回(2023-09-01)・まくり差し1回(2026-09-30)・当日(2026-10-03)まくり差し1回
  write('20230901', [histRace('20230901', 1, [{ boat: 4, course: 4, registerNo: '9999', rank: 1 }, { boat: 1, course: 1, registerNo: '1111', rank: 2 }], '差し')]);
  write('20230930', [histRace('20230930', 1, [{ boat: 4, course: 4, registerNo: '9999', rank: 1 }], 'まくり差し')]);
  write('20260930', [histRace('20260930', 1, [{ boat: 4, course: 4, registerNo: '9999', rank: 1 }, { boat: 3, course: 4, registerNo: '8888', rank: 3 }], 'まくり差し')]);
  write('20261003', [histRace('20261003', 9, [{ boat: 4, course: 4, registerNo: '9999', rank: 1 }], 'まくり差し')]);
  const index = pit.buildIndex(resultsDir);
  const h = pit.historyAsOf(index, '9999', 4, '20261003');
  // 1095日窓: 2026-10-03の前日(10-02)から1094日前=2023-10-04以降。2023-09-01/09-30は窓外、当日は除外。
  assert.deepEqual(h, { starts: 1, wins: 1, winningMethods: [{ key: 'まくり差し', count: 1 }] });
  assert.equal(pit.historyAsOf(index, '9999', 4, '20231001').starts, 2);
  assert.equal(pit.historyAsOf(index, '8888', 4, '20261003').wins, 0);
  fs.writeFileSync(path.join(resultsDir, '20240101.json'), '{"source":"boatrace-official","races":[');
  assert.throws(() => pit.buildIndex(resultsDir), /results file unreadable/, '壊れた結果ファイルは失敗させる');
});

// --- 欠け日の扱い（感度分析用の窓） ---
f.withArchive(root => {
  const resultsDir = path.join(root, 'data/results');
  for (let d = 1; d <= 10; d++) {
    if (d === 5) continue; // 2026-01-05 は結果ファイルなし
    const date = `202601${String(d).padStart(2, '0')}`;
    const races = [histRace(date, 1, [{ boat: 2, course: 2, registerNo: '5555', rank: 1 }], '差し')];
    if (d === 8) races.push({ source: 'boatrace-official', resultAvailable: false, date, jcd: '02', raceNo: 1 });
    fs.writeFileSync(path.join(resultsDir, `${date}.json`), JSON.stringify({ source: 'boatrace-official', date, races }));
  }
  const index = pit.buildIndex(resultsDir);
  assert.equal(pit.historyAsOf(index, '5555', 2, '20260111').wins, 9);
  assert.equal(pit.historyAsOf(index, '5555', 2, '20260111', { gapFree: true }).wins, 5, '欠け日の翌日(01-06)以降だけ');
  const full = pit.windowCoverage(index, '20260111');
  assert.equal(full.days, 1095); assert.equal(full.missingDays, 1095 - 9); assert.equal(full.unavailableRaces, 1);
  assert.deepEqual(pit.windowCoverage(index, '20260111', { gapFree: true }), { days: 5, missingDays: 0, unavailableRaces: 1 });
});

// --- レポート ---
f.withArchive(root => {
  const resultsDir = path.join(root, 'data/results');
  const r1 = withRoles(f.prediction(1), baseRoles(), ['4-1-2', '4-2-1', '1-4-2', '2-1-3']); // 4号艇頭が降格
  const r2 = withRoles(f.prediction(2), baseRoles(), ['6-1-2']);                           // 全券降格 → B見送り
  const r3 = withRoles(f.prediction(3), baseRoles(), ['1-2-3', '3-1-2']);                   // 変更なし
  const r4 = withRoles(f.prediction(4), baseRoles(), ['5-1-2']);                            // 判定保留は残す
  const r6 = withRoles(f.prediction(6), baseRoles(), ['4-1-2']);
  r6.selectedAt = r6.deadlineAt;                                                             // 締切後保存は対象外
  // r5: 保存rolesなし → 結果原本から再構築（holdout）。4号艇=7777はまくり3勝のみで降格。
  const r5 = f.prediction(5);
  r5.prediction.practicalTickets = ['4-1-2', '1-2-3'];
  r5.prediction.preRaceConditions.boats = [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, course: boatNo, courseOfficial: true, registerNo: `700${boatNo}` }));
  r5.prediction.preRaceConditions.boats[3].registerNo = '7777';
  const records = [r1, r2, r3, r4, r5, r6];
  const races = [
    f.official(r1, '1-4-2', 1500), f.official(r2, '1-6-2', 3000), f.official(r3, '3-1-2', 2000),
    f.official(r4, '5-1-2', 9000), f.official(r5, '1-4-2', 800), f.official(r6, '4-1-2', 700)
  ];
  f.saveDay(root, '20261003', records, [], races);
  const history = Array.from({ length: 14 }, (_, i) => histRace('20260901', i + 1,
    [{ boat: 4, course: 4, registerNo: '7777', rank: i < 3 ? 1 : 4 }], i < 3 ? 'まくり' : '逃げ'));
  fs.writeFileSync(path.join(resultsDir, '20260901.json'), JSON.stringify({ source: 'boatrace-official', date: '20260901', races: history }));

  const r = f.parity(mod, root);
  assert.equal(r.productionChanged, false);
  assert.equal(r.automaticApplication, false);
  assert.equal(r.usableForPrediction, false);
  assert.equal(r.cohort.excludedPredictionCount, 1);
  assert.equal(r.counts.settled, 5);
  assert.equal(r.counts.basisValid, 5, JSON.stringify(r.counts));
  assert.deepEqual(r.counts.rolesSource, { saved: 4, pointInTime: 1 });
  assert.deepEqual(r.counts.pointInTimeCourseMapping, { 'official-exhibition-course': 1 });

  const ex = r.periods.explored, ho = r.periods.holdout;
  assert.equal(ex.counts.changed, 2);
  // A: r1(4券,的中1500) r2(1券) r3(2券,的中2000) r4(1券,的中9000)
  assert.equal(ex.ledgers.allA.tickets, 8); assert.equal(ex.ledgers.allA.returnYen, 12500);
  assert.equal(ex.ledgers.allB.tickets, 5); assert.equal(ex.ledgers.allB.skippedRaces, 1);
  // C: r1は1-4-2,2-1-3,2-4-1（4-1-2→1-4-2は重複のため追加しない）、r2は1-6-2で的中3000
  assert.equal(ex.ledgers.changedC.returnYen, 4500);
  assert.equal(ex.ledgers.changedC.tickets, 4);
  assert.equal(ex.headOutcomes.demote.count, 2);
  assert.equal(ex.headOutcomes.demote.seconds, 2);

  assert.equal(ho.counts.races, 1); assert.equal(ho.counts.changed, 1);
  assert.equal(ho.ledgers.allA.returnYen, 0);
  assert.deepEqual(r.rows.find(row => row.period === 'holdout').cTickets, ['1-2-3', '1-4-2']);
  assert.equal(ho.ledgers.allC.returnYen, 800);
  assert.equal(r.readiness, 'collecting');
  assert.ok(r.pointInTimeAgreement.total >= 0);
  assert.ok(r.sensitivity.gapFreeWindow.periods.holdout.counts.races <= 1);
  assert.equal(r.historyCoverage.fullWindow.races, 5);
});

// --- 前向き検証（2026-10-23以降） ---
{
  assert.equal(mod.FORWARD.from, '20261023', '固定した当日（10-22）は固定前に保存された予想を含むため使わない');
  const starts = [1, 2, 3, 4, 5, 6].map(boat => ({ boat, course: boat, st: 0.15 }));
  const finishers = order => order.split('-').map((boat, i) => ({ rank: i + 1, boat: Number(boat) }));
  assert.equal(mod.unsettleableReason({ starts, finishers: finishers('1-2-3') }), '');
  assert.equal(mod.unsettleableReason({ starts: starts.slice(0, 5) }), 'refund-or-missing-start');
  assert.equal(mod.unsettleableReason({ starts: starts.map(s => s.boat === 3 ? { ...s, falseStart: true } : s) }), 'refund-or-missing-start');
  assert.equal(mod.unsettleableReason({ starts, finishers: [{ rank: 1, boat: 1 }, { rank: 2, boat: 2 }, { rank: 2, boat: 3 }] }), 'top-three-dead-heat');

  const ledger = (stakeYen, returnYen) => ({ stakeYen, returnYen });
  const period = (changed, a, b, demote, qualified) => ({
    counts: { changed },
    ledgers: { allA: a, allB: b },
    headOutcomes: { demote, qualified }
  });
  assert.equal(mod.forwardVerdict(period(149, ledger(100, 200), ledger(100, 300), { count: 10, wins: 0 }, { count: 10, wins: 5 })).status, 'collecting', '150R未満は判定しない');
  assert.equal(mod.forwardVerdict(period(150, ledger(1000, 900), ledger(800, 760), { count: 10, wins: 0 }, { count: 10, wins: 5 })).status, 'supports-b');
  assert.equal(mod.forwardVerdict(period(150, ledger(1000, 950), ledger(800, 760), { count: 10, wins: 0 }, { count: 10, wins: 5 })).status, 'does-not-support-b', '同じ回収率は支持しない');
  assert.equal(mod.forwardVerdict(period(150, ledger(1000, 900), ledger(800, 760), { count: 10, wins: 5 }, { count: 10, wins: 5 })).status, 'does-not-support-b', '降格対象が弱くなければ支持しない');

  f.withArchive(root => {
    const day = '20261023';
    const settled = (record, ticket, payout, extra = {}) => ({ ...f.official(record, ticket, payout), starts, finishers: finishers(ticket), ...extra });
    const a = withRoles(f.prediction(1, day), baseRoles(), ['4-1-2', '1-4-2']);   // 降格頭を除く → 1-4-2 的中
    const b = withRoles(f.prediction(2, day), baseRoles(), ['1-2-3']);            // 欠場あり → 除外
    const c = f.prediction(3, day);                                               // 保存判定なし → 除外（再構築しない）
    const d = withRoles(f.prediction(4, day), baseRoles(), ['1-2-3']);            // 3着同着 → 除外
    f.saveDay(root, day, [a, b, c, d], [], [
      settled(a, '1-4-2', 1500), settled(b, '1-2-3', 500, { starts: starts.slice(0, 5) }), settled(c, '1-2-3', 500),
      settled(d, '1-2-3', 500, { finishers: [{ rank: 1, boat: 1 }, { rank: 2, boat: 2 }, { rank: 3, boat: 3 }, { rank: 3, boat: 4 }] })
    ]);
    // 収集途中の日は日ごと除外し、実際に除外した日だけ記録する
    const e = withRoles(f.prediction(1, '20261024'), baseRoles(), ['1-2-3']);
    f.saveDay(root, '20261024', [e], [], [settled(e, '1-2-3', 900)]);
    const file = path.join(root, 'data/results/20261024.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), complete: false }));
    fs.writeFileSync(path.join(root, 'data/results/20261025.json'), JSON.stringify({ date: '20261025', complete: false, races: [] }));

    const r = f.parity(mod, root);
    const fw = r.periods.forward;
    assert.equal(fw.counts.races, 1);
    assert.equal(fw.counts.changed, 1);
    assert.equal(fw.ledgers.allA.tickets, 2);
    assert.equal(fw.ledgers.allB.tickets, 1);
    assert.equal(fw.ledgers.allB.returnYen, 1500);
    assert.equal(r.periods.explored.counts.races, 0, '前向き期間は explored に入れない');
    assert.equal(r.periods.holdout.counts.races, 0, '保存判定のない前向きレースを holdout に入れない');
    assert.deepEqual(r.forward.excluded.reasons, { 'refund-or-missing-start': 1, 'saved-roles-missing': 1, 'top-three-dead-heat': 1, 'incomplete-result-day': 1 });
    assert.deepEqual(r.forward.excluded.incompleteResultDays, ['20261024']);
    assert.equal(r.forward.verdict.status, 'collecting');
    assert.equal(r.rows.find(row => row.period === 'forward').bHit, true);
    assert.equal(r.usableForPrediction, false);
  });
}

console.log('wake crossing head gate v2: fixed rule, point-in-time history, A/B/C by period, projection parity passed');
