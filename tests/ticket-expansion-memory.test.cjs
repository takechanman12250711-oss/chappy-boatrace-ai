'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const payout = require('../scripts/analyze-ticket-expansion-payout-v2.cjs');
const f = require('./helpers/report-input-fixture.cjs');
const modules = [base, payout];
const tickets = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
  if (new Set([a, b, c]).size === 3) tickets.push(`${a}-${b}-${c}`);
}
function record(raceNo = 1, date = '20261003') {
  const r = f.prediction(raceNo, date);
  r.prediction.practicalTickets = tickets.slice(0, 7);
  r.prediction.practicalSelection = { targetDecisions: [{ scenarioSummary: 'saved scenario',
    candidateDecisions: tickets.slice(7, 26).map((ticket, i) => ({ ticket, score: 100 - i })) }] };
  return r;
}
function parity(root) { return modules.map(mod => f.parity(mod, root)); }

// Every tier boundary, rank beyond 24, partial/empty pools, official eligibility,
// primary precedence and different v1/v2 payout contracts are kept intact.
f.withArchive(root => {
  const rows = Array.from({ length: 12 }, (_, i) => record(i + 1));
  const actuals = [tickets[0], tickets[7], tickets[12], tickets[18], tickets[24], tickets[0]];
  rows[5].prediction.practicalTickets = [tickets[0]];
  rows[5].prediction.practicalSelection = {};
  rows[6].prediction.practicalTickets = [];
  rows[6].prediction.practicalSelection = {};
  rows[7].selectedAt = rows[7].deadlineAt;
  const verification = f.clone(rows[10]);
  rows[10].isRetrospective = true;
  const results = rows.slice(0, 11).map((r, i) => f.official(r, actuals[i] || tickets[0], 0));
  results[0].trifectaPayout = 1200; results[0].trifecta.payout = 1200;
  results[1].payoff = '1,300円'; results[1].trifecta.payout = 5000;
  results[2].officialResult = { resultTicket: actuals[2], payout3t: '1,400円' };
  results[3].payouts = [{ type: 'win', payout: 999 }, { name: '3連単', amount: '1,500円' }];
  results[3].trifecta.payout = 7000;
  results[8].source = 'untrusted'; results[9].resultAvailable = false;
  f.saveDay(root, '20261003', rows, [verification], results);
  const [v1, v2] = parity(root);
  assert.deepEqual(v1.rows.map(r => r.raceKey), rows.slice(0, 6).map(r => r.raceKey));
  assert.equal(v1.diagnostics.canonicalPredictionCount, 12);
  assert.equal(v1.diagnostics.preDeadlinePredictionCount, 10);
  assert.equal(v1.diagnostics.settledJoinCount, 7);
  assert.equal(v1.diagnostics.candidatePoolRaceCount, 6);
  assert.equal(v1.diagnostics.insufficientPoolRaceCount, 1);
  assert.deepEqual(Object.values(v1.tiers).map(t => t.hitCount), [2, 3, 4, 5]);
  assert.deepEqual(Object.values(v1.tiers).map(t => t.investmentYen), [3600, 6100, 9100, 12100]);
  assert.deepEqual(Object.values(v1.tiers).map(t => t.returnYen), [1200, 2500, 3900, 5400]);
  assert.deepEqual(Object.values(v2.tiers).map(t => t.returnYen), [1200, 6200, 6200, 13200]);
  assert.deepEqual(Object.values(v2.tiers).map(t => t.incrementalRescueCountVsPrevious), [0, 1, 1, 1]);
  assert.deepEqual(Object.values(v2.tiers).map(t => t.incrementalReturnYenVsPrevious), [0, 5000, 0, 7000]);
  assert.equal(v1.diagnostics.payoutMissingHitCount, 4);
  assert.equal(v2.diagnostics.payoutMissingHitCount, 6);
  assert.equal(v2.diagnostics.payoutLookupRaceCount, 3);
  assert.equal(v2.rows[4].candidatePoolCount, 26);
  assert.equal(v2.rows[4].first24Candidates.length, 24);
  for (const report of [v1, v2]) for (const flag of ['productionChanged', 'automaticApplication', 'usableForPrediction']) assert.equal(report[flag], false);
});

// Alias/fallback and full saved source ordering are shared with four-stage's
// projection. Exercise them through both complete financial reports as well.
const changes = [
  r => { Object.assign(r, r.prediction); delete r.prediction; },
  ...[null, false, 0, '', [], {}].map(value => r => { r.preRaceConditions = r.prediction.preRaceConditions; r.practicalTickets = tickets.slice(0, 9); r.prediction = value; }),
  r => { r.practicalSelection = r.prediction.practicalSelection; delete r.prediction.practicalSelection; },
  r => { r.practicalTickets = [{ ticket: tickets[8], score: 999 }]; r.prediction.tickets = [{ boats: [6, 5, 4], effectiveScore: '88' }]; },
  r => { r.prediction.formations = Object.fromEntries(['main', 'mainline', 'cover', 'flow', 'hole'].map((key, i) => [key, [{ ticket: tickets[30 + i], selectionScore: 400 }]])); },
  r => { r.prediction.practicalSelection.targetDecisions[0].candidateDecisions = [{ ticket: { combination: tickets[8] }, priorityScore: null }, { combination: tickets[9], candidateScore: 80 }, { ticket: tickets[0], score: 100000 }]; },
  r => { r.prediction.practicalSelection.targetDecisions[0].bestCandidateTicket = { ticket: tickets[10], score: 200 }; r.prediction.practicalSelection.expansionSummary = { addedTickets: [{ ticket: tickets[11], score: 200, reason: 'saved reason' }] }; },
  r => { r.capturedAt = r.selectedAt; r.selectedAt = ''; },
  r => { r.prediction.preRaceConditions.sourceFetchedAt = r.deadlineAt; },
  r => { r.raceKey = '20261003-21-1'; }
];
for (const change of changes) f.withArchive(root => {
  const r = record(); change(r);
  const result = f.official(record(), tickets[8], 4800); result.payoffs = [{ betType: 'trifecta', payoff: '4,800' }];
  f.saveDay(root, '20261003', [r], [], [result]); parity(root);
});
f.withArchive(root => {
  const first = record(), last = record(); last.prediction.practicalTickets = [tickets[30]]; last.prediction.practicalSelection = {};
  f.saveDay(root, '20261003', [first, last], [first], [f.official(first, tickets[30], 2500)]);
  const reports = parity(root);
  for (const report of reports) assert.deepEqual(report.rows[0].finalProductionLikeTickets, [tickets[30]]);
  fs.writeFileSync(path.join(root, 'data/results/20261004.json'), '{malformed');
  // v2's all-results payout scan intentionally ignores malformed unrelated files.
  assert.equal(payout.payoutMap(path.join(root, 'data/results')).size, 1);
});

// The actual v2 entry point builds both report stages. Each daily file fits in
// 96 MiB, while retaining the 168 MiB of unused history must fail. No heap bump.
f.withArchive(root => {
  const days = 28, perDay = 6, payload = 'unused-snapshot-'.repeat(65536);
  for (let day = 1; day <= days; day++) {
    const date = `202610${String(day).padStart(2, '0')}`;
    const rows = Array.from({ length: perDay }, (_, i) => {
      const r = record(i + 1, date); r.prediction.unusedSnapshot = payload; return r;
    });
    f.saveDay(root, date, rows, [], rows.map(r => f.official(r, tickets[8], 1200)));
  }
  const src = `const mod = require(${JSON.stringify(path.resolve(__dirname, '../scripts/analyze-ticket-expansion-payout-v2.cjs'))});
    const options = { root: ${JSON.stringify(root)} };
    if (process.argv[1] === 'full') options.compactPredictionRecord = null;
    const r = mod.build(options);
    if (r.rows.length !== 168 || r.tiers[7].hitCount !== 0 || r.tiers[12].hitCount !== 168 || r.tiers[24].returnYen !== 201600 || r.diagnostics.payoutLookupRaceCount !== 168) throw Error('changed audit');
    process.stdout.write(JSON.stringify({ rows: r.rows.length }));`;
  const run = mode => spawnSync(process.execPath, ['--max-old-space-size=96', '-e', src, mode], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' }
  });
  const compact = run('compact');
  assert.equal(compact.error, undefined); assert.equal(compact.status, 0, compact.stderr);
  assert.deepEqual(JSON.parse(compact.stdout), { rows: 168 });
  const full = run('full');
  assert.equal(full.error, undefined); assert.notEqual(full.status, 0, 'negative control must detect retaining unused full history');
  assert.match(full.stderr, /heap out of memory|Reached heap limit|Allocation failed/i);
});
console.log('ticket expansion: full v1/v2 parity, tier/payout boundaries, canonical fallback, immutable input and 96 MiB negative control passed');
