'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pack, apply, publish, validate, allowed } = require('./result-report-checkpoint.cjs');
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
  console.log('result checkpoint: source preservation, conflicts, artifact validation, racing pushes and queue boundaries passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
