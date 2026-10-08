'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pack, apply, publish, validate, allowed, sha256 } = require('./result-report-checkpoint.cjs');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'result-checkpoint-test-'));
const report = 'data/stats/example-report.json';
const priority = 'data/stats/practical-priority-shadow-report.json';
function write(cwd, file, value) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), JSON.stringify(value) + '\n');
}
function commit(cwd, message) { git(cwd, ['add', '.']); git(cwd, ['commit', '-m', message]); return git(cwd, ['rev-parse', 'HEAD']); }
function fixture(name) {
  const work = path.join(root, name), remote = path.join(root, name + '.git');
  fs.mkdirSync(work); git(work, ['init', '-b', 'main']);
  git(work, ['config', 'user.name', 'test']); git(work, ['config', 'user.email', 'test@example.invalid']);
  write(work, report, { old: true }); write(work, priority, { old: true });
  write(work, 'data/predictions/20261005.json', { original: true });
  write(work, 'scripts/builder.js', { code: 1 });
  const baseSha = commit(work, 'base');
  git(root, ['clone', '--bare', work, remote]); git(work, ['remote', 'add', 'origin', 'file://' + remote]);
  write(work, report, { built: true }); write(work, priority, { built: true });
  const output = path.join(root, name + '.json');
  pack({ root: work, stage: 'diagnostics', output });
  const bundle = JSON.parse(fs.readFileSync(output));
  git(work, ['reset', '--hard', baseSha]);
  return { work, remote, baseSha, bundle, stage: 'diagnostics' };
}
const auditStages = [
  'local-water-strong-condition-cohort',
  'local-water-outer-head-candidate-ranking-audit',
  'outer-head-drop-stage-audit',
  'local-water-outer-head-stage-audit',
  'local-water-main-head-selection-audit',
  'local-water-result-breakdown',
];
function auditFixture(name, stage = auditStages[0], { unchanged = false, noReceipt = false } = {}) {
  const f = fixture(name);
  const auditReport = `data/stats/${stage}.json`;
  const receiptFile = `data/stats/audit-checkpoints/${stage}.json`;
  write(f.work, auditReport, { generation: 'old' });
  if (!noReceipt) write(f.work, receiptFile, { generation: 'previous' });
  const baseSha = commit(f.work, 'audit source');
  git(f.work, ['push', 'origin', 'main']);
  if (!unchanged) write(f.work, auditReport, { generation: 'built' });
  const output = path.join(root, name + '-audit.json');
  pack({ root: f.work, stage, output });
  const bundle = JSON.parse(fs.readFileSync(output));
  git(f.work, ['reset', '--hard', baseSha]);
  return { ...f, stage, baseSha, bundle, auditReport, receiptFile, output };
}
try {
  const f = fixture('new-prediction');
  write(f.work, 'data/predictions/20261005.json', { original: true, fresh: true });
  const liveSha = commit(f.work, 'live prediction'); git(f.work, ['push', 'origin', 'main']);
  git(f.work, ['sparse-checkout', 'set', 'scripts', 'data/stats', 'data/analysis']);
  const result = publish({ ...f, root: f.work });
  assert.equal(git(f.remote, ['rev-parse', 'main']), result.savedSha);
  assert.deepEqual(JSON.parse(git(f.remote, ['show', 'main:data/predictions/20261005.json'])), { original: true, fresh: true });
  assert.equal(JSON.parse(git(f.remote, ['show', 'main:' + report])).built, true);
  assert.equal(result.receipt.sourceSha, f.baseSha);
  assert.equal(result.receipt.publishedFromSha, liveSha);
  assert.equal(git(f.work, ['rev-parse', 'HEAD']), liveSha, 'publisher does not reset caller branch');

  const conflict = fixture('conflict');
  write(conflict.work, report, { newer: true }); commit(conflict.work, 'newer report');
  assert.throws(() => apply({ ...conflict, root: conflict.work }), /Report changed/);
  assert.equal(git(conflict.work, ['status', '--porcelain']), '', 'batch validation changes nothing on conflict');

  const preserve = fixture('preserve');
  write(preserve.work, priority, { newer: true }); commit(preserve.work, 'newer standalone report');
  const preserved = apply({ ...preserve, root: preserve.work });
  assert.equal(preserved.preservedNewer[0].path, priority);
  assert.equal(JSON.parse(fs.readFileSync(path.join(preserve.work, priority))).newer, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(preserve.work, report))).built, true);

  const code = fixture('code');
  write(code.work, 'scripts/builder.js', { code: 2 }); commit(code.work, 'new builder');
  assert.throws(() => apply({ ...code, root: code.work }), /Builder code changed/);
  const corrupt = structuredClone(code.bundle); corrupt.files[0].content = '{}';
  assert.throws(() => validate(corrupt, code), /Invalid checkpoint file/);
  const escape = structuredClone(code.bundle); escape.files[0].path = 'data/stats/../../scripts/hacked.js';
  assert.throws(() => validate(escape, code), /Invalid checkpoint file/);
  assert.throws(() => validate(code.bundle, { ...code, baseSha: 'a'.repeat(40) }), /identity/);
  const forged = structuredClone(code.bundle); forged.files[0].baseBlob = null;
  git(code.work, ['reset', '--hard', code.baseSha]);
  assert.throws(() => apply({ ...code, root: code.work, bundle: forged }), /Incorrect source blob/);

  write(code.work, 'data/predictions/index-shards/test.json', { snapshotDerived: true });
  const indexPack = path.join(root, 'index-only.json');
  pack({ root: code.work, stage: 'diagnostics', output: indexPack });
  assert.deepEqual(JSON.parse(fs.readFileSync(indexPack)).files, [], 'snapshot index is not published over live index');
  write(code.work, 'data/predictions/20261005.json', { changed: true });
  assert.throws(() => pack({ root: code.work, stage: 'diagnostics', output: path.join(root, 'invalid.json') }), /Unsaved source changes/);

  const race = fixture('push-race'); let attempts = 0;
  const pushed = publish({ ...race, root: race.work, beforePush({ attempt }) {
    attempts++;
    if (attempt === 1) {
      write(race.work, 'data/predictions/20261005.json', { arrivedDuringPush: true });
      commit(race.work, 'concurrent prediction'); git(race.work, ['push', 'origin', 'main']);
    }
  } });
  assert.equal(attempts, 2);
  assert.equal(git(race.remote, ['rev-parse', 'main']), pushed.savedSha);
  assert.equal(JSON.parse(git(race.remote, ['show', 'main:data/predictions/20261005.json'])).arrivedDuringPush, true);

  const raceConflict = fixture('push-conflict');
  assert.throws(() => publish({ ...raceConflict, root: raceConflict.work, beforePush({ attempt }) {
    if (attempt === 1) { write(raceConflict.work, report, { newest: true }); commit(raceConflict.work, 'conflicting report'); git(raceConflict.work, ['push', 'origin', 'main']); }
  } }), /Report changed/);
  assert.equal(JSON.parse(git(raceConflict.remote, ['show', 'main:' + report])).newest, true);
  assert.equal(git(raceConflict.work, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1, 'temporary worktrees cleaned');

  const calibrationPaths = ['data/predictions/calibration.json', 'data/predictions/improvement-review.json'];
  for (const file of calibrationPaths) {
    assert.equal(allowed(file, 'calibration'), true);
    assert.equal(allowed(file, 'diagnostics'), false);
    assert.equal(allowed(file), false, 'an unspecified stage cannot publish calibration reports');
  }
  const calibrated = fixture('calibration-derived');
  for (const file of calibrationPaths) write(calibrated.work, file, { generation: 'before' });
  const calibrationBase = commit(calibrated.work, 'existing derived calibration reports');
  git(calibrated.work, ['push', 'origin', 'main']);
  for (const file of calibrationPaths) write(calibrated.work, file, { generation: 'after', automaticApplication: false });
  const calibrationOutput = path.join(root, 'calibration.json');
  assert.throws(() => pack({ root: calibrated.work, stage: 'diagnostics', output: calibrationOutput }), /Unsaved source changes/);
  pack({ root: calibrated.work, stage: 'calibration', output: calibrationOutput });
  const calibrationBundle = JSON.parse(fs.readFileSync(calibrationOutput));
  assert.deepEqual(calibrationBundle.files.map(file => file.path), calibrationPaths);
  const calibrationArgs = { stage: 'calibration', baseSha: calibrationBase };
  validate(calibrationBundle, calibrationArgs);
  const wrongStage = { ...calibrationBundle, stage: 'diagnostics' };
  assert.throws(() => validate(wrongStage, { ...calibrationArgs, stage: 'diagnostics' }), /Invalid checkpoint file/);
  for (const forbidden of [
    'data/predictions/20261005.json', 'data/results/20261005.json',
    'data/predictions/other.json', 'data/predictions/improvement-reviews/example.json',
    'data/predictions/source-archives/20261005.meta.json'
  ]) {
    assert.equal(allowed(forbidden, 'calibration'), false, forbidden);
    const forgedPath = structuredClone(calibrationBundle);
    forgedPath.files[0].path = forbidden;
    assert.throws(() => validate(forgedPath, calibrationArgs), /Invalid checkpoint file/);
    write(calibrated.work, forbidden, { mustNotPublish: true });
    assert.throws(() => pack({ root: calibrated.work, stage: 'calibration', output: calibrationOutput }), /Unsaved source changes/);
    fs.rmSync(path.join(calibrated.work, forbidden));
    if (forbidden === 'data/predictions/20261005.json') git(calibrated.work, ['restore', '--', forbidden]);
  }
  const tamperedCalibration = structuredClone(calibrationBundle);
  tamperedCalibration.files[0].content = '{}';
  assert.throws(() => validate(tamperedCalibration, calibrationArgs), /Invalid checkpoint file/);
  git(calibrated.work, ['reset', '--hard', calibrationBase]);
  write(calibrated.work, calibrationPaths[0], { newer: true });
  commit(calibrated.work, 'newer calibration report');
  assert.throws(() => apply({ root: calibrated.work, bundle: calibrationBundle, ...calibrationArgs }), /Report changed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(calibrated.work, calibrationPaths[0]))).newer, true);
  git(calibrated.work, ['reset', '--hard', calibrationBase]);
  write(calibrated.work, 'data/predictions/20261005.json', { original: true, fresher: true });
  const newerOriginal = commit(calibrated.work, 'newer prediction remains untouched');
  git(calibrated.work, ['push', 'origin', 'main']);
  git(calibrated.work, ['sparse-checkout', 'set', 'scripts', 'data/stats', 'data/analysis']);
  assert.equal(fs.existsSync(path.join(calibrated.work, calibrationPaths[0])), false);
  const calibrationSaved = publish({ root: calibrated.work, bundle: calibrationBundle, ...calibrationArgs });
  assert.equal(calibrationSaved.receipt.publishedFromSha, newerOriginal);
  assert.deepEqual(calibrationSaved.receipt.files.map(file => file.path), calibrationPaths);
  for (const file of calibrationPaths)
    assert.deepEqual(JSON.parse(git(calibrated.remote, ['show', 'main:' + file])), { generation: 'after', automaticApplication: false });
  assert.equal(JSON.parse(git(calibrated.remote, ['show', 'main:data/predictions/20261005.json'])).fresher, true);
  assert.equal(git(calibrated.work, ['rev-parse', 'HEAD']), newerOriginal, 'sparse publisher preserves the caller');

  // Audit profiles are exact, single-report contracts. Existing diagnostics and
  // calibration fixtures above retain their original allowlists and behavior.
  for (const [index, stage] of auditStages.entries()) {
    const audit = auditFixture(`audit-profile-${index}`, stage, { noReceipt: index === 0 });
    assert.equal(audit.bundle.version, 'result-report-checkpoint-v1');
    assert.deepEqual(audit.bundle.files.map(file => file.path), [audit.auditReport]);
    assert.equal(audit.bundle.receiptBaseBlob, index === 0 ? null : git(audit.work, ['rev-parse', `HEAD:${audit.receiptFile}`]));
    const untouched = [
      'data/predictions/20261005.json', 'data/results/20261005.json',
      'data/predictions/source-archives/20261005.json.gz',
      'data/predictions/source-archives/20261005.meta.json',
      'data/predictions/index.json', 'data/predictions/index-shards/latest.json',
      'data/note-drafts/20261005.json', 'data/stats/unrelated-report.json',
      `data/stats/${auditStages[(index + 1) % auditStages.length]}.json`,
    ];
    for (const file of untouched) write(audit.work, file, { fresh: file });
    const freshSha = commit(audit.work, 'concurrent originals and unrelated reports');
    git(audit.work, ['push', 'origin', 'main']);
    const blobs = Object.fromEntries(untouched.map(file => [file, git(audit.work, ['rev-parse', `HEAD:${file}`])]));
    git(audit.work, ['sparse-checkout', 'set', 'scripts', 'data/stats']);
    const saved = publish({ ...audit, root: audit.work });
    assert.equal(saved.receipt.sourceSha, audit.baseSha);
    assert.equal(saved.receipt.publishedFromSha, freshSha);
    assert.deepEqual(saved.receipt.files.map(file => file.path), [audit.auditReport]);
    assert.deepEqual(git(audit.remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', saved.savedSha]).split('\n').sort(),
      [audit.auditReport, audit.receiptFile].sort(), 'publication touches exactly its own report and generated receipt');
    for (const file of untouched) assert.equal(git(audit.remote, ['rev-parse', `main:${file}`]), blobs[file], file);
    assert.equal(git(audit.work, ['rev-parse', 'HEAD']), freshSha, 'sparse caller stays untouched');
    assert.equal(git(audit.work, ['status', '--porcelain']), '');
    const receipt = JSON.parse(git(audit.remote, ['show', `main:${audit.receiptFile}`]));
    assert.equal(receipt.sourceSha, audit.baseSha);
    assert.equal(receipt.files[0].sha256, audit.bundle.files[0].sha256);
  }

  const audit = auditFixture('audit-validation');
  assert.throws(() => validate(audit.bundle, { ...audit, stage: auditStages[1] }), /identity/);
  assert.throws(() => validate(audit.bundle, { ...audit, baseSha: 'b'.repeat(40) }), /identity/);
  for (const forbidden of [
    `data/stats/${auditStages[1]}.json`, audit.receiptFile,
    'data/stats/result-diagnostics-checkpoint.json', 'data/stats/result-calibration-checkpoint.json',
    'data/stats/result-source-checkpoint.json', 'data/stats/practical-priority-shadow-report.json',
    'data/predictions/calibration.json', 'data/analysis/reference-tag-effectiveness.json',
    'data/stats/../../scripts/hacked.js',
  ]) {
    assert.equal(allowed(forbidden, audit.stage), false, forbidden);
    const forged = structuredClone(audit.bundle); forged.files[0].path = forbidden;
    assert.throws(() => validate(forged, audit), /Invalid checkpoint file/);
  }
  const duplicate = structuredClone(audit.bundle); duplicate.files.push(duplicate.files[0]);
  assert.throws(() => validate(duplicate, audit), /Invalid/);
  const empty = structuredClone(audit.bundle); empty.files = [];
  assert.throws(() => validate(empty, audit), /Invalid/);
  for (const mutate of [
    b => { b.files[0].content = '{}'; },
    b => { b.files[0].sha256 = '0'.repeat(64); },
    b => { b.files[0].baseBlob = 'not-a-blob'; },
    b => { b.receiptBaseBlob = 'not-a-blob'; },
    b => { delete b.receiptBaseBlob; },
    b => { b.receipt = { forged: true }; },
  ]) {
    const forged = structuredClone(audit.bundle); mutate(forged);
    assert.throws(() => validate(forged, audit), /Invalid/);
  }
  const invalidJson = structuredClone(audit.bundle);
  invalidJson.files[0].content = 'not JSON'; invalidJson.files[0].sha256 = sha256('not JSON');
  assert.throws(() => validate(invalidJson, audit), SyntaxError);
  for (const target of ['report', 'receipt']) {
    const forged = structuredClone(audit.bundle);
    if (target === 'report') forged.files[0].baseBlob = null; else forged.receiptBaseBlob = null;
    assert.throws(() => apply({ ...audit, root: audit.work, bundle: forged }), /Incorrect source/);
    assert.equal(git(audit.work, ['status', '--porcelain']), '', 'base-blob tampering fails before writes');
  }
  for (const [name, file, error] of [
    ['report', audit.auditReport, /Report changed/],
    ['receipt', audit.receiptFile, /Audit receipt changed/],
    ['workflow', `.github/workflows/check-${audit.stage}.yml`, /Builder code changed/],
    ['builder', 'scripts/builder.js', /Builder code changed/],
    ['config', 'config/example.json', /Builder code changed/],
  ]) {
    const conflict = auditFixture(`audit-newer-${name}`);
    write(conflict.work, file, { newer: true }); commit(conflict.work, `new ${name}`);
    assert.throws(() => apply({ ...conflict, root: conflict.work }), error);
    assert.equal(git(conflict.work, ['status', '--porcelain']), '', 'conflict leaves no partial writes');
  }
  const equal = auditFixture('audit-equal-report', auditStages[0], { unchanged: true });
  const equalSaved = publish({ ...equal, root: equal.work });
  assert.equal(git(equal.remote, ['rev-parse', `main:${equal.auditReport}`]), equal.bundle.files[0].baseBlob);
  assert.throws(() => publish({ ...equal, root: equal.work }), /Audit receipt changed/,
    'even byte-identical reports cannot replay an older source receipt');
  assert.equal(git(equal.remote, ['rev-parse', 'main']), equalSaved.savedSha);

  // Exercise the existing restore/prepare normalization on tiny archives, then
  // prove pack rejects remaining staged, unstaged and index-only source changes.
  const { archivePredictionSource } = require('./daily-prediction-source-archive');
  const { restorePredictionSources } = require('./restore-daily-prediction-source');
  const { preparePredictionGitSave } = require('./prepare-daily-prediction-git-save');
  const normalized = auditFixture('audit-normalized');
  const source = 'data/predictions/20261004.json';
  write(normalized.work, source, { predictions: [], savedEvidence: 'x'.repeat(1024) });
  archivePredictionSource({ rootDirectory: normalized.work, date: '20261004', rawSaveLimitBytes: 64 });
  write(normalized.work, source, { displaySummary: true });
  commit(normalized.work, 'archived source with compact daily display');
  restorePredictionSources({ rootDirectory: normalized.work, all: true });
  preparePredictionGitSave({ rootDirectory: normalized.work, all: true, rawSaveLimitBytes: 64 });
  assert.equal(git(normalized.work, ['status', '--porcelain']), '', 'normalization restores exact saved source bytes');
  pack({ root: normalized.work, stage: normalized.stage, output: normalized.output });
  const forbiddenChanges = [
    source, 'data/results/20261004.json',
    'data/predictions/source-archives/20261004.json.gz', 'data/predictions/source-archives/20261004.meta.json',
    'data/predictions/index.json', 'data/predictions/index-manifest.json', 'data/predictions/index-shards/current.json',
    'data/predictions/summaries/20261004.json', 'data/outer-attack-sources/example.json',
    'data/note-drafts/example.json', 'data/stats/another-report.json',
  ];
  for (const file of forbiddenChanges) {
    const absolute = path.join(normalized.work, file);
    const existed = fs.existsSync(absolute), original = existed ? fs.readFileSync(absolute) : null;
    for (const staged of [false, true]) {
      write(normalized.work, file, { mustNotPublish: true });
      if (staged) git(normalized.work, ['add', '--', file]);
      assert.throws(() => pack({ root: normalized.work, stage: normalized.stage, output: normalized.output }), /Unsaved source/);
      if (staged && existed) {
        fs.writeFileSync(absolute, original);
        assert.equal(git(normalized.work, ['diff', 'HEAD', '--', file]), '', 'staged change can cancel the worktree diff');
        assert.throws(() => pack({ root: normalized.work, stage: normalized.stage, output: normalized.output }), /Unsaved source/);
      }
      git(normalized.work, ['reset', '--', file]);
      if (existed) fs.writeFileSync(absolute, original); else fs.rmSync(absolute);
    }
  }
  assert.equal(git(normalized.work, ['status', '--porcelain']), '');

  const auditRace = auditFixture('audit-push-race'); let auditAttempts = 0;
  const auditRaceSaved = publish({ ...auditRace, root: auditRace.work, beforePush({ attempt }) {
    auditAttempts++;
    if (attempt === 1) {
      write(auditRace.work, 'data/results/20261005.json', { arrivedDuringPush: true });
      commit(auditRace.work, 'concurrent result'); git(auditRace.work, ['push', 'origin', 'main']);
    }
  } });
  assert.equal(auditAttempts, 2);
  assert.equal(git(auditRace.remote, ['rev-parse', 'main']), auditRaceSaved.savedSha);
  assert.equal(JSON.parse(git(auditRace.remote, ['show', 'main:data/results/20261005.json'])).arrivedDuringPush, true);
  for (const [name, destination, error] of [
    ['report', `data/stats/${auditStages[0]}.json`, /Report changed/],
    ['receipt', `data/stats/audit-checkpoints/${auditStages[0]}.json`, /Audit receipt changed/],
    ['code', `.github/workflows/check-${auditStages[0]}.yml`, /Builder code changed/],
  ]) {
    const race = auditFixture(`audit-push-${name}-race`); let attempts = 0, newer;
    assert.throws(() => publish({ ...race, root: race.work, beforePush() {
      attempts++;
      write(race.work, destination, { newer: true }); newer = commit(race.work, `newer ${name}`);
      git(race.work, ['push', 'origin', 'main']);
    } }), error);
    assert.equal(attempts, 1, 'relevant race stops on revalidation before another write');
    assert.equal(git(race.remote, ['rev-parse', 'main']), newer);
    assert.equal(git(race.work, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1);
  }

  const exhausted = auditFixture('audit-exhausted-race'); let exhaustedAttempts = 0;
  assert.throws(() => publish({ ...exhausted, root: exhausted.work, beforePush({ attempt }) {
    exhaustedAttempts++;
    write(exhausted.work, 'data/results/20261005.json', { concurrentAttempt: attempt });
    commit(exhausted.work, `concurrent result ${attempt}`); git(exhausted.work, ['push', 'origin', 'main']);
  } }));
  assert.equal(exhaustedAttempts, 3, 'unrelated racing writes never cause an unbounded push loop');
  assert.equal(JSON.parse(git(exhausted.remote, ['show', `main:${exhausted.auditReport}`])).generation, 'old');

  // Simulate a push accepted by the remote whose acknowledgement was lost.
  const lostAck = auditFixture('audit-lost-ack'); let lostAckAttempts = 0;
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const bin = path.join(root, 'lost-ack-bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\n'${realGit}' "$@"\nstatus=$?\nif [ "$1" = push ] && [ "$status" = 0 ]; then exit 1; fi\nexit "$status"\n`, { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = bin + path.delimiter + previousPath;
    const accepted = publish({ ...lostAck, root: lostAck.work, beforePush() { lostAckAttempts++; } });
    assert.equal(git(lostAck.remote, ['rev-parse', 'main']), accepted.savedSha);
    assert.equal(lostAckAttempts, 1, 'remote readback recognizes the accepted commit');
  } finally { process.env.PATH = previousPath; }

  for (const stage of auditStages) {
    const workflow = fs.readFileSync(`.github/workflows/check-${stage}.yml`, 'utf8');
    const [top, jobs] = workflow.split('\njobs:\n');
    const [compute, publisher] = jobs.split('\n  publish_reports:\n');
    assert.match(top, /permissions:\n  contents: read/);
    assert.ok(top.includes(`group: chappy-${stage}-`));
    assert.match(top, /queue: max\n\s+cancel-in-progress: false/);
    assert.match(compute, /diagnostics:\n    if: github.event_name != 'workflow_run' \|\|/);
    assert.match(compute, /github.event.workflow_run.conclusion == 'success'/);
    assert.doesNotMatch(top + compute, /chappy-main-data-writers|contents: write|git (push|pull|commit)/);
    assert.match(compute, /permissions:\n\s+contents: read/);
    assert.match(compute, /fetch-depth: 1\n\s+persist-credentials: false/);
    assert.ok(compute.includes('run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"'));
    assert.ok(compute.includes('source_sha: ${{ steps.source.outputs.sha }}'));
    assert.ok(compute.includes('artifact_id: ${{ steps.reports.outputs.artifact-id }}'));
    assert.ok(compute.includes(`name: ${stage}-` + '${{ github.run_id }}-${{ github.run_attempt }}'));
    assert.ok(compute.includes(`result-report-checkpoint.cjs pack ${stage} `));
    assert.match(compute, /if-no-files-found: error/);
    assert.doesNotMatch(compute, /github.sha/, 'workflow_run must use the actual checked-out source');
    const production = compute.split(/\n(?=      - )/).slice(1).filter(step =>
      step.includes(`node scripts/build-${stage}.js`) || step.includes('checkpoint.cjs pack') || step.includes('actions/upload-artifact@v4'));
    assert.equal(production.length, 3);
    for (const step of production) assert.match(step, /if: github.event_name != 'pull_request'/);
    assert.match(publisher, /needs: diagnostics\n\s+if: github.event_name != 'pull_request' && needs.diagnostics.result == 'success'/);
    assert.match(publisher, /contents: write/);
    assert.match(publisher, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
    assert.match(publisher, /fetch-depth: 1\n\s+sparse-checkout: \|\n\s+scripts\n\s+data\/stats/);
    assert.ok(publisher.includes('artifact-ids: ${{ needs.diagnostics.outputs.artifact_id }}'));
    assert.ok(publisher.includes('BASE_SHA: ${{ needs.diagnostics.outputs.source_sha }}'));
    assert.ok(publisher.includes(`result-report-checkpoint.cjs publish ${stage} "$RUNNER_TEMP/audit-report/checkpoint.json" "$BASE_SHA"`));
    assert.doesNotMatch(publisher, /node scripts\/build-|restore-daily|prepare-daily|git (push|pull|commit)/);
    assert.equal((workflow.match(/contents: write/g) || []).length, 1);
    assert.equal((workflow.match(/group: chappy-main-data-writers/g) || []).length, 1);
    assert.ok(compute.includes(`timeout-minutes: ${stage === 'local-water-result-breakdown' ? 12 : 360}`));
    assert.match(publisher, /timeout-minutes: 10/);
    if (stage === 'outer-head-drop-stage-audit') {
      assert.match(top, /workflow_run:\n\s+workflows: \["Collect official race results"\]\n\s+branches: \[main\]/);
      for (const gate of ["head_branch == 'main'", 'head_repository.full_name == github.repository',
        "event != 'pull_request'", "event != 'pull_request_target'"]) assert.ok(compute.includes(`github.event.workflow_run.${gate}`));
    }
  }

  // Workflow contract: all main writes use the existing lock, heavy computation
  // uses read-only jobs, and saved commits/artifact IDs connect the stages.
  const workflow = fs.readFileSync('.github/workflows/collect-results.yml', 'utf8');
  const jobs = Object.fromEntries([...workflow.matchAll(/^  ([a-z_]+):\n([\s\S]*?)(?=^  [a-z_]+:\n|$(?![\s\S]))/gm)]
    .filter(([, name]) => ['verify', 'collect', 'diagnostics', 'publish_reports', 'calibrate', 'publish_calibration'].includes(name))
    .map(([, name, content]) => [name, content]));
  assert.equal(Object.keys(jobs).length, 6);
  for (const name of ['collect', 'publish_reports', 'publish_calibration']) {
    assert.match(jobs[name], /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
    assert.match(jobs[name], /contents: write/);
  }
  for (const name of ['verify', 'diagnostics', 'calibrate']) {
    assert.doesNotMatch(jobs[name], /chappy-main-data-writers|contents: write|git push/);
  }
  for (const name of ['publish_reports', 'publish_calibration']) {
    assert.match(jobs[name], /artifact-ids: \$\{\{ needs\./);
    assert.match(jobs[name], /result-report-checkpoint.cjs publish/);
    assert.doesNotMatch(jobs[name], /node scripts\/build-/);
  }
  assert.match(jobs.collect, /repair-recent-results.js --sources-only/);
  for (const script of ['build-result-review.js', 'build-theory-evaluations.js', 'build-miss-cause-analysis.js', 'build-prediction-index-shards.js'])
    assert.ok(jobs.collect.indexOf(`node scripts/${script}`) < jobs.collect.indexOf('- name: Save official results'), script);
  assert.match(jobs.collect, /node scripts\/build-scenario-ai-v6-verification.js --recent/);
  assert.ok(jobs.collect.indexOf('build-scenario-ai-v6-verification.js --recent') < jobs.collect.indexOf('build-prediction-index-shards.js'));
  assert.doesNotMatch(jobs.diagnostics, /node scripts\/build-scenario-ai-v6-verification.js/, 'verification metadata must be saved before archive restoration');
  assert.match(jobs.diagnostics, /ref: \$\{\{ needs.collect.outputs.saved_sha \}\}/);
  assert.match(jobs.calibrate, /ref: \$\{\{ needs.publish_reports.outputs.saved_sha \}\}/);
  assert.match(jobs.diagnostics, /node scripts\/build-race-stats.js/);
  const predictions = fs.readFileSync('.github/workflows/collect-predictions.yml', 'utf8');
  assert.doesNotMatch(predictions.slice(0, predictions.indexOf('jobs:')), /^concurrency:/m, 'read-only regression must not hold up the next prediction run');
  const regression = predictions.slice(predictions.indexOf('\n  regression:'));
  assert.match(regression, /needs: predict/);
  assert.match(regression, /contents: read/);
  assert.match(regression, /Run noncritical regression checks/);
  assert.doesNotMatch(regression, /chappy-main-data-writers|git push/);
  console.log('result checkpoint: diagnostics/calibration and six audit profiles, source preservation, receipt replay guards, artifact validation, racing pushes and queue boundaries passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
