'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareNoteInput, attachTicketOdds } = require('./prepare-note-input');
const { auditNotePublication } = require('./note-publication-audit');
const { saveNoteDraftBundle } = require('./note-draft-bundle');
const { dispatchReadyNote } = require('./dispatch-ready-note');
global.ChappyPracticalSelection = { createPracticalSelection: p => p.practicalTickets };
const generator = require('../js/note-generator');

async function main() {
  const now = () => Date.parse('2030-09-14T05:39:38Z');
  const record = { date: '20300914', jcd: '02', raceNo: 9, raceKey: '20300914-02-9', place: '戸田',
    selectedAt: new Date(now()).toISOString(), deadlineAt: '2030-09-14T14:48:00+09:00' };
  const baseline = [{ ticket: '2-1-3', odds: 0, category: '本命' }, { ticket: '2-4-3', odds: 0, category: '本命' }];
  const prediction = { race: { date: record.date, stadiumName: record.place, raceNo: 9 }, confidence: 84,
    mainSheet: { honmei: { boatNo: 2, name: 'テスト選手', score: 84 },
      evaluations: [1,2,3,4,5,6].map(boatNo => ({ boatNo, name: 'テスト選手', score: 84 })), tickets: baseline },
    practicalTickets: baseline, raceFlow: { title: '2コース差し', summary: '2号艇の差しを中心に考える。' } };
  const original = JSON.stringify({ prediction, baseline });
  const response = { ok: true, source: 'boatrace-official', date: record.date, stadiumCode: '02', raceNo: 9,
    byTicket: { '2-1-3': 23.5, '2-4-3': 30, '6-5-4': 9999 } };
  const audit = input => auditNotePublication({ article: generator.generateArticle(input.prediction),
    record: { ...record, prediction: input.prediction }, baselinePracticalTickets: input.baseline, now: new Date(now()).toISOString() });
  assert.equal(audit({ prediction, baseline }).contentReady, false);
  const prepared = await prepareNoteInput({ prediction, baseline, record, now, fetchOdds: async query => {
    assert.deepEqual(query, { date: record.date, jcd: '02', rno: 9 }); return response;
  } });
  assert.equal(prepared.prediction.race.raceInfo.deadline, '14:48');
  assert.deepEqual(prepared.baseline.map(t => t.ticket), baseline.map(t => t.ticket));
  assert.deepEqual(prepared.baseline.map(t => t.odds), [23.5, 30]);
  assert.deepEqual(audit(prepared).issues, []);
  assert.equal(JSON.stringify({ prediction, baseline }), original, 'never mutate the selected source');
  // Strong-escape trimming excludes the main scenario by shared object identity.
  const escape = { type: 'escape', score: 95 };
  const scenarioGraph = { mainScenario: escape, scenarios: [escape, { type: 'sashi', score: 70 }] };
  const enrichedGraph = attachTicketOdds(scenarioGraph, response.byTicket);
  assert.equal(enrichedGraph.mainScenario, enrichedGraph.scenarios[0], 'odds clone must retain shared scenario identity');
  assert.notEqual(enrichedGraph.mainScenario, escape, 'source graph must remain independent');
  assert.equal(Math.max(...enrichedGraph.scenarios.filter(s => s !== enrichedGraph.mainScenario).map(s => s.score)), 70);
  const rescue = require('../js/three-course-escape-rescue-fixed5');
  const rescued = rescue.apply({ raceFlow: { title: '3コース攻め' } }, { status: 'selected', tickets: baseline });
  assert.equal(rescued.tickets.at(-1).ticket, '1-3-4');
  assert.equal(rescued.tickets.at(-1).odds, undefined, 'real rescue selector creates a new row before enrichment');
  const rescueBaseline = attachTicketOdds(rescued.tickets, { '2-1-3': 23.5, '1-3-4': 42.6 });
  const selectorBefore = global.ChappyPracticalSelection;
  try {
    global.ChappyPracticalSelection = { createPracticalSelection: () => { throw new Error('must_not_reselect_after_odds'); } };
    const article = generator.generateArticle(prepared.prediction, { practicalTickets: rescueBaseline });
    const rescueRecord = { ...record, prediction: { ...prepared.prediction, practicalTickets: rescueBaseline } };
    const payload = { article, record: rescueRecord, baselinePracticalTickets: rescueBaseline, now: new Date(now()).toISOString() };
    assert.deepEqual(article.practicalTickets.map(t => [t.ticket, t.odds]), [['2-1-3',23.5],['1-3-4',42.6]]);
    assert.match(article.paidText, /1-3-4.*42.6倍/);
    assert.deepEqual(auditNotePublication(payload).issues, [], 'frozen rescue snapshot passes unchanged strict audit');
    for (const invalid of [undefined, null, [], [rescueBaseline[0], rescueBaseline[0]], [{ ticket:'1-1-3', odds:2 }], [{ ticket:'1-2-3' }]]) {
      assert.throws(() => generator.generateArticle(prepared.prediction, { practicalTickets: invalid }), /note_practical_snapshot_invalid/);
    }
    const altered = structuredClone(payload); altered.article.practicalTickets[0].ticket = '6-5-4';
    assert.equal(auditNotePublication(altered).contentReady, false, 'explicit snapshot does not bypass independent audit');
  } finally { global.ChappyPracticalSelection = selectorBefore; }
  for (const bad of [{ ...response, raceNo: 10 }, { ...response, date: '20300913' }, { ...response, stadiumCode: '03' }]) {
    const result = await prepareNoteInput({ prediction, baseline, record, now, fetchOdds: async () => bad });
    assert.equal(result.oddsSnapshot.error, 'note_odds_identity_mismatch');
    assert.equal(audit(result).contentReady, false);
    assert.deepEqual(result.baseline.map(t => t.ticket), baseline.map(t => t.ticket));
  }
  const missing = await prepareNoteInput({ prediction, baseline, record, now, fetchOdds: async () => ({ ...response, byTicket: { '2-1-3': 23.5 } }) });
  assert.equal(audit(missing).contentReady, false);
  assert.equal(missing.baseline.length, 2);
  const failed = await prepareNoteInput({ prediction, baseline, record, now, fetchOdds: async () => { throw new Error('network_error'); } });
  assert.equal(failed.oddsSnapshot.error, 'network_error');
  await prepareNoteInput({ prediction, baseline, record, now: () => Date.parse(record.deadlineAt),
    fetchOdds: async () => { assert.fail('must not fetch odds after deadline'); } });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-pipeline-'));
  try {
    const saved = saveNoteDraftBundle({ article: generator.generateArticle(prepared.prediction),
      record: { ...record, prediction: prepared.prediction }, baselinePracticalTickets: prepared.baseline,
      oddsSnapshot: prepared.oddsSnapshot }, { rootDir: root });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, saved.path))).oddsSnapshot, prepared.oddsSnapshot);
    fs.mkdirSync(path.join(root, 'data/note-publish'), { recursive: true });
    const oldHandoff = path.join(root, 'data/note-publish/latest.json'); fs.writeFileSync(oldHandoff, 'old');
    const built = JSON.parse(execFileSync(process.execPath, ['-e',
      'console.log(JSON.stringify(require(process.argv[1]).buildLatestHandoff({write:false}).payload))',
      path.join(__dirname, 'build-note-publish-handoff.js')], { cwd: root, encoding: 'utf8' }));
    assert.equal(built.candidates[0].sourcePath, saved.path);
    assert.equal(fs.readFileSync(oldHandoff, 'utf8'), 'old');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }

  const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_REF: 'refs/heads/main', NOTE_CLAIM_TOKEN: 'test' };
  const calls = [];
  const payload = { sourcePath: 'data/note-drafts/20300914/verified.json', raceKey: record.raceKey };
  const options = { env, build: ({write}) => { assert.equal(write, false); return { payload: { candidates: [] } }; },
    prepare: async () => ({ ok: true, payload }), guard: () => {},
    git: args => { calls.push(['git', args]); return args[0] === 'diff' ? payload.sourcePath : ''; },
    request: async (url, args) => { calls.push(['dispatch', url]); assert.deepEqual(JSON.parse(args.body), { ref: 'main', inputs: { mode: 'publish' } }); return { status: 204 }; } };
  assert.equal((await dispatchReadyNote(options)).dispatched, true);
  assert.equal(calls.at(-2)[1][0], 'push');
  assert.equal(calls.at(-1)[0], 'dispatch');
  const commit = calls.find(c => c[0] === 'git' && c[1].includes('commit'))[1];
  assert.ok(commit.includes('--only'));
  assert.equal(commit.at(-1), payload.sourcePath);
  calls.length = 0;
  assert.equal((await dispatchReadyNote({ ...options, prepare: async () => ({ ok: false, reason: 'no_eligible_unclaimed_article' }) })).dispatched, false);
  assert.equal(calls.length, 0);
  await assert.rejects(dispatchReadyNote({ ...options, git: () => { throw new Error('push_failed'); } }), /push_failed/);
  assert.equal(calls.length, 0);
  await assert.rejects(dispatchReadyNote({ ...options, request: async () => ({ status: 403 }) }), /dispatch_failed_403/);
  await assert.rejects(dispatchReadyNote({ ...options, env: { ...env, GITHUB_REF: 'refs/heads/other' } }), /context_invalid/);
  let checks = 0;
  await assert.rejects(dispatchReadyNote({ ...options, guard: () => { if (++checks === 2) throw new Error('deadline_passed'); },
    request: async () => { assert.fail('must not dispatch stale persisted source'); } }), /deadline_passed/);
  console.log('note pipeline enrichment, immutable source, early persistence and dispatch tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
