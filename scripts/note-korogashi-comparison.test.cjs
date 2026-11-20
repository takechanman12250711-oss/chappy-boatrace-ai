'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const k = require('./note-korogashi-lifecycle.cjs');
const { compare, overview, renderOverview } = require('./note-korogashi-comparison.cjs');
const { receiptRow } = require('./note-marketing-content');
const { fixture: original } = require('./note-independent-monitor-fixture');
const clone = value => JSON.parse(JSON.stringify(value));
const time = hour => Date.parse(`2026-09-28T${hour}:00:00+09:00`);
const context = { runId: '123', runAttempt: '1', headSha: 'a'.repeat(40) };
function fixture(rno = 6, hour = 16, resultKind = 'hit') {
  const bundle = original(), now = time(hour), key = `20260928-15-${rno}`;
  bundle.record.raceKey = key; bundle.record.raceNo = rno; bundle.monitor.raceKey = key;
  bundle.record.selectedAt = bundle.capturedAt = bundle.monitor.confirmedAt = new Date(now - 180000).toISOString();
  bundle.record.exhibitionSnapshot.capturedAt = new Date(now - 240000).toISOString();
  bundle.record.deadlineAt = new Date(now + 600000).toISOString();
  const bytes = JSON.stringify(bundle), receipt = { version: 'note-publication-receipt-v1', price: 200,
    raceKey: key, articleSeries: 'escape', sourceSha256: k.hash(bytes),
    url: `https://note.com/great_robin3243/n/nabc${rno}`,
    publishedAt: new Date(now - 120000).toISOString(), verifiedAt: new Date(now - 60000).toISOString() };
  const presentation = require('./note-korogashi-presentation.cjs');
  receipt.publishedDisplayProof = require('./note-published-ticket-sections').sectionProof(
    presentation.paidTextFromSource(bundle, 'escape'), presentation.PRESENTATION_VERSION, { sourceSha256: receipt.sourceSha256 });
  const row = receiptRow(receipt, bytes, now), combination = resultKind === 'miss' ? '3-2-1' : '1-2-3';
  const result = { ok: true, source: 'boatrace-official', date: '20260928', jcd: '15', raceNo: rno,
    resultUrl: row.resultUrl, checkedAt: new Date(now + 1200000).toISOString(), resultAvailable: true,
    status: resultKind === 'void' ? 'void' : 'finished', void: resultKind === 'void',
    trifecta: { combination, payout: 1001 },
    finishers: combination.split('-').map((boat, index) => ({ rank: index + 1, boat: Number(boat) })), starts: [] };
  if (resultKind === 'review') result.refunds = [6];
  return { now, bytes, receipt, row, result };
}
function config(id = 'comparison-course') {
  return { version: 'note-korogashi-requests-v1', requests: [{ id, date: '20260928',
    firstPublicationKey: '20260928-15-6:escape', targetYen: 1000000, maxLegs: 3, selectionPolicy: k.POLICY }] };
}
function options(fixtures, now) {
  return { rows: fixtures.map(f => f.row), now, context,
    source: async row => { const f = fixtures.find(f => f.row.raceKey === row.raceKey); return { bytes: f.bytes, receipt: f.receipt }; },
    result: async key => fixtures.find(f => f.row.raceKey === key)?.result || null };
}
async function course({ count = 2, lastResult = 'hit', announcedLast = true, settledLast = true, lateLast = false, id = 'comparison-course' } = {}) {
  const fixtures = Array.from({ length: count }, (_, index) => fixture(6 + index, 16 + index, index === count - 1 ? lastResult : 'hit'));
  let state = k.initialState();
  for (let index = 0; index < fixtures.length; index++) {
    const f = fixtures[index], staged = await k.prepare(state, config(id), options(fixtures, f.now));
    assert.equal(staged.staged.length, 1);
    const seal = { id: 44 + index, digest: 'sha256:' + 'c'.repeat(64), name: 'note-korogashi-123-1',
      runId: '123', headSha: context.headSha, createdAt: new Date(f.now).toISOString(), confirmedAt: new Date(f.now + 1000).toISOString() };
    state = k.confirm(staged.state, staged.staged, seal, f.now + 1000);
    if (index === count - 1 && !announcedLast) {
      if (lateLast) state = k.announce(state, { url: 'https://note.com/great_robin3243/n/nabcdef', contentHash: 'f'.repeat(64) }, Date.parse(f.row.deadlineAt) - 120000);
      break;
    }
    state = k.announce(state, { url: 'https://note.com/great_robin3243/n/nabcdef', contentHash: 'f'.repeat(64) }, f.now + 2000);
    if (index === count - 1 && !settledLast) break;
    // Only past/current rows are offered during settlement. Future publication
    // evidence is never invented to build the synthetic course.
    state = (await k.prepare(state, config(id), options(fixtures.slice(0, index + 1), f.now + 1200000))).state;
  }
  k.validateState(state);
  return state;
}
test('same observed two-leg path reproduces full reinvestment and deterministic review-only evidence', async () => {
  const state = await course(), before = JSON.stringify(state), report = compare(state), row = report.courses[0];
  assert.equal(row.status, 'stopped_max_legs'); assert.equal(row.complete, true);
  assert.equal(row.initialYen, 2000); assert.equal(row.finalWealthYen, 50060);
  assert.equal(row.netBeforeFeesYen, 48060); assert.equal(row.observedLegCount, 2);
  assert.equal(row.legs[0].wealthYen, 10010); assert.equal(report.summary.completedCount, 1);
  assert.equal(report.stateHash, k.hash(state)); assert.equal(report.optionsHash, k.hash(report.options));
  for (const flag of ['automaticApplication', 'usableForPrediction', 'canPublish', 'purchaseExecuted']) assert.equal(report[flag], false);
  assert.equal(report.evidenceScope, 'hypothetical_observed_path'); assert.equal(report.articleFeesIncluded, false);
  assert.deepEqual(compare(state), report); assert.equal(JSON.stringify(state), before);
});
test('50 percent retention conserves whole-yen funds and retains every original ticket', async () => {
  const state = await course(), full = compare(state).courses[0], row = compare(state, { reserveBps: 5000 }).courses[0];
  assert.equal(row.finalWealthYen, 30035); assert.equal(row.reservedYen, 5000);
  assert.equal(row.legs[1].retainedYen, 5000); assert.equal(row.legs[1].remainderYen, 10);
  assert.deepEqual(row.legs[1].allocations.map(a => a.stakeYen), [2500, 2500]);
  assert.deepEqual(row.legs.map(l => l.allocations.map(a => a.ticket)), full.legs.map(l => l.allocations.map(a => a.ticket)));
  assert.equal(row.legs[1].stakeYen + row.legs[1].remainderYen + row.legs[1].retainedYen, row.legs[0].wealthYen);
  const missed = compare(await course({ lastResult: 'miss' }), { reserveBps: 5000 }).courses[0];
  assert.equal(missed.status, 'stopped_miss'); assert.equal(missed.finalWealthYen, 5010);
});
test('two-leg cap ignores a later observed winner; three-leg research uses only the same evidenced path', async () => {
  const state = await course({ count: 3 }), capped = compare(state).courses[0], three = compare(state, { maxLegs: 3 }).courses[0];
  assert.equal(capped.observedLegCount, 2); assert.equal(capped.finalWealthYen, 50060);
  assert.equal(three.observedLegCount, 3); assert.equal(three.status, 'stopped_max_legs');
  assert.equal(capped.legs.some(l => l.number === 3), false);
});
test('low-ticket cohort excludes the entire initial course without trimming or replacing a race', async () => {
  const state = await course(), report = compare(state, { maxInitialTickets: 1 }), row = report.courses[0];
  assert.equal(row.status, 'excluded_initial_ticket_count'); assert.equal(row.eligible, false);
  assert.deepEqual(row.legs, []); assert.equal(row.finalWealthYen, null); assert.equal(report.summary.excludedCount, 1);
  assert.equal(report.summary.completedReturnRatePct, null);
});
test('missing continuation, registration-only and late publication never become a completed alternative', async () => {
  for (const [setup, status, count] of [
    [{ count: 1 }, 'observed_path_ended', 1],
    [{ announcedLast: false }, 'unverified_publication', 1],
    [{ announcedLast: false, lateLast: true }, 'unverified_publication', 1],
    [{ settledLast: false }, 'waiting_result', 1]
  ]) {
    const report = compare(await course(setup)), row = report.courses[0];
    assert.equal(row.status, status); assert.equal(row.complete, false); assert.equal(row.observedLegCount, count);
    assert.equal(row.finalWealthYen, null); assert.equal(row.netBeforeFeesYen, null); assert.equal(row.returnRatePct, null);
    assert.equal(report.summary.completedCount, 0); assert.equal(report.summary.completedFinalWealthYen, null);
  }
  const notAnnounced = compare(await course({ count: 1, announcedLast: false })).courses[0];
  assert.equal(notAnnounced.status, 'no_announced_initial_leg'); assert.equal(notAnnounced.initialYen, null);
});
test('void/review/pending are unknown, not zero losses; known first miss stops without added capital', async () => {
  for (const resultKind of ['void', 'review']) {
    const row = compare(await course({ count: 1, lastResult: resultKind })).courses[0];
    assert.equal(row.status, `unresolved_${resultKind}`); assert.equal(row.complete, false);
    assert.equal(row.finalWealthYen, null); assert.equal(row.observedLegCount, 0);
  }
  const missed = compare(await course({ count: 1, lastResult: 'miss' })).courses[0];
  assert.equal(missed.status, 'stopped_miss'); assert.equal(missed.complete, true);
  assert.equal(missed.finalWealthYen, 0); assert.equal(missed.netBeforeFeesYen, -2000);
});
test('retention that cannot fund all tickets stops with funds conserved and no alternative race', async () => {
  const report = compare(await course(), { reserveBps: 10000 }), row = report.courses[0];
  assert.equal(row.status, 'stopped_insufficient_funds'); assert.equal(row.complete, true);
  assert.equal(row.finalWealthYen, 10010); assert.equal(row.reservedYen, 10000);
  assert.equal(row.observedLegCount, 1); assert.equal(row.legs.length, 1);
});
test('invalid options and tampered lifecycle history fail closed', async () => {
  const state = await course();
  for (const settings of [{ reserveBps: -1 }, { reserveBps: 10001 }, { reserveBps: 0.5 }, { maxLegs: 1 },
    { maxInitialTickets: 0 }, { maxInitialTickets: 11 }, { selectByOdds: true }]) assert.throws(() => compare(state, settings), /korogashi_comparison_/);
  const changed = clone(state); changed.plans['comparison-course'].events[0].data.leg.allocations[0].stakeYen += 100;
  assert.throws(() => compare(changed), /korogashi_event_hash/);
  assert.equal(compare(k.initialState()).summary.completedReturnRatePct, null);
});
test('CLI rejects missing, repeated and malformed arguments before touching a state file', () => {
  for (const args of [[], ['--input', 'unused', '--reserve-bps', '5.5'], ['--input', 'unused', '--input', 'again'], ['--other', 'unused']]) {
    const child = spawnSync(process.execPath, [require.resolve('./note-korogashi-comparison.cjs'), ...args], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /korogashi_comparison_/); assert.equal(child.stdout, '');
  }
});

test('affordability is determined before a later pending or void outcome; fundable policies remain unresolved', async () => {
  for (const setup of [{ settledLast: false }, { lastResult: 'void' }]) {
    const state = await course(setup), row = compare(state, { reserveBps: 10000 }).courses[0];
    assert.equal(row.status, 'stopped_insufficient_funds'); assert.equal(row.complete, true);
    assert.equal(row.finalWealthYen, 10010); assert.equal(row.reservedYen, 10000);
    assert.equal(row.observedLegCount, 1);
    const fundable = compare(state, { reserveBps: 5000 }).courses[0];
    assert.equal(fundable.complete, false); assert.equal(fundable.finalWealthYen, null);
    assert.equal(fundable.returnRatePct, null);
  }
});
test('overview compares only the same complete course intersection and exposes multi-leg evidence', async () => {
  const states = await Promise.all([
    course({ id: 'first-loss', count: 1, lastResult: 'miss' }),
    course({ id: 'two-hit', count: 2 }),
    course({ id: 'three-hit', count: 3 }),
    course({ id: 'one-hit', count: 1 })
  ]);
  const state = { ...k.initialState(), plans: Object.assign({}, ...states.map(s => s.plans)) };
  const before = JSON.stringify(state), report = overview(state);
  const baseline = compare(state, { maxLegs: 3 }), alternative = compare(state, { maxLegs: 2 });
  const pairedIds = ['first-loss', 'three-hit'];
  const expected = rows => rows.filter(row => pairedIds.includes(row.id)).reduce((sum, row) => sum + row.netBeforeFeesYen, 0);
  const two = report.variants.find(v => v.id === 'two_leg');
  assert.equal(report.courseCount, 4); assert.equal(report.observedMultiLegCount, 2);
  assert.equal(two.completedCount, 3); assert.equal(two.incompleteCount, 1); assert.equal(two.pairedCount, 2);
  assert.equal(two.pairedMultiLegCount, 1);
  assert.equal(two.baselineNetYen, expected(baseline.courses)); assert.equal(two.variantNetYen, expected(alternative.courses));
  assert.notEqual(two.variantNetYen, alternative.summary.completedNetBeforeFeesYen, 'unpaired two-hit completion is excluded from paired sums');
  assert.equal(report.variants.length, 4); assert.equal(JSON.stringify(state), before);
  const text = renderOverview(report);
  assert(text.includes('過去の観測経路を再計算・未使用期間の検証前・自動採用なし'));
  assert(text.includes('50%確保は比較用の固定条件'));
  assert(text.includes('2段目以降まで照合できた共通コース 1件'));
  assert(text.includes('同じレースを使う複数目標の結果は連動'));
  assert(text.includes('\n')); assert(!text.includes('\\n'));
  assert(!/https?:|[1-6]-[1-6]-[1-6]/.test(text));
  assert(!Object.hasOwn(report, 'courses')); assert.equal(report.canPublish, false);
});
test('first-leg losses alone are not evidence for later-leg policy differences; empty overview renders nothing', async () => {
  const state = await course({ count: 1, lastResult: 'miss' }), report = overview(state);
  for (const variant of report.variants) {
    assert.equal(variant.pairedCount, 1); assert.equal(variant.pairedMultiLegCount, 0);
    assert.equal(variant.observedMultiLegCount, 0);
  }
  assert(renderOverview(report).includes('2段目以降の方式の違いを判断するデータが不足'));
  assert.equal(renderOverview(overview(k.initialState())), '');
});
