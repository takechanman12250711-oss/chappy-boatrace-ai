'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
global.ChappyPracticalSelection = {
  createPracticalSelection: p => structuredClone(p.practicalTickets),
  select: p => ({ tickets: structuredClone(p.practicalTickets),
    candidateDecisions:[{ticket:'1-3-2',selected:false,reasonCode:'TEST_RECORDED_EXCLUSION'}] })
};
const generator = require('../js/note-generator');
const { auditNotePublication } = require('./note-publication-audit');
const { allRaceTargets, collectAllRaceNotes, existingRaces } = require('./collect-all-race-notes');
const { publishQueue } = require('./publish-note-queue');
const { publicationPayload } = require('./note-publication-source');
const { dispatchReadyNote } = require('./dispatch-ready-note');
const clock = Date.parse('2030-09-14T06:00:00Z');
const date = '20300914';
const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'all-race-notes-'));
function prediction(raceNo = 1) {
  return { date, race: { date, stadiumName: '唐津', raceNo, grade: 'G1', raceInfo: { deadline: '16:00' } },
    confidence: 35, dataQuality: { level: '低' },
    mainSheet: { honmei: { boatNo: 1, name: 'テスト選手', score: 45 },
      evaluations: [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo, name: 'テスト選手', score: 45 })),
      tickets: [{ ticket: '1-2-3', odds: 0 }] },
    practicalTickets: [{ ticket: '1-2-3', odds: 0, category: '本命' }],
    raceFlow: { title: 'イン逃げ本線', summary: '1号艇の逃げを中心に考える。' },
    officialHistory: { ready: true, venue: { usable: true, samples: 100,
      winningMethods: [{ key: '逃げ', rate: 60 }], payoutBands: { over10000: { rate: 20 } } } } };
}
const exhibition = () => ({ entries: [1,2,3,4,5,6].map(boat => ({ boat, exhibition: { displayTime: 6.8 } })),
  startExhibition: [1,2,3,4,5,6].map(boat => ({ boat, course: boat, st: 0.12, mappingSource: 'official-start-image' })) });
const generateArticle = (p, options) => generator.generateArticle(p, { ...options, publicationPolicy: 'all-races-v1' });
async function main() {
  const loadSchedule = async q => q.jcd ? { ok: true, date, selectedVenue: { jcd: q.jcd,
    races: Array.from({ length: 12 }, (_, i) => ({ raceNo: i + 1, selectable: true,
      deadlineAt: '2030-09-14T16:00:00+09:00' })) } }
    : { ok: true, date, venues: [{ jcd: '23', place: '唐津', eventGrade: 'G1' }, { jcd: '24', place: '大村' }], liveVenues: [] };
  assert.equal((await allRaceTargets(date, loadSchedule, clock)).targets.length, 24);
  assert.equal((await allRaceTargets(date, loadSchedule, clock)).targets[0].eventGrade, 'G1');
  assert.equal((await allRaceTargets(date, loadSchedule, clock + 3600000)).targets.length, 0);
  assert.equal(generator.generateArticle(prediction()).publishable, false, 'legacy strict mode remains unchanged');
  const article = generateArticle(prediction());
  assert.equal(article.publishable, true, 'low score/partial input is not a race coverage filter');
  assert.match(article.title, /唐津1R｜締切 16:00/);
  assert.equal(article.freeText, `🚤 9月14日 唐津1R｜締切 16:00\n\n${article.dataDisclosure}`);
  const base = { article, record: { publicationPolicy: 'all-races-v1', date, jcd: '23', place: '唐津', raceNo: 1,
    raceKey: `${date}-23-1`, deadlineAt: '2030-09-14T16:00:00+09:00', prediction: prediction() },
    baselinePracticalTickets: prediction().practicalTickets, now: new Date(clock).toISOString() };
  assert.deepEqual(auditNotePublication(base).issues, []);
  for (const change of [b => { delete b.record.publicationPolicy; },
    b => { b.article.freeText = b.article.freeText.replace(b.article.dataDisclosure, ''); },
    b => { b.baselinePracticalTickets[0].ticket = '1-3-2'; },
    b => { b.article.practicalTickets[0].odds = 99; },
    b => { b.record.deadlineAt = new Date(clock).toISOString(); }]) {
    const altered = structuredClone(base); change(altered);
    assert.equal(auditNotePublication(altered).contentReady, false);
  }
  const evaluate = async targets => ({ comparison: targets.map(t => ({ ...t, score: 0, selectionReady: false,
    rawRaceData: exhibition(), raceData: { ...prediction(t.raceNo), race: { ...prediction(t.raceNo).race, stadiumName: t.place } } })), attempts: [] });
  const args = { date, rootDir, now: () => clock, loadSchedule, evaluate,
    createPrediction: p => ({ ...structuredClone(p), formations: { cover: ['6-5-4'] } }), createPracticalSelection: p => p.practicalTickets,
    generateArticle: (p, options) => {
      assert.deepEqual(options?.practicalTickets, p.practicalTickets, 'collector must pass the independently enriched selection');
      return generateArticle(p, options);
    }, compactPrediction: (p, tickets) => ({ ...p, practicalTickets: tickets }),
    fetchOdds: async () => { throw new Error('odds_not_available'); } };
  const waiting = await collectAllRaceNotes({ ...args,
    evaluate: async targets => { const output = await evaluate(targets); output.comparison.forEach(r => { r.rawRaceData.startExhibition = []; }); return output; },
    createPrediction: () => { throw new Error('must wait for exhibition'); } });
  assert.equal(waiting.waitingExhibition, 24);
  assert.equal(waiting.generated, 0);
  let batches = 0;
  const result = await collectAllRaceNotes({ ...args, evaluate: async targets => {
    assert.ok(targets.length <= 3, 'bounded deadline batches');
    if (batches++) assert.ok(fs.readdirSync(path.join(rootDir,'data/outer-attack-sources',date)).length >= 3,
      'first evidence saved before fetching later batch');
    return evaluate(targets);
  }});
  assert.equal(result.saved, 24, JSON.stringify(result));
  const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-note-research-'));
  try {
    const blocked = await collectAllRaceNotes({ ...args, rootDir: blockedRoot,
      generateArticle: () => ({ publishable: false, error: 'test_audit_blocked' }) });
    assert.equal(blocked.saved, 0);
    assert.equal(fs.readdirSync(path.join(blockedRoot, 'data/outer-attack-sources', date)).length, 24,
      'all research snapshots survive a publication audit failure');
    assert.equal(fs.existsSync(path.join(blockedRoot, 'data/note-drafts')), false);
    const sourceDir = path.join(blockedRoot, 'data/outer-attack-sources', date);
    const source = JSON.parse(fs.readFileSync(path.join(sourceDir,fs.readdirSync(sourceDir)[0])));
    assert.equal(source.research.version,'outer-attack-all-scenarios-v1');
    assert.equal(source.record.practicalSelectionEvidence.status,'captured');
    assert.equal(source.record.practicalSelectionEvidence.candidateDecisions[0].reasonCode,'TEST_RECORDED_EXCLUSION');
  } finally { fs.rmSync(blockedRoot, { recursive: true, force: true }); }
  assert.equal(existingRaces(date, rootDir, clock).size, 24);
  assert.equal((await collectAllRaceNotes(args)).saved, 0, 'do not recreate immutable snapshots each cycle');
  assert.deepEqual(fs.readdirSync(path.join(rootDir, 'data')).sort(), ['note-drafts', 'outer-attack-sources', 'verification-coverage']);
  const file = fs.readdirSync(path.join(rootDir, 'data/note-drafts', date))[0];
  const savedBundle = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/note-drafts', date, file)));
  assert.equal(savedBundle.record.practicalSelectionEvidence.status,'captured');
  assert.equal(savedBundle.record.practicalSelectionEvidence.selectedAt,savedBundle.record.selectedAt);
  assert.deepEqual(savedBundle.record.practicalSelectionEvidence.practicalTickets,
    savedBundle.baselinePracticalTickets.map(t=>t.ticket));
  assert.equal(savedBundle.record.practicalSelectionEvidence.candidateDecisions[0].reasonCode,'TEST_RECORDED_EXCLUSION');
  assert.deepEqual(savedBundle.record.outerAttackShadow.a.entries.map(t => t.ticket).sort(),
    savedBundle.baselinePracticalTickets.map(t => t.ticket).sort(), 'A/B baseline must exclude raw formations');
  assert.equal(publicationPayload(`data/note-drafts/${date}/${file}`, rootDir, clock).price, 300);
  const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', NOTE_UI_MODE: 'publish', NOTE_CLAIM_TOKEN: 'test' };
  const sent = [], dispatch = [];
  const queue = await publishQueue({ env, now: () => clock,
    build: () => ({ payload: { candidates: Array.from({ length: 9 }, (_, i) => ({ raceKey: String(i) })) } }),
    prepare: async ({ handoff }) => handoff.candidates.length ? { ok: true, payload: handoff.candidates[0] } : { ok: false },
    publish: async ({ env: e }) => { const p = JSON.parse(fs.readFileSync(e.NOTE_IPHONE_HANDOFF)); sent.push(p.raceKey); return { raceKey: p.raceKey, url: 'verified-test' }; },
    request: async (...args) => { dispatch.push(args); return { status: 204 }; } });
  assert.equal(queue.published, 8); assert.equal(queue.continued, true);
  assert.equal(new Set(sent).size, 8); assert.equal(dispatch.length, 1);
  assert.deepEqual(JSON.parse(dispatch[0][1].body), { ref: 'main', inputs: { mode: 'publish' } });
  const sources = ['1', '2'].map((r, i) => `data/note-drafts/${date}/${date}-23-${r}-${String(i).repeat(64)}.json`);
  const gitCalls = [];
  await dispatchReadyNote({ env: { ...env, GITHUB_REF: 'refs/heads/main', NOTE_SOURCE_ISOLATED: 'true' },
    build: () => ({ payload: {} }), prepare: async () => ({ ok: true, payload: { raceKey: 'test', sourcePath: sources[0] } }),
    guard: () => {}, request: async () => ({ status: 204 }),
    git: args => { gitCalls.push(args); return args[0] === 'ls-files' || args[0] === 'diff' ? sources.join('\n') : ''; } });
  assert.deepEqual(gitCalls.find(args => args[0] === 'add').slice(2), sources);
  const commit = gitCalls.find(args => args.includes('commit'));
  assert.deepEqual(commit.slice(commit.indexOf('--') + 1), sources, 'persist every new source before dispatch');
  console.log('all 24 races covered without score/V2 filters; disclosure, immutable sources, gates and queue continuation passed');
}
main().finally(() => fs.rmSync(rootDir, { recursive: true, force: true })).catch(error => { console.error(error); process.exitCode = 1; });

