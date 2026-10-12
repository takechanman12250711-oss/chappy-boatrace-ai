'use strict';
// Real phase8 builder + tiny Git remotes; no network, production dispatch or raw edits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const checkpoint = require('./result-report-checkpoint.cjs');
const publisher = require('./persist-theory-validation-cycle.cjs');
const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-owner-'));
const P8 = publisher.OUTPUT, WALL = 'wall-prospective-lifecycle';
const WALL_REPORT = 'data/stats/wall-established-attacker2-skip-ab-report.json';
const COVERAGE = 'data/stats/theory-evidence-coverage-phase7.json';
const P9 = 'data/stats/phase9-live-improvement-cycle.json';
const wallPaths = [WALL_REPORT, 'data/stats/theory-validation-phase6-prospective.json', 'data/stats/theory-validation-phase7-lifecycle.json'];
const originals = ['data/predictions/20261012.json', 'data/results/20261012.json',
  'data/predictions/source-archives/20261012.json.gz', 'data/predictions/source-archives/20261012.meta.json',
  'data/predictions/index.json'];
const inputs = ['flow-suppression-report', 'st-role-attack-exhibition-holdout-report',
  'remain-pickup-same-stake-shadow-report', 'local-water-v2-post-adoption-monitor',
  'wall-established-attacker2-skip-ab-report', 'st-slit-branch-profit-report',
  'frame-rise-fall-shadow-result-report', 'theory-evidence-coverage-phase7',
  'theory-evidence-growth-monitor', 'exhibition-foot-branch-report', 'local-water-branch-report',
  'skill-branch-report', 'motor-course-branch-report', 'effective-score-weight-ab-report'];
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, file, value) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(value) + '\n'); };
const read = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const commit = (root, message) => { git(root, ['add', '.']); git(root, ['commit', '-m', message]); return git(root, ['rev-parse', 'HEAD']); };
const node = (root, args) => execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hashes = (root, ref, files) => files.map(p => git(root, ['rev-parse', `${ref}:${p}`]));
const clean = f => { assert.equal(git(f.work, ['status', '--porcelain']), ''); assert.equal(git(f.work, ['worktree', 'list', '--porcelain']).match(/^worktree /gm).length, 1); };
function reportAt(f) { return JSON.parse(git(f.remote, ['show', `main:${P8}`])); }
function assertPhase11(f, expected) {
  // Use phase11's unchanged disk reader against the exact final publication SHA.
  git(f.work, ['fetch', 'origin', 'main']); git(f.work, ['reset', '--hard', 'FETCH_HEAD']);
  const candidates = JSON.parse(node(f.work, ['scripts/phase11-improvement-decision-gate.cjs']));
  assert.equal(candidates.rows.find(r => r.theoryId === 'wall').evaluatedCount, expected);
}
let base;
function fixture(name) {
  const work = path.join(tmp, name), remote = `${work}.git`;
  git(tmp, ['clone', '--no-hardlinks', base, work]);
  git(work, ['config', 'user.name', 'test']); git(work, ['config', 'user.email', 'test@example.invalid']);
  git(work, ['remote', 'remove', 'origin']);
  git(tmp, ['clone', '--bare', work, remote]); git(work, ['remote', 'add', 'origin', `file://${remote}`]);
  return { root: work, work, remote, baseSha: git(work, ['rev-parse', 'HEAD']) };
}
function pack(f, stage, change) {
  change(); const output = path.join(tmp, `${path.basename(f.work)}-${stage}.json`);
  checkpoint.pack({ root: f.work, stage, output });
  const bytes = fs.readFileSync(output), bundle = JSON.parse(bytes);
  git(f.work, ['reset', '--hard', f.baseSha]); git(f.work, ['clean', '-fd']);
  return { stage, bundle, bytes, output };
}
function bundles(f) {
  const wallCount = read(f.work, WALL_REPORT).diagnostics.targetSettledRaceCount + 7;
  const evidenceCount = read(f.work, COVERAGE).theories.find(r => r.theoryKey === 'wall-boat').raceCount + 11;
  const wall = pack(f, WALL, () => {
    const report = read(f.work, WALL_REPORT); report.diagnostics.targetSettledRaceCount = wallCount; put(f.work, WALL_REPORT, report);
    node(f.work, ['scripts/theory-validation-phase6-prospective-integration.cjs', `--output=${wallPaths[1]}`]);
    node(f.work, ['scripts/theory-validation-phase7-lifecycle.cjs', `--output=${wallPaths[2]}`]);
  });
  const central = pack(f, 'diagnostics', () => {
    const report = read(f.work, COVERAGE); report.generatedAt = '2026-10-12T16:00:00Z';
    report.theories.find(r => r.theoryKey === 'wall-boat').raceCount = evidenceCount; put(f.work, COVERAGE, report);
    put(f.work, P9, { phaseComplete: true, fixture: 'new central cohort' });
  });
  assert.deepEqual(wall.bundle.files.map(r => r.path), wallPaths);
  assert.ok(central.bundle.files.some(r => r.path === P9));
  return { wall, central, wallCount, evidenceCount };
}
function concurrentChange(f, relative, change) {
  git(f.work, ['fetch', 'origin', 'main']); git(f.work, ['reset', '--hard', 'FETCH_HEAD']);
  change(path.join(f.work, relative)); commit(f.work, 'concurrent saved input/code'); git(f.work, ['push', 'origin', 'main']);
}
try {
  base = path.join(tmp, 'base'); fs.mkdirSync(base);
  for (const dir of ['scripts', 'js', 'api', 'config', '.github/workflows']) fs.cpSync(path.join(ROOT, dir), path.join(base, dir), { recursive: true });
  for (const name of inputs) { const file = `data/stats/${name}.json`; put(base, file, read(ROOT, file)); }
  const prereg = 'data/experiments/wall-established-attacker2-skip-preregistration.json'; put(base, prereg, read(ROOT, prereg));
  for (const file of originals) put(base, file, { immutable: file });
  for (const file of wallPaths.slice(1)) put(base, file, { existing: file });
  put(base, P9, { existing: 'phase9' }); publisher.buildCycle(base);
  git(base, ['init', '-b', 'main']); git(base, ['config', 'user.name', 'test']); git(base, ['config', 'user.email', 'test@example.invalid']); commit(base, 'fixture saved originals and real phase8 inputs');

  // Both collectors computed on the same base. Each actual input update must
  // survive the other publisher and immediately reach phase11's saved reader.
  for (const order of [['wall', 'central'], ['central', 'wall']]) {
    const f = fixture(order.join('-')), batches = bundles(f), old = hashes(f.remote, 'main', originals);
    for (const key of order) {
      const batch = batches[key]; checkpoint.publish({ ...f, ...batch });
      const result = publisher.persist(f);
      assert.equal(result.status, 'pushed');
      assert.equal(result.publishedCommit, git(f.remote, ['rev-parse', 'main']));
      assert.deepEqual(git(f.remote, ['diff-tree', '--no-commit-id', '--name-only', '-r', result.publishedCommit]).split('\n'), [P8]);
      const out = path.join(tmp, `${key}-output`); publisher.writeReportCommit(result, out);
      assert.match(fs.readFileSync(out, 'utf8'), new RegExp(`sha=${result.publishedCommit}\\n`));
      assert.deepEqual(fs.readFileSync(batch.output), batch.bytes, 'bundle identity and bytes are never rebased');
    }
    const wall = reportAt(f).rows.find(r => r.theoryId === 'wall');
    assert.equal(wall.validationHandoff.gate.current, batches.wallCount);
    assert.equal(wall.evidenceAccumulation.raceCount, batches.evidenceCount);
    assertPhase11(f, batches.wallCount);
    assert.deepEqual(hashes(f.remote, 'main', originals), old);
    const before = git(f.remote, ['rev-parse', 'main']);
    assert.equal(publisher.persist(f).status, 'unchanged'); assert.equal(git(f.remote, ['rev-parse', 'main']), before);
    // Own-report and receipt guards still reject stale artifacts, even after refresh.
    for (const key of order) assert.throws(() => checkpoint.publish({ ...f, ...batches[key] }), /Report changed|Audit receipt changed/);
    clean(f);
  }

  // Intermediate success is recoverable without weakening receipt replay rejection.
  const recovery = fixture('recover-refresh'), recoveredBatches = bundles(recovery);
  const checkpointSaved = checkpoint.publish({ ...recovery, ...recoveredBatches.wall });
  assert.throws(() => publisher.persist({ ...recovery, build() { throw new Error('injected build failure'); } }), /injected build failure/);
  assert.equal(git(recovery.remote, ['rev-parse', 'main']), checkpointSaved.savedSha);
  assert.throws(() => checkpoint.publish({ ...recovery, ...recoveredBatches.wall }), /Audit receipt changed/);
  const recovered = publisher.persist(recovery); assert.equal(recovered.status, 'pushed');
  assertPhase11(recovery, recoveredBatches.wallCount); clean(recovery);

  // Recompute, do not retry stale bytes, after both relevant data and code pushes.
  for (const type of ['input', 'code']) {
    const f = fixture(`concurrent-${type}`), b = bundles(f); checkpoint.publish({ ...f, ...b.wall });
    let builds = 0;
    const result = publisher.persist({ ...f, build(work) { builds++; publisher.buildCycle(work); }, beforePush({ attempt }) {
      if (attempt !== 1) return;
      if (type === 'input') concurrentChange(f, WALL_REPORT, file => { const r = JSON.parse(fs.readFileSync(file)); r.diagnostics.targetSettledRaceCount += 3; fs.writeFileSync(file, JSON.stringify(r)); });
      else concurrentChange(f, publisher.BUILDER, file => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("analysisId:'theory-validation-phase8-cycle-v1',", "analysisId:'theory-validation-phase8-cycle-v1',fixtureCodeRevision:2,")));
    } });
    assert.equal(result.attempts, 2); assert.equal(builds, 2);
    if (type === 'code') assert.equal(reportAt(f).fixtureCodeRevision, 2, 'execute the latest main builder');
    assert.equal(reportAt(f).rows.find(r => r.theoryId === 'wall').validationHandoff.gate.current, b.wallCount + (type === 'input' ? 3 : 0));
    assert.deepEqual(hashes(f.remote, 'main', originals), hashes(f.remote, f.baseSha, originals)); clean(f);
  }
  const exhausted = fixture('bounded-contention'), eb = bundles(exhausted); checkpoint.publish({ ...exhausted, ...eb.wall }); let attempts = 0;
  assert.throws(() => publisher.persist({ ...exhausted, beforePush() { attempts++; concurrentChange(exhausted, WALL_REPORT, file => { const r = JSON.parse(fs.readFileSync(file)); r.diagnostics.targetSettledRaceCount++; fs.writeFileSync(file, JSON.stringify(r)); }); } }), /contention-limit/);
  assert.equal(attempts, 3); assert.deepEqual(hashes(exhausted.remote, 'main', [P8]), hashes(exhausted.remote, exhausted.baseSha, [P8])); clean(exhausted);

  // A no-op calculation also rechecks main; a late source update is not lost.
  const noOp = fixture('noop-race'); let noopBuilds = 0;
  const noOpResult = publisher.persist({ ...noOp, build(work) {
    publisher.buildCycle(work); noopBuilds++;
    if (noopBuilds === 1) concurrentChange(noOp, WALL_REPORT, file => { const r = JSON.parse(fs.readFileSync(file)); r.diagnostics.targetSettledRaceCount += 5; fs.writeFileSync(file, JSON.stringify(r)); });
  } });
  assert.equal(noOpResult.attempts, 2); assert.equal(noopBuilds, 2); clean(noOp);
  // Lost push acknowledgment is reconciled. If newer input followed the accepted
  // commit, rebuild it and hand the fresh commit to calibration instead.
  for (const advanced of [false, true]) {
    const f = fixture(`lost-ack-${advanced}`), b = bundles(f); checkpoint.publish({ ...f, ...b.wall }); let pushes = 0;
    const result = publisher.persist({ ...f, push(work) {
      pushes++; const accepted = publisher.command(work, 'git', ['push', 'origin', 'HEAD:refs/heads/main']); assert.equal(accepted.status, 0);
      if (advanced && pushes === 1) concurrentChange(f, WALL_REPORT, file => { const r = JSON.parse(fs.readFileSync(file)); r.diagnostics.targetSettledRaceCount += 2; fs.writeFileSync(file, JSON.stringify(r)); });
      return { status: 1, stderr: 'simulated lost acknowledgment' };
    } });
    assert.equal(result.attempts, advanced ? 2 : 1); assert.equal(result.status, 'push-confirmed-after-fetch');
    assert.equal(result.publishedCommit, git(f.remote, ['rev-parse', 'main']));
    assert.equal(reportAt(f).rows.find(r => r.theoryId === 'wall').validationHandoff.gate.current, b.wallCount + (advanced ? 2 : 0)); clean(f);
  }

  // Negative controls: raw writes, altered approvals, extra reports and invalid
  // cycle output can never be staged/pushed by the limited publisher.
  for (const file of [...originals, 'config/wall-purchase-approval.json', COVERAGE, P8]) {
    const f = fixture(`reject-${file.replace(/\W/g, '-')}`), before = git(f.remote, ['rev-parse', 'main']);
    assert.throws(() => publisher.persist({ ...f, build(work) { publisher.buildCycle(work); put(work, file, { forbidden: true }); } }), /unexpected-generated-path|invalid-cycle-output/);
    assert.equal(git(f.remote, ['rev-parse', 'main']), before); clean(f);
  }
  for (const stage of ['diagnostics', 'calibration', WALL]) {
    assert.equal(checkpoint.allowed(P8, stage), false);
    const f = fixture(`reject-stale-phase8-${stage}`), b = bundles(f), batch = stage === WALL ? b.wall : b.central;
    const file = { path: P8, baseBlob: git(f.work, ['rev-parse', `HEAD:${P8}`]), content: JSON.stringify({ stale: true }) }; file.sha256 = checkpoint.sha256(file.content);
    const bundle = { ...batch.bundle, stage, files: [...batch.bundle.files, file] };
    assert.throws(() => checkpoint.validate(bundle, { stage, baseSha: f.baseSha }), /Invalid/); clean(f);
  }

  // Phase9 still receives the identical freshly built phase8 object in memory;
  // central run never writes the saved phase8 path. No production formula mock.
  const p8 = { phaseComplete: true, summary: { fresh: true } }, writes = [];
  const fakeFs = { existsSync: () => false, mkdirSync() {}, writeFileSync(file) { writes.push(file); } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'scripts/run-live-improvement-cycle.cjs'), 'utf8'), {
    module, __dirname: path.join(tmp, 'runner/scripts'), process: { stdout: { write() {} } },
    require(id) {
      if (id === 'node:fs') return fakeFs; if (id === 'node:path') return path;
      if (id === './theory-validation-phase8-cycle.cjs') return { build: () => p8 };
      if (id === './phase9-live-improvement-cycle.cjs') return { load: () => [], build(input, options) { assert.equal(options.phase8Report, p8); return { phaseComplete: true, summary: {}, audit: {} }; } };
      throw new Error(id);
    }
  });
  module.exports.run(); assert.deepEqual(writes, [path.join(tmp, 'runner', P9)]);

  const results = fs.readFileSync(path.join(ROOT, '.github/workflows/collect-results.yml'), 'utf8');
  const wallWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/collect-wall-established-attacker2-skip-ab.yml'), 'utf8');
  const job = (text, name) => text.split(`\n  ${name}:\n`)[1].split(/\n  [a-z_]+:\n/)[0];
  assert.match(job(results, 'publish_reports'), /needs: publish_diagnostics/);
  assert.match(job(results, 'publish_reports'), /saved_sha: \$\{\{ steps.refresh.outputs.sha \}\}/);
  assert.match(job(results, 'calibrate'), /needs: publish_reports/);
  assert.match(job(results, 'calibrate'), /ref: \$\{\{ needs.publish_reports.outputs.saved_sha \}\}/);
  assert.match(job(results, 'publish_calibration'), /BASE_SHA: \$\{\{ needs.publish_reports.outputs.saved_sha \}\}/);
  assert.match(job(wallWorkflow, 'refresh_cycle'), /needs: publish_reports/);
  for (const refresh of [job(results, 'publish_reports'), job(wallWorkflow, 'refresh_cycle')]) {
    assert.match(refresh, /run: node scripts\/persist-theory-validation-cycle.cjs/);
    assert.match(refresh, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
    assert.doesNotMatch(refresh, /download-artifact|checkpoint.cjs|restore-daily|build-learning/);
    for (const dir of ['scripts', 'js', 'api', 'config', 'data/stats', 'data/experiments', '.github/workflows']) assert.ok(refresh.includes(`            ${dir}\n`));
  }
  assert.doesNotMatch(wallWorkflow, /theory-validation-phase8-cycle.cjs --output=/);
  console.log('phase8 single owner: real builder/input interleavings, phase11 freshness, phase9 handoff, recovery, strict stale guards, concurrent code/input rebuilds and original-data negative controls passed');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
