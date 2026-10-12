'use strict';
// Tiny Git fixtures exercise publication only: no production builders or data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pack, validate, apply, publish, allowed, sha256 } = require('./result-report-checkpoint.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'water-wall-save-'));
const WALL = 'wall-prospective-lifecycle', OUTSIDE = 'local-water-outside-head-miss-structure';
const reports = ['wall-established-attacker2-skip-ab-report', 'theory-validation-phase6-prospective',
  'theory-validation-phase7-lifecycle'].map(name => `data/stats/${name}.json`);
const outside = `data/stats/${OUTSIDE}.json`;
const receipt = stage => `data/stats/audit-checkpoints/${stage}.json`;
const workflowFile = '.github/workflows/collect-wall-established-attacker2-skip-ab.yml';
const prereg = 'data/experiments/wall-established-attacker2-skip-preregistration.json';
const sources = ['data/predictions/20261005.json', 'data/results/20261005.json',
  'data/predictions/source-archives/20261005.json.gz', 'data/predictions/source-archives/20261005.meta.json',
  'data/predictions/index.json', 'data/predictions/index-manifest.json', 'data/predictions/index-shards/current.json'];
const rawGit = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd, args) => rawGit(cwd, args).toString().trim();
function write(cwd, file, value) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), JSON.stringify(value) + '\n');
}
function commit(cwd, message) { git(cwd, ['add', '.']); git(cwd, ['commit', '-m', message]); return git(cwd, ['rev-parse', 'HEAD']); }
function hashes(cwd, ref, files) { return files.map(file => sha256(rawGit(cwd, ['show', `${ref}:${file}`]))); }
function artifact(f) { return sha256(fs.readFileSync(f.output)); }
function fixture(name, stage = WALL, unchanged = false) {
  const work = path.join(root, name), remote = `${work}.git`, output = `${work}-artifact.json`;
  fs.mkdirSync(work); git(work, ['init', '-b', 'main']);
  git(work, ['config', 'user.name', 'test']); git(work, ['config', 'user.email', 'test@example.invalid']);
  for (const file of [...reports, outside, receipt(WALL), receipt(OUTSIDE), ...sources,
    'scripts/builder.js', workflowFile, prereg, 'data/stats/unrelated-report.json']) write(work, file, { old: file });
  const baseSha = commit(work, 'saved source');
  git(root, ['clone', '--bare', work, remote]); git(work, ['remote', 'add', 'origin', `file://${remote}`]);
  if (!unchanged) for (const file of stage === WALL ? reports : [outside]) write(work, file, { built: file });
  pack({ root: work, stage, output });
  const bundle = JSON.parse(fs.readFileSync(output));
  git(work, ['reset', '--hard', baseSha]);
  return { root: work, work, remote, output, stage, baseSha, bundle };
}
function rejected(f, action, error) {
  const before = { status: git(f.work, ['status', '--porcelain']), head: git(f.work, ['rev-parse', 'HEAD']), artifact: artifact(f) };
  assert.throws(action, error);
  assert.equal(artifact(f), before.artifact, 'rejection preserves the reusable artifact');
  assert.equal(git(f.work, ['status', '--porcelain']), before.status, 'no partial writes');
  assert.equal(git(f.work, ['rev-parse', 'HEAD']), before.head, 'caller branch preserved');
}
function pushChange(f, file, value) {
  write(f.work, file, value); const sha = commit(f.work, 'concurrent change');
  git(f.work, ['push', 'origin', 'main']); return sha;
}
function cleaned(f) { assert.equal(git(f.work, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1); }
try {
  const f = fixture('wall-success');
  assert.deepEqual(f.bundle.files.map(file => file.path), reports);
  assert.equal(f.bundle.receiptBaseBlob, git(f.work, ['rev-parse', `HEAD:${receipt(WALL)}`]));
  const preserved = [...sources, outside, receipt(OUTSIDE), 'data/stats/unrelated-report.json'];
  for (const file of preserved) write(f.work, file, { fresh: file });
  const fresh = commit(f.work, 'new source data'); git(f.work, ['push', 'origin', 'main']);
  const freshHashes = hashes(f.remote, 'main', preserved), artifactHash = artifact(f);
  git(f.work, ['sparse-checkout', 'set', 'scripts', 'data/stats']);
  const saved = publish(f);
  assert.equal(saved.receipt.sourceSha, f.baseSha);
  assert.equal(saved.receipt.publishedFromSha, fresh);
  assert.deepEqual(saved.receipt.files, f.bundle.files.map(({ path, sha256 }) => ({ path, sha256 })));
  assert.deepEqual(git(f.remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', saved.savedSha]).split('\n').sort(),
    [...reports, receipt(WALL)].sort(), 'exactly three reports and their receipt are published');
  assert.deepEqual(hashes(f.remote, 'main', preserved), freshHashes, 'fresh source bytes survive publication');
  assert.deepEqual(hashes(f.remote, 'main', reports), f.bundle.files.map(file => file.sha256));
  assert.equal(git(f.remote, ['rev-parse', 'main']), saved.savedSha);
  assert.deepEqual(JSON.parse(git(f.remote, ['show', `main:${receipt(WALL)}`])), saved.receipt);
  assert.equal(git(f.work, ['rev-parse', 'HEAD']), fresh);
  assert.equal(git(f.work, ['status', '--porcelain']), ''); assert.equal(artifact(f), artifactHash); cleaned(f);

  const invalid = fixture('invalid-bundles');
  for (const mutate of [b => b.files.pop(), b => b.files.push(b.files[0]), b => { b.files[3] = b.files[0]; },
    b => { b.baseSha = 'a'.repeat(40); }, b => { b.files[0].sha256 = '0'.repeat(64); },
    b => { b.files[0].content = '{}'; }, b => { b.receipt = { forged: true }; },
    b => { delete b.receiptBaseBlob; }]) {
    const bundle = structuredClone(invalid.bundle); mutate(bundle);
    rejected(invalid, () => validate(bundle, invalid), /Invalid/);
  }
  for (const file of [outside, receipt(WALL), receipt(OUTSIDE), ...sources, prereg,
    'data/stats/result-diagnostics-checkpoint.json', 'data/stats/../../scripts/hacked.js']) {
    assert.equal(allowed(file, WALL), false, file);
    const bundle = structuredClone(invalid.bundle); bundle.files[0].path = file;
    rejected(invalid, () => validate(bundle, invalid), /Invalid/);
  }
  for (const target of ['receipt', ...reports]) {
    const bundle = structuredClone(invalid.bundle);
    if (target === 'receipt') bundle.receiptBaseBlob = null;
    else bundle.files.find(file => file.path === target).baseBlob = null;
    rejected(invalid, () => apply({ ...invalid, bundle }), /Incorrect source/);
  }
  for (const file of reports) {
    fs.unlinkSync(path.join(invalid.work, file));
    rejected(invalid, () => pack(invalid), /Deleted\/nonregular report/);
    git(invalid.work, ['restore', '--', file]);
  }
  const conflicts = [...reports.map(file => [file, /Report changed/]), [receipt(WALL), /Audit receipt changed/],
    ['scripts/builder.js', /Builder code changed/], [workflowFile, /Builder code changed/],
    ['.github/workflows/another-collector.yml', /Builder code changed/], [prereg, /Builder code changed/]];
  for (const [i, [file, error]] of conflicts.entries()) {
    const stale = fixture(`stale-${i}`); write(stale.work, file, { newer: true }); commit(stale.work, 'newer input');
    rejected(stale, () => apply(stale), error);
  }
  for (const stage of [WALL, OUTSIDE]) {
    const dirty = fixture(`dirty-${stage}`, stage);
    for (const file of [...sources, stage === WALL ? outside : reports[0]]) for (const staged of [false, true]) {
      const original = fs.readFileSync(path.join(dirty.work, file));
      write(dirty.work, file, { unsaved: true });
      if (staged) git(dirty.work, ['add', '--', file]);
      rejected(dirty, () => pack(dirty), /Unsaved source/);
      if (staged) {
        fs.writeFileSync(path.join(dirty.work, file), original);
        assert.equal(git(dirty.work, ['diff', 'HEAD', '--', file]), '');
        rejected(dirty, () => pack(dirty), /Unsaved source/); // staged bytes hidden by restored working bytes
      }
      git(dirty.work, ['reset', '--hard', dirty.baseSha]);
    }
  }
  const retry = fixture('unrelated-race'); let attempts = 0;
  const retried = publish({ ...retry, beforePush({ attempt }) {
    attempts++;
    if (attempt === 1) pushChange(retry, sources[0], { freshDuringPush: true });
  } });
  assert.equal(attempts, 2, 'one lost push CAS retries against current main');
  assert.equal(git(retry.remote, ['rev-parse', 'main']), retried.savedSha);
  assert.deepEqual(hashes(retry.remote, 'main', [sources[0]]), hashes(retry.work, 'HEAD', [sources[0]])); cleaned(retry);
  const exhausted = fixture('persistent-race'); let exhaustedAttempts = 0;
  const exhaustedArtifact = artifact(exhausted);
  assert.throws(() => publish({ ...exhausted, beforePush({ attempt }) {
    exhaustedAttempts++; pushChange(exhausted, sources[1], { attempt });
  } }));
  assert.equal(exhaustedAttempts, 3, 'unrelated writers cannot cause unbounded retries');
  assert.deepEqual(hashes(exhausted.remote, 'main', [...reports, receipt(WALL)]), hashes(exhausted.work, exhausted.baseSha, [...reports, receipt(WALL)]));
  assert.equal(artifact(exhausted), exhaustedArtifact); cleaned(exhausted);
  for (const [i, [file, error]] of conflicts.entries()) {
    const race = fixture(`relevant-race-${i}`); let pushes = 0, newer;
    const artifactHash = artifact(race);
    assert.throws(() => publish({ ...race, beforePush() {
      pushes++; newer = pushChange(race, file, { newest: true });
    } }), error);
    assert.equal(pushes, 1, 'relevant changes fail revalidation before a second push');
    assert.equal(git(race.remote, ['rev-parse', 'main']), newer);
    assert.equal(git(race.work, ['status', '--porcelain']), '');
    assert.equal(artifact(race), artifactHash); cleaned(race);
  }
  const replay = fixture('identical-report-replay', WALL, true), first = publish(replay);
  assert.deepEqual(hashes(replay.remote, 'main', reports), hashes(replay.work, replay.baseSha, reports));
  rejected(replay, () => publish(replay), /Audit receipt changed/);
  assert.equal(git(replay.remote, ['rev-parse', 'main']), first.savedSha, 'replay never creates a second commit');

  // Interleave both real profile publishers at the push boundary, rather than
  // emulating the competing writer with an unrelated one-file commit.
  const concurrent = fixture('outside-versus-wall', OUTSIDE);
  for (const file of reports) write(concurrent.work, file, { wallBuilt: file });
  const wallArtifact = path.join(root, 'concurrent-wall.json');
  pack({ root: concurrent.work, stage: WALL, output: wallArtifact });
  const wallBundle = JSON.parse(fs.readFileSync(wallArtifact)); git(concurrent.work, ['reset', '--hard', concurrent.baseSha]);
  let outsideAttempts = 0, wallSaved;
  const outsideSaved = publish({ ...concurrent, beforePush({ attempt }) {
    outsideAttempts++;
    if (attempt === 1) wallSaved = publish({ ...concurrent, stage: WALL, bundle: wallBundle });
  } });
  assert.equal(outsideAttempts, 2);
  assert.equal(outsideSaved.receipt.publishedFromSha, wallSaved.savedSha);
  assert.deepEqual(hashes(concurrent.remote, 'main', reports), wallBundle.files.map(file => file.sha256));
  assert.deepEqual(hashes(concurrent.remote, 'main', [outside]), concurrent.bundle.files.map(file => file.sha256));
  assert.deepEqual(git(concurrent.remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', outsideSaved.savedSha]).split('\n').sort(),
    [outside, receipt(OUTSIDE)].sort());
  assert.deepEqual(hashes(concurrent.remote, 'main', sources), hashes(concurrent.work, concurrent.baseSha, sources)); cleaned(concurrent);

  // Static workflow contracts keep expensive work outside the shared writer
  // lock and bind publication to the exact artifact and checked-out source SHA.
  for (const [file, stage, job, directory, buildName, commands] of [
    [workflowFile, WALL, 'verify-and-collect', 'wall-report', 'Restore canonical prediction sources and build reports', [
      'restore-daily-prediction-source.js --all', 'build-wall-established-attacker2-skip-ab-report.js',
      'theory-validation-phase6-prospective-integration.cjs --output=data/stats/theory-validation-phase6-prospective.json',
      'theory-validation-phase7-lifecycle.cjs --output=data/stats/theory-validation-phase7-lifecycle.json',
      'prepare-daily-prediction-git-save.js --all']],
    [`.github/workflows/check-${OUTSIDE}.yml`, OUTSIDE, 'diagnostics', 'audit-report', 'Build real diagnostic', [
      'restore-daily-prediction-source.js --all', `build-${OUTSIDE}.js`, 'prepare-daily-prediction-git-save.js --all']],
  ]) {
    const workflow = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const [top, jobs] = workflow.split('\njobs:\n'), [compute, tail] = jobs.split('\n  publish_reports:\n'), [publisher] = tail.split('\n  refresh_cycle:\n');
    for (const trigger of ['pull_request', 'push', 'workflow_run', 'workflow_dispatch']) assert.match(top, new RegExp(`^  ${trigger}:`, 'm'));
    const events = Object.fromEntries([...top.matchAll(/^  (pull_request|push|workflow_run|schedule|workflow_dispatch):\n([\s\S]*?)(?=^  [a-z_]+:|^permissions:|$(?![\s\S]))/gm)]
      .map(([, name, value]) => [name, value]));
    assert.match(events.push, /branches:(?: \[main\]|\n      - main)/);
    assert.match(events.workflow_run, /workflows:(?: \["Collect official race results"\]|\n      - "Collect official race results")/);
    assert.match(events.workflow_run, /types:(?: \[completed\]|\n      - completed)/);
    assert.ok(events.pull_request.includes(file)); assert.ok(events.push.includes(file));
    assert.match(top, /cancel-in-progress: false/);
    assert.match(top, /permissions:\n  contents: read/);
    assert.ok(compute.includes(`  ${job}:\n`));
    assert.match(compute, /if: github.event_name != 'workflow_run' \|\| github.event.workflow_run.conclusion == 'success'/);
    assert.doesNotMatch(top + compute, /chappy-main-data-writers|contents: write|git (push|pull|commit)/);
    assert.match(compute, /permissions:\n\s+contents: read/);
    assert.match(compute, /fetch-depth: 1\n\s+persist-credentials: false/);
    assert.ok(compute.includes('ref: ${{ github.event_name == \'pull_request\' && github.event.pull_request.head.sha || \'main\' }}'));
    assert.ok(compute.includes('run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"'));
    assert.ok(compute.includes('source_sha: ${{ steps.source.outputs.sha }}'));
    assert.ok(compute.includes('artifact_id: ${{ steps.reports.outputs.artifact-id }}')); assert.doesNotMatch(compute, /github.sha/);
    const steps = compute.split(/\n(?=      - )/), build = steps.find(step => step.includes(`name: ${buildName}\n`));
    assert.deepEqual([...build.matchAll(/^          node scripts\/(.+)$/gm)].map(match => match[1]), commands, 'heavy builder commands stay unchanged');
    const production = steps.filter(step => step === build || step.includes('checkpoint.cjs pack') || step.includes('actions/upload-artifact@v4'));
    assert.equal(production.length, 3); for (const step of production) assert.match(step, /if: github.event_name != 'pull_request'/);
    assert.equal(production[0], build); assert.match(production[1], /checkpoint.cjs pack/); assert.match(production[2], /upload-artifact@v4/);
    assert.match(production[2], /retention-days: 3/);
    assert.ok(compute.includes(`pack ${stage} "$RUNNER_TEMP/${directory}/checkpoint.json"`));
    assert.ok(compute.includes(`name: ${stage}-` + '${{ github.run_id }}-${{ github.run_attempt }}'));
    assert.ok(compute.includes(`path: \${{ runner.temp }}/${directory}/checkpoint.json`)); assert.match(compute, /if-no-files-found: error/);
    assert.ok(publisher.includes(`needs: ${job}\n`));
    assert.ok(publisher.includes(`if: github.event_name != 'pull_request' && needs.${job}.result == 'success'`));
    assert.match(publisher, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
    assert.match(publisher, /contents: write/); assert.match(publisher, /timeout-minutes: 10/);
    assert.match(publisher, /ref: main\n\s+fetch-depth: 1\n\s+sparse-checkout: \|\n\s+scripts\n\s+data\/stats/);
    assert.ok(publisher.includes(`artifact-ids: \${{ needs.${job}.outputs.artifact_id }}`));
    assert.ok(publisher.includes(`BASE_SHA: \${{ needs.${job}.outputs.source_sha }}`));
    assert.ok(publisher.includes(`publish ${stage} "$RUNNER_TEMP/${directory}/checkpoint.json" "$BASE_SHA"`));
    assert.doesNotMatch(publisher, /node scripts\/(?:build-|theory-validation|restore-daily|prepare-daily)|git (push|pull|commit)/);
    assert.equal((workflow.match(/contents: write/g) || []).length, stage === WALL ? 2 : 1);
    assert.equal((workflow.match(/group: chappy-main-data-writers/g) || []).length, stage === WALL ? 2 : 1);
    if (stage === WALL) {
      assert.match(top, /cron: "17 15 \* \* \*"/);
      assert.equal(top.match(/^  group: (.+)$/m)[1], "${{ github.event_name == 'pull_request' && format('{0}-pr-{1}', github.workflow, github.event.pull_request.number) || format('{0}-main', github.workflow) }}");
      assert.match(compute, /timeout-minutes: 30/);
    } else {
      assert.match(top, /group: chappy-local-water-outside-head-miss-structure-/); assert.match(top, /queue: max/);
    }
  }
  console.log('water/wall report save: exact batches, source preservation, stale/replay guards, bounded concurrent pushes and workflow contracts passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
