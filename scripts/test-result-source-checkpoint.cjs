'use strict';

// All collector responses and Git remotes are local fixtures. This regression
// suite must never request live official results or modify the real repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mergeOfficialResults } = require('./collect-results.js');
const { acquire, validate, apply, guardPush, targetDates, validateResult, VERSION, RECEIPT } = require('./result-source-checkpoint.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'result-source-checkpoint-test-'));
const repository = 'fixture-owner/fixture-repository';
const anchorDate = '20261009';
const recentDates = ['20261007', '20261008', '20261009'];
const queuedDate = '20260909';
const resultPath = date => `data/results/${date}.json`;
const hash = content => createHash('sha256').update(content).digest('hex');
const git = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trimEnd();

function write(root, file, value) {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(value) + '\n');
}
function read(root, file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
function commit(root, message) {
  git(root, ['add', '.']);
  git(root, ['commit', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}
function race(date, raceNo, options = {}) {
  return {
    ok: true, source: 'boatrace-official', date,
    jcd: '03', place: '江戸川', raceNo,
    resultAvailable: false, ...options,
  };
}
function completedRace(date, raceNo, combination = '1-2-3', payout = 1230) {
  return race(date, raceNo, {
    resultAvailable: true,
    finishers: combination.split('-').map((boat, index) => ({ boat: Number(boat), rank: index + 1 })),
    trifecta: { combination, payout },
  });
}
function official(date, races = [completedRace(date, 1)], previous = null) {
  return mergeOfficialResults(previous, {
    schemaVersion: 1, source: 'boatrace-official', date,
    collectedAt: '2026-10-09T14:59:00.000Z',
    venues: [{ jcd: '03', place: '江戸川' }], races,
  });
}
function queue(entries = []) {
  return { version: 'result-repair-queue-v1', maxEntries: 5, entries };
}
function fixture(name, entries = []) {
  const root = path.join(temporaryRoot, name);
  const remote = path.join(temporaryRoot, name + '.git');
  fs.mkdirSync(root);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'checkpoint-test']);
  git(root, ['config', 'user.email', 'checkpoint-test@example.invalid']);
  for (const date of recentDates) write(root, resultPath(date), official(date));
  write(root, resultPath(queuedDate), official(queuedDate, [race(queuedDate, 1)]));
  write(root, 'config/result-repair-queue.json', queue(entries));
  write(root, 'data/predictions/20261009.json', { savedTickets: ['1-2-3'], generation: 'original' });
  write(root, 'data/note-drafts/original.json', { body: 'original note', generation: 'original' });
  write(root, 'scripts/collect-results.js', { implementation: 'original' });
  write(root, 'api/result.js', { implementation: 'original' });
  write(root, '.github/workflows/collect-results.yml', { implementation: 'original' });
  const sourceSha = commit(root, 'baseline');
  git(temporaryRoot, ['clone', '--bare', root, remote]);
  git(root, ['remote', 'add', 'origin', 'file://' + remote]);
  return { root, remote, sourceSha, output: path.join(temporaryRoot, name + '.json') };
}

function context(f, extra = {}) {
  return { repository, runId: '123456', runAttempt: '2', sourceSha: f.sourceSha,
    anchorDate, artifactId: '654321', ...extra };
}
function reset(f) {
  git(f.root, ['reset', '--hard', f.sourceSha]);
  git(f.root, ['clean', '-fd']);
}
function capture(f, run = (script, args) => {
  assert.equal(script, 'collect-results.js');
  assert.equal(args.length, 1);
  const date = args[0].replace('--date=', '');
  write(f.root, resultPath(date), official(date, [completedRace(date, 1, '2-1-3', 1980)]));
}, extra = {}) {
  acquire({ root: f.root, context: context(f, extra), output: f.output, run });
  const bundle = JSON.parse(fs.readFileSync(f.output, 'utf8'));
  reset(f);
  return bundle;
}
function assertClean(f, message = 'rejection must not partially apply any result') {
  assert.equal(git(f.root, ['status', '--porcelain']), '', message);
}
function mutated(bundle, change) { const value = structuredClone(bundle); change(value); return value; }
function replaceContent(bundle, index, change) {
  const data = JSON.parse(bundle.files[index].content);
  change(data);
  bundle.files[index].content = JSON.stringify(data) + '\n';
  bundle.files[index].sha256 = hash(bundle.files[index].content);
}
function concurrentClone(f) {
  const other = f.root + '-concurrent';
  git(temporaryRoot, ['clone', 'file://' + f.remote, other]);
  git(other, ['config', 'user.name', 'concurrent-test']);
  git(other, ['config', 'user.email', 'concurrent-test@example.invalid']);
  return other;
}
function advanceRemote(f, other, file, value) {
  write(other, file, value);
  const sha = commit(other, 'concurrent remote update');
  git(other, ['push', 'origin', 'main']);
  git(f.root, ['fetch', '--no-tags', 'origin', 'main']);
  return sha;
}
function cli(f, command, env = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, 'result-source-checkpoint.cjs'), command, f.output], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env,
      GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '3',
      SOURCE_RUN_ATTEMPT: '2', SOURCE_SHA: f.sourceSha, SOURCE_DATE: anchorDate,
      SOURCE_ARTIFACT_ID: '654321', ...env,
    },
  });
}

try {
  // Recent correction refreshes are retained. Queue overlap is fetched only once
  // if complete, while disabled dates never enter the artifact or runner calls.
  const targets = fixture('target-dates', [
    { date: recentDates[1], enabled: true },
    { date: queuedDate, enabled: true },
    { date: '20260908', enabled: false },
  ]);
  assert.deepEqual(targetDates(targets.root, anchorDate).dates, [queuedDate, ...recentDates]);
  const calls = [];
  const targetBundle = capture(targets, (script, args) => {
    calls.push([script, args]);
    const date = args[0].slice('--date='.length);
    write(targets.root, resultPath(date), official(date));
  });
  assert.deepEqual(calls, [...recentDates, queuedDate].map(date => ['collect-results.js', [`--date=${date}`]]));
  assert.equal(targetBundle.version, VERSION);
  assert.deepEqual(targetBundle.files.map(file => file.date), [queuedDate, ...recentDates]);
  assert.deepEqual(Object.keys(targetBundle).sort(),
    ['version', 'repository', 'runId', 'runAttempt', 'sourceSha', 'anchorDate', 'createdAt', 'receiptBaseBlob', 'files'].sort());
  for (const file of targetBundle.files) {
    assert.equal(file.path, resultPath(file.date));
    assert.equal(file.sha256, hash(file.content));
    assert.equal(file.baseBlob, git(targets.root, ['rev-parse', `${targets.sourceSha}:${file.path}`]));
  }

  const dates = fixture('calendar-boundaries');
  assert.deepEqual(targetDates(dates.root, '20270101').recent, ['20261230', '20261231', '20270101']);
  assert.deepEqual(targetDates(dates.root, '20260301').recent, ['20260227', '20260228', '20260301']);
  assert.deepEqual(targetDates(dates.root, '20240301').recent, ['20240228', '20240229', '20240301']);
  assert.throws(() => targetDates(dates.root, '20260230'));
  const previousCollectDate = process.env.COLLECT_DATE;
  try {
    process.env.COLLECT_DATE = '20261010';
    const anchored = [];
    capture(dates, (script, args) => anchored.push(args[0]));
    assert.deepEqual(anchored, recentDates.map(date => `--date=${date}`),
      'writer delays or midnight crossover cannot replace the pinned acquisition date');
  } finally {
    if (previousCollectDate === undefined) delete process.env.COLLECT_DATE;
    else process.env.COLLECT_DATE = previousCollectDate;
  }

  const duplicateQueue = fixture('duplicate-queue', [
    { date: queuedDate, enabled: true }, { date: queuedDate, enabled: true },
  ]);
  let duplicateCalls = 0;
  assert.throws(() => acquire({ ...duplicateQueue, context: context(duplicateQueue),
    run() { duplicateCalls++; } }), /重複/);
  assert.equal(duplicateCalls, 0, 'invalid queue fails before collection');
  assert.equal(fs.existsSync(duplicateQueue.output), false);
  const invalidQueue = fixture('invalid-calendar-queue', [{ date: '20260230', enabled: true }]);
  assert.throws(() => targetDates(invalidQueue.root, anchorDate));

  const overlap = fixture('incomplete-overlap', [{ date: recentDates[0], enabled: true }]);
  const overlapCalls = [];
  capture(overlap, (script, args) => {
    const date = args[0].slice('--date='.length);
    overlapCalls.push(date);
    const attempts = overlapCalls.filter(value => value === date).length;
    write(overlap.root, resultPath(date), official(date,
      date === recentDates[0] && attempts === 1 ? [race(date, 1)] : [completedRace(date, 1)]));
  });
  assert.deepEqual(overlapCalls, [...recentDates, recentDates[0]],
    'an overlapping still-incomplete queued day retains its existing bounded retry');

  const failed = fixture('failed-acquisition');
  let failedCalls = 0;
  assert.throws(() => acquire({ ...failed, context: context(failed), run(script, args) {
    failedCalls++;
    if (failedCalls === 2) throw Error('fixture official network failure');
    const date = args[0].slice('--date='.length);
    write(failed.root, resultPath(date), official(date, [completedRace(date, 1, '3-2-1')]));
  } }), /fixture official network failure/);
  assert.equal(failedCalls, 2);
  assert.equal(fs.existsSync(failed.output), false, 'failed batch never produces a successful source artifact');
  assert.equal(fs.existsSync(path.join(failed.root, RECEIPT)), false);
  const incomplete = fixture('incomplete-queued-acquisition', [{ date: queuedDate, enabled: true }]);
  assert.throws(() => acquire({ ...incomplete, context: context(incomplete), run() {} }), /queued official result remains incomplete/);
  assert.equal(fs.existsSync(incomplete.output), false);
  const missingQueue = fixture('missing-queued-source', [{ date: '20260101', enabled: true }]);
  assert.throws(() => acquire({ ...missingQueue, context: context(missingQueue), run() {} }), /既存結果ファイルがない/);

  const unexpected = fixture('unexpected-acquisition-write');
  assert.throws(() => acquire({ ...unexpected, context: context(unexpected), run() {
    write(unexpected.root, 'data/predictions/20261009.json', { staleSnapshot: true });
  } }), /Unexpected acquisition changes/);
  assert.equal(fs.existsSync(unexpected.output), false);
  reset(unexpected);
  write(unexpected.root, 'data/note-drafts/original.json', { dirty: true });
  let dirtyCalls = 0;
  assert.throws(() => acquire({ ...unexpected, context: context(unexpected), run() { dirtyCalls++; } }), /clean and pinned/);
  assert.equal(dirtyCalls, 0);
  reset(unexpected);
  assert.throws(() => acquire({ ...unexpected, context: context(unexpected, { sourceSha: 'a'.repeat(40) }), run() {} }), /clean and pinned/);

  // Partial and failed rows remain distinct from complete or officially void
  // races. Corrected payouts/finish orders and preserved known outcomes cross
  // the handoff byte-for-byte; the handoff does not perform prediction learning.
  const semantics = fixture('official-semantics');
  const payloads = {
    [recentDates[0]]: official(recentDates[0], [
      completedRace(recentDates[0], 1),
      race(recentDates[0], 2),
      race(recentDates[0], 3, { ok: false, error: 'fixture temporary failure' }),
    ]),
    [recentDates[1]]: official(recentDates[1], [
      race(recentDates[1], 1, { status: 'void', void: true, trifecta: null,
        starts: Array.from({ length: 6 }, (_, index) => ({ boat: index + 1, falseStart: true })) }),
    ]),
    [recentDates[2]]: official(recentDates[2], [
      completedRace(recentDates[2], 1, '3-2-1', 9870),
      race(recentDates[2], 2, { ok: false, error: 'fixture retry failure' }),
    ], official(recentDates[2], [completedRace(recentDates[2], 1), completedRace(recentDates[2], 2)])),
  };
  const semanticBundle = capture(semantics, (script, args) => {
    const date = args[0].slice('--date='.length);
    write(semantics.root, resultPath(date), payloads[date]);
  });
  apply({ root: semantics.root, bundle: semanticBundle, context: context(semantics) });
  for (const date of recentDates) assert.deepEqual(read(semantics.root, resultPath(date)), payloads[date]);
  const partial = read(semantics.root, resultPath(recentDates[0]));
  assert.equal(partial.complete, false);
  assert.equal(partial.completedRaces, 1);
  assert.equal(partial.pendingRaces, 1);
  assert.equal(partial.failedRaces, 1);
  const voidResult = read(semantics.root, resultPath(recentDates[1]));
  assert.equal(voidResult.complete, true);
  assert.equal(voidResult.completedRaces, 0);
  assert.equal(voidResult.voidRaces, 1);
  assert.equal(voidResult.races[0].trifecta, null);
  const corrected = read(semantics.root, resultPath(recentDates[2]));
  assert.equal(corrected.races[0].trifecta.combination, '3-2-1');
  assert.equal(corrected.races[0].trifecta.payout, 9870);
  assert.equal(corrected.races[1].resultAvailable, true);
  assert.equal(corrected.races[1].error, undefined);

  const validation = fixture('artifact-validation');
  const validBundle = capture(validation);
  validate({ root: validation.root, bundle: validBundle, context: context(validation) });
  for (const [key, value] of Object.entries({ repository: 'other-owner/other-repository', runId: '123457',
    runAttempt: '3', sourceSha: 'b'.repeat(40), anchorDate: '20261010' })) {
    assert.throws(() => validate({ root: validation.root, bundle: validBundle,
      context: context(validation, { [key]: value }) }), /identity/, `${key} must match expected job identity`);
    assert.throws(() => validate({ root: validation.root, bundle: mutated(validBundle, b => { b[key] = value; }),
      context: context(validation) }), /identity/, `${key} cannot be altered in an artifact`);
  }
  for (const [label, change] of [
    ['version', b => { b.version = 'untrusted-version'; }],
    ['unknown field', b => { b.receipt = { forged: true }; }],
    ['invalid creation time', b => { b.createdAt = 'invalid'; }],
    ['missing receipt blob', b => { delete b.receiptBaseBlob; }],
    ['invalid receipt blob', b => { b.receiptBaseBlob = 'bad-blob'; }],
    ['missing date', b => { b.files.pop(); }],
    ['duplicate date', b => { b.files[1] = structuredClone(b.files[0]); }],
    ['extra date', b => { b.files.push(structuredClone(b.files[0])); }],
    ['path escape', b => { b.files[0].path = 'data/results/../../scripts/hacked.js'; }],
    ['prediction path', b => { b.files[0].path = 'data/predictions/20261007.json'; }],
    ['receipt path', b => { b.files[0].path = RECEIPT; }],
    ['date path mismatch', b => { b.files[0].path = resultPath(recentDates[1]); }],
    ['unknown date', b => { b.files[0].date = '20261006'; }],
    ['unknown file field', b => { b.files[0].mode = '120000'; }],
    ['invalid source blob', b => { b.files[0].baseBlob = 'not-a-git-blob'; }],
    ['missing source blob', b => { delete b.files[0].baseBlob; }],
    ['changed bytes', b => { b.files[0].content += ' '; }],
    ['changed hash', b => { b.files[0].sha256 = '0'.repeat(64); }],
    ['invalid JSON with matching hash', b => { b.files[0].content = 'invalid JSON'; b.files[0].sha256 = hash(b.files[0].content); }],
    ['wrong official source', b => replaceContent(b, 0, d => { d.source = 'unofficial'; })],
    ['wrong official date', b => replaceContent(b, 0, d => { d.date = recentDates[1]; })],
    ['wrong race source', b => replaceContent(b, 0, d => { d.races[0].source = 'unofficial'; })],
    ['wrong race date', b => replaceContent(b, 0, d => { d.races[0].date = recentDates[1]; })],
    ['duplicate race', b => replaceContent(b, 0, d => { d.races.push(d.races[0]); })],
    ['invalid venue', b => replaceContent(b, 0, d => { d.races[0].jcd = '25'; })],
    ['invalid race number', b => replaceContent(b, 0, d => { d.races[0].raceNo = 13; })],
    ['wrong totals', b => replaceContent(b, 0, d => { d.completedRaces = 99; })],
    ['false completion', b => replaceContent(b, 0, d => { d.complete = false; })],
  ]) {
    assert.throws(() => apply({ root: validation.root, bundle: mutated(validBundle, change),
      context: context(validation) }), undefined, label);
    assertClean(validation, label + ' must fail before any writes');
  }
  assert.throws(() => validateResult(JSON.stringify(official(anchorDate, [])), anchorDate), /Invalid official result/);
  for (const artifactId of [undefined, '', '0', '-1', '1.5', 'not-an-id']) {
    assert.throws(() => apply({ root: validation.root, bundle: validBundle,
      context: context(validation, { artifactId }) }), /context/);
  }
  for (const index of [0, validBundle.files.length - 1]) {
    assert.throws(() => apply({ root: validation.root,
      bundle: mutated(validBundle, b => { b.files[index].baseBlob = null; }), context: context(validation) }), /Incorrect source blob/);
    assertClean(validation, 'forged source blob must reject the whole batch before writes');
  }

  // Latest-main prediction, note, index, archive and unrelated result bytes are
  // not acquisition outputs. They survive a successful handoff exactly.
  const preserve = fixture('preserve-current-main');
  const preservedBundle = capture(preserve);
  const preservedFiles = [
    'data/predictions/20261009.json', 'data/note-drafts/original.json',
    'data/predictions/index.json', 'data/predictions/source-archives/20261009.meta.json',
    resultPath('20261006'), 'data/stats/unrelated-report.json',
  ];
  for (const file of preservedFiles) write(preserve.root, file, { newerMain: file });
  const latestSha = commit(preserve.root, 'new predictions notes indexes and unrelated results');
  const beforeBytes = Object.fromEntries(preservedFiles.map(file => [file, fs.readFileSync(path.join(preserve.root, file), 'utf8')]));
  const receipt = apply({ root: preserve.root, bundle: preservedBundle, context: context(preserve) });
  assert.equal(git(preserve.root, ['rev-parse', 'HEAD']), latestSha, 'apply does not reset or commit the caller branch');
  for (const file of preservedFiles) assert.equal(fs.readFileSync(path.join(preserve.root, file), 'utf8'), beforeBytes[file], file);
  const changed = git(preserve.root, ['status', '--porcelain', '--untracked-files=all']).split('\n').map(row => row.slice(3)).sort();
  assert.deepEqual(changed, [...recentDates.map(resultPath), RECEIPT].sort());
  assert.equal(receipt.appliedFromSha, latestSha);
  assert.equal(receipt.sourceSha, preserve.sourceSha);
  assert.equal(receipt.repository, repository);
  assert.equal(receipt.runId, '123456');
  assert.equal(receipt.runAttempt, '2');
  assert.equal(receipt.artifactId, '654321');
  assert.equal(receipt.anchorDate, anchorDate);
  assert.equal(receipt.fetchedAt, preservedBundle.createdAt);
  assert.deepEqual(receipt.files, preservedBundle.files.map(({ content, ...file }) => file));
  assert.deepEqual(read(preserve.root, RECEIPT), receipt);

  for (const [index, date] of recentDates.entries()) {
    const conflict = fixture(`newer-result-${index}`);
    const bundle = capture(conflict);
    write(conflict.root, resultPath(date), official(date, [completedRace(date, 1, '6-5-4', 9990)]));
    commit(conflict.root, 'newer official result');
    assert.throws(() => apply({ root: conflict.root, bundle, context: context(conflict) }), /Official result changed/);
    assertClean(conflict);
  }
  for (const [index, file] of [
    'scripts/collect-results.js', 'scripts/another-script.js', 'api/result.js',
    'js/shared-result-code.js', 'config/another-config.json', '.github/workflows/collect-results.yml',
  ].entries()) {
    const code = fixture(`code-conflict-${index}`);
    const bundle = capture(code);
    write(code.root, file, { changedAfterAcquisition: true });
    commit(code.root, 'collector or shared code changed');
    assert.throws(() => apply({ root: code.root, bundle, context: context(code) }), /Source code changed/);
    assertClean(code);
  }
  const receiptConflict = fixture('receipt-conflict');
  const receiptBundle = capture(receiptConflict);
  write(receiptConflict.root, RECEIPT, { newer: true });
  commit(receiptConflict.root, 'newer source receipt');
  assert.throws(() => apply({ root: receiptConflict.root, bundle: receiptBundle, context: context(receiptConflict) }), /Source receipt changed/);
  assertClean(receiptConflict);
  const previousReceipt = fixture('previous-receipt');
  write(previousReceipt.root, RECEIPT, { priorRun: true });
  previousReceipt.sourceSha = commit(previousReceipt.root, 'existing source receipt');
  const withReceipt = capture(previousReceipt);
  assert.equal(withReceipt.receiptBaseBlob, git(previousReceipt.root, ['rev-parse', `HEAD:${RECEIPT}`]));
  assert.throws(() => apply({ root: previousReceipt.root, bundle: mutated(withReceipt, b => { b.receiptBaseBlob = null; }),
    context: context(previousReceipt) }), /Source receipt changed/);
  assertClean(previousReceipt);
  apply({ root: previousReceipt.root, bundle: withReceipt, context: context(previousReceipt) });
  commit(previousReceipt.root, 'save source checkpoint');
  assert.throws(() => apply({ root: previousReceipt.root, bundle: withReceipt, context: context(previousReceipt) }), /Source receipt changed/,
    'an older acquisition cannot replay over a newer receipt');

  const newlyCreated = fixture('new-result-file');
  git(newlyCreated.root, ['rm', resultPath(recentDates[0])]);
  newlyCreated.sourceSha = commit(newlyCreated.root, 'day not yet collected');
  const newBundle = capture(newlyCreated);
  assert.equal(newBundle.files[0].baseBlob, null);
  apply({ root: newlyCreated.root, bundle: newBundle, context: context(newlyCreated) });
  assert.equal(read(newlyCreated.root, resultPath(recentDates[0])).races[0].trifecta.combination, '2-1-3');

  const dirtyPublisher = fixture('dirty-publisher');
  const dirtyBundle = capture(dirtyPublisher);
  write(dirtyPublisher.root, 'data/note-drafts/original.json', { unsavedUserWork: true });
  const dirtyStatus = git(dirtyPublisher.root, ['status', '--porcelain']);
  assert.throws(() => apply({ root: dirtyPublisher.root, bundle: dirtyBundle, context: context(dirtyPublisher) }), /must be clean/);
  assert.equal(git(dirtyPublisher.root, ['status', '--porcelain']), dirtyStatus);
  assert.equal(fs.existsSync(path.join(dirtyPublisher.root, RECEIPT)), false);

  // A failed-job rerun reuses the exact prior acquisition attempt and upload
  // ID. The current workflow attempt may advance, but identity is never guessed.
  const rerun = fixture('failed-job-rerun');
  capture(rerun);
  const rerunResult = cli(rerun, 'apply');
  assert.equal(rerunResult.status, 0, rerunResult.stderr);
  assert.equal(read(rerun.root, RECEIPT).runAttempt, '2');
  assert.equal(read(rerun.root, RECEIPT).artifactId, '654321');
  reset(rerun);
  for (const override of [
    { SOURCE_RUN_ATTEMPT: '' }, { SOURCE_RUN_ATTEMPT: '0' },
    { SOURCE_RUN_ATTEMPT: '2', GITHUB_RUN_ATTEMPT: '1' },
    { SOURCE_RUN_ATTEMPT: '3', GITHUB_RUN_ATTEMPT: '3' },
    { SOURCE_RUN_ATTEMPT: '1', GITHUB_RUN_ATTEMPT: '3' },
  ]) {
    const rejected = cli(rerun, 'apply', override);
    assert.notEqual(rejected.status, 0, JSON.stringify(override));
    assert.match(rejected.stderr, /Invalid acquisition attempt output|Invalid source checkpoint identity/);
    assertClean(rerun);
  }

  const push = fixture('guard-unrelated-main-update');
  const pushBundle = capture(push);
  apply({ root: push.root, bundle: pushBundle, context: context(push) });
  commit(push.root, 'locally save acquired official results');
  const other = concurrentClone(push);
  write(other, 'data/note-drafts/original.json', { newRemoteNote: true });
  const destinationSha = advanceRemote(push, other, 'data/predictions/20261009.json', { newRemotePrediction: true });
  const guarded = guardPush({ root: push.root, bundle: pushBundle, context: context(push) });
  assert.equal(guarded.checkedDestination, destinationSha);
  assertClean(push, 'guard is read-only even after local source commit');
  const guardedCli = cli(push, 'guard-push');
  assert.equal(guardedCli.status, 0, guardedCli.stderr);
  git(push.root, ['rebase', '--autostash', 'origin/main']);
  git(push.root, ['push', 'origin', 'main']);
  assert.deepEqual(JSON.parse(git(push.remote, ['show', 'main:data/predictions/20261009.json'])), { newRemotePrediction: true });
  assert.deepEqual(JSON.parse(git(push.remote, ['show', 'main:data/note-drafts/original.json'])), { newRemoteNote: true });
  for (const file of pushBundle.files)
    assert.equal(git(push.remote, ['show', `main:${file.path}`]), file.content.trimEnd());

  for (const [index, file, error] of [
    [0, resultPath(recentDates[2]), /Official result changed before push/],
    [1, 'scripts/collect-results.js', /Source code changed before push/],
    [2, RECEIPT, /Source receipt changed before push/],
  ]) {
    const conflict = fixture(`guard-remote-conflict-${index}`);
    const bundle = capture(conflict);
    apply({ root: conflict.root, bundle, context: context(conflict) });
    commit(conflict.root, 'save acquired source before racing push');
    const localHead = git(conflict.root, ['rev-parse', 'HEAD']);
    const concurrent = concurrentClone(conflict);
    const remoteHead = advanceRemote(conflict, concurrent, file,
      index === 0 ? official(recentDates[2], [completedRace(recentDates[2], 1, '6-5-4')]) : { remoteChanged: true });
    assert.throws(() => guardPush({ root: conflict.root, bundle, context: context(conflict) }), error);
    assert.equal(git(conflict.root, ['rev-parse', 'HEAD']), localHead);
    assert.equal(git(conflict.remote, ['rev-parse', 'main']), remoteHead);
    assertClean(conflict);
  }

  // Git can text-merge independent JSON fields successfully, but the official
  // source contract is whole-file immutable after acquisition, so reject it.
  const mergeable = fixture('guard-text-mergeable-result');
  const mergePath = resultPath(recentDates[2]);
  const original = read(mergeable.root, mergePath);
  fs.writeFileSync(path.join(mergeable.root, mergePath), JSON.stringify(original, null, 2) + '\n');
  mergeable.sourceSha = commit(mergeable.root, 'pretty JSON result source');
  git(mergeable.root, ['push', 'origin', 'main']);
  const originalText = fs.readFileSync(path.join(mergeable.root, mergePath), 'utf8');
  const mergeBundle = capture(mergeable, (script, args) => {
    const date = args[0].slice('--date='.length);
    if (date === recentDates[2]) {
      const result = read(mergeable.root, mergePath);
      result.races[0].trifecta.payout = 9870;
      fs.writeFileSync(path.join(mergeable.root, mergePath), JSON.stringify(result, null, 2) + '\n');
    }
  });
  apply({ root: mergeable.root, bundle: mergeBundle, context: context(mergeable) });
  commit(mergeable.root, 'acquired payout correction');
  const concurrent = concurrentClone(mergeable);
  const remoteResult = read(concurrent, mergePath);
  remoteResult.collectedAt = '2026-10-09T15:05:00.000Z';
  const remoteText = JSON.stringify(remoteResult, null, 2) + '\n';
  fs.writeFileSync(path.join(concurrent, mergePath), remoteText);
  commit(concurrent, 'concurrent official metadata correction');
  git(concurrent, ['push', 'origin', 'main']);
  git(mergeable.root, ['fetch', '--no-tags', 'origin', 'main']);
  const mergeInputs = ['ours', 'base', 'theirs'].map(name => path.join(temporaryRoot, `merge-input-${name}.json`));
  for (const [index, text] of [mergeBundle.files.find(file => file.path === mergePath).content, originalText, remoteText].entries())
    fs.writeFileSync(mergeInputs[index], text);
  const mergeResult = spawnSync('git', ['merge-file', '-p', ...mergeInputs], { encoding: 'utf8' });
  assert.equal(mergeResult.status, 0, 'fixture must truly be nonconflicting to Git text merge');
  assert.throws(() => guardPush({ root: mergeable.root, bundle: mergeBundle, context: context(mergeable) }), /Official result changed before push/);
  assertClean(mergeable);

  // The source SHA/date and exact upload ID connect acquisition to its writer.
  // No official HTTP collection may run inside the shared main writer queue.
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/collect-results.yml'), 'utf8');
  const jobText = workflow.split('\njobs:\n')[1];
  const jobs = Object.fromEntries([...jobText.matchAll(/^  ([a-z_]+):\n([\s\S]*?)(?=^  [a-z_]+:\n|$(?![\s\S]))/gm)]
    .map(match => [match[1], match[2]]));
  assert.ok(jobs.fetch_results && jobs.collect && jobs.diagnostics);
  assert.match(jobs.fetch_results, /needs: verify/);
  assert.match(jobs.fetch_results, /contents: read/);
  assert.match(jobs.fetch_results, /persist-credentials: false/);
  assert.doesNotMatch(jobs.fetch_results, /chappy-main-data-writers|contents: write|git (?:push|pull|commit)|restore-daily-prediction|match-predictions/);
  assert.ok(jobs.fetch_results.includes('source_sha: ${{ steps.source.outputs.sha }}'));
  assert.ok(jobs.fetch_results.includes('anchor_date: ${{ steps.source.outputs.date }}'));
  assert.ok(jobs.fetch_results.includes('run_attempt: ${{ steps.source.outputs.attempt }}'));
  assert.ok(jobs.fetch_results.includes('attempt=$GITHUB_RUN_ATTEMPT'));
  assert.ok(jobs.fetch_results.includes('artifact_id: ${{ steps.sources.outputs.artifact-id }}'));
  assert.ok(jobs.fetch_results.includes('sha=$(git rev-parse HEAD)'));
  assert.ok(jobs.fetch_results.includes('SOURCE_SHA: ${{ steps.source.outputs.sha }}'));
  assert.ok(jobs.fetch_results.includes('SOURCE_DATE: ${{ steps.source.outputs.date }}'));
  assert.match(jobs.fetch_results, /result-source-checkpoint\.cjs acquire/);
  assert.ok(jobs.fetch_results.includes('official-result-sources-${{ github.run_id }}-${{ github.run_attempt }}'));
  assert.match(jobs.fetch_results, /if-no-files-found: error/);
  assert.doesNotMatch(jobs.fetch_results, /github\.sha/);
  assert.match(jobs.collect, /needs: fetch_results/);
  assert.match(jobs.collect, /contents: write/);
  assert.match(jobs.collect, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
  const download = jobs.collect.split('- name: Download acquired official results')[1].split('\n      - name:')[0];
  assert.match(download, /actions\/download-artifact@v4/);
  assert.ok(download.includes('artifact-ids: ${{ needs.fetch_results.outputs.artifact_id }}'));
  assert.doesNotMatch(download, /^\s+(?:name|pattern|run-id):/m, 'source handoff must download the exact artifact ID');
  for (const [variable, output] of [['SOURCE_SHA', 'source_sha'], ['SOURCE_DATE', 'anchor_date'], ['SOURCE_RUN_ATTEMPT', 'run_attempt'], ['SOURCE_ARTIFACT_ID', 'artifact_id'], ['COLLECT_DATE', 'anchor_date']])
    assert.ok(jobs.collect.includes(`${variable}: \${{ needs.fetch_results.outputs.${output} }}`));
  assert.match(jobs.collect, /result-source-checkpoint\.cjs apply/);
  assert.match(jobs.collect, /repair-recent-results\.js --sources-only --match-only/);
  assert.doesNotMatch(jobs.collect, /node scripts\/collect-results\.js|node scripts\/repair-queued-results\.js|result-source-checkpoint\.cjs acquire/);
  assert.ok(jobs.collect.indexOf('result-source-checkpoint.cjs apply') < jobs.collect.indexOf('restore-daily-prediction-source.js'));
  assert.ok(jobs.collect.indexOf('repair-recent-results.js --sources-only --match-only') < jobs.collect.indexOf('prepare-daily-prediction-git-save.js'));
  assert.match(jobs.collect, /git add data\/results/);
  assert.match(jobs.collect, /git add data\/stats\/result-source-checkpoint\.json/);
  const retry = jobs.collect.slice(jobs.collect.indexOf('for attempt in 1 2 3; do'));
  assert.match(retry, /git fetch --no-tags origin main/);
  assert.match(retry, /result-source-checkpoint\.cjs guard-push/);
  assert.match(retry, /git rebase --autostash origin\/main/);
  assert.ok(retry.indexOf('git fetch') < retry.indexOf('guard-push'));
  assert.ok(retry.indexOf('guard-push') < retry.indexOf('git rebase'));
  assert.ok(retry.indexOf('git rebase') < retry.indexOf('git push'));
  assert.doesNotMatch(retry, /git pull|--force|--ours|--theirs/);
  assert.match(jobs.diagnostics, /ref: \$\{\{ needs.collect.outputs.saved_sha \}\}/);
  assert.equal((workflow.match(/group: chappy-main-data-writers/g) || []).length, 3);
  assert.equal((workflow.match(/contents: write/g) || []).length, 3);
  assert.match(jobs.verify, /node scripts\/test-result-source-checkpoint\.cjs/);
  console.log('official result source checkpoint: identity, dates, queue, semantics, concurrent data preservation, conflicts and writer/artifact boundaries passed');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
