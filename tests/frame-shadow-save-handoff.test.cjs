'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const handoff = require('../scripts/frame-shadow-save-handoff.cjs');
const prepare = require('../scripts/prepare-daily-prediction-git-save');
const archive = require('../scripts/daily-prediction-source-archive');
const negative = require('../scripts/build-frame-rise-fall-negative-clip-snapshots');
const trial = require('../config/frame-rise-fall-negative-clip-trial.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-save-handoff-'));
const repository = 'owner/repository';
const now = new Date('2026-10-10T15:10:00Z'); // October 11 JST
const date = '20261011';
const run = { id: 101, run_attempt: 2, name: handoff.WORKFLOW, path: handoff.WORKFLOW_PATH,
  event: 'workflow_run', status: 'completed', conclusion: 'success', head_branch: 'main',
  head_sha: 'a'.repeat(40), head_repository: { full_name: repository },
  run_started_at: '2026-10-10T14:40:00Z', actor: { login: 'github-actions[bot]' } };
const event = { action: 'completed', repository: { full_name: repository }, workflow_run: run };
const admit = patch => handoff.admission({ eventName: 'workflow_run', repository,
  event: { ...event, workflow_run: { ...run, ...patch } } });
const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trimEnd();
const write = (dir, name, value) => { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), value); };
const commit = dir => { git(dir, ['add', '.']); git(dir, ['commit', '-m', 'fixture']); };
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`ok: ${name}`); }
function fixture(name, { archived = false, missing = false } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir); git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.name', 'fixture']); git(dir, ['config', 'user.email', 'fixture@example.invalid']);
  for (const file of ['js/core.js', 'scripts/builder.js', 'config/candidate.json', 'api/source.js', ...handoff.guardedPaths(date).slice(7)]) write(dir, file, '{}\n');
  if (!missing) {
    write(dir, `data/predictions/${date}.json`, JSON.stringify({ date, predictions: [{ tickets: ['1-2-3'] }], verificationPredictions: [] }) + '\n');
    if (archived) prepare.preparePredictionGitSave({ rootDirectory: dir, date, rawSaveLimitBytes: 1 });
  }
  commit(dir);
  const captureSha = git(dir, ['rev-parse', 'HEAD']);
  const receipt = handoff.createReceipt({ root: dir, date, frozenAt: '2026-10-10T15:01:00Z', captureSha,
    now: new Date('2026-10-10T15:09:00Z'), env: { GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '2',
      GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: 'workflow_run', GITHUB_SHA: run.head_sha } });
  return { dir, receipt, captureSha };
}
const validate = (f, overrides = {}) => handoff.validateReceipt({ root: f.dir, receipt: f.receipt, run, repository, date, now, ...overrides });
const sameRunEnv = { GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: repository,
  GITHUB_EVENT_NAME: 'workflow_run', GITHUB_SHA: run.head_sha };
const validateSameRun = (f, overrides = {}) => handoff.validateSameRunReceipt({
  root: f.dir, receipt: f.receipt, env: sameRunEnv, date, now, ...overrides,
});
try {
  test('successful automatic main/same-repo run accepts legitimate bot actor', () => assert.equal(admit().allowed, true));
  for (const badEvent of ['pull_request', 'workflow_dispatch', 'push', 'schedule']) {
    test(`upstream ${badEvent} never starts automatic capture`, () => assert.equal(admit({ event: badEvent }).allowed, false));
  }
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
    test(`upstream ${conclusion} is an explicit skip`, () => assert.match(admit({ conclusion }).reason, /^upstream-/));
  }
  test('queued/in-progress upstream is not completion', () => assert.equal(admit({ status: 'in_progress' }).allowed, false));
  test('wrong branch, head repo, name and path reject', () => {
    for (const patch of [{ head_branch: 'feature' }, { head_repository: { full_name: 'other/repository' } },
      { name: 'Collect automatic race predictions' }, { path: '.github/workflows/other.yml' }]) assert.equal(admit(patch).allowed, false);
    assert.equal(handoff.admission({ eventName: 'workflow_run', repository, event: { ...event, repository: { full_name: 'other/repository' } } }).allowed, false);
  });
  test('wrong outer event/action and invalid identity reject', () => {
    assert.equal(handoff.admission({ eventName: 'push', repository, event }).allowed, false);
    assert.equal(handoff.admission({ eventName: 'workflow_run', repository, event: { ...event, action: 'requested' } }).allowed, false);
    assert.throws(() => admit({ run_attempt: null }), /identity/);
  });
  test('direct PR is verification-only; explicit manual entry remains separate', () => {
    assert.equal(handoff.admission({ eventName: 'pull_request' }).mode, 'verify-only');
    assert.equal(handoff.admission({ eventName: 'workflow_dispatch' }).mode, 'manual');
    assert.equal(archive.resolveTargetDate({ argv: [], env: { PREDICT_DATE: '20261001' }, now }), '20261001');
  });
  test('exact attempt artifact identity and checksum fail closed', () => {
    const bytes = Buffer.from('fixture-zip');
    const artifact = { id: 202, name: handoff.artifactName(run.id, run.run_attempt), expired: false,
      size_in_bytes: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      workflow_run: { id: run.id, head_sha: run.head_sha, head_branch: 'main' } };
    assert.equal(handoff.selectArtifact([artifact], run).id, 202);
    handoff.verifyArtifact(bytes, artifact);
    assert.throws(() => handoff.verifyArtifact(Buffer.from('tampered'), artifact), /digest/);
    for (const artifacts of [[], [artifact, artifact], [{ ...artifact, expired: true }],
      [{ ...artifact, name: handoff.artifactName(run.id, 1) }], [{ ...artifact, digest: null }],
      [{ ...artifact, workflow_run: { ...artifact.workflow_run, id: 999 } }],
      [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: 'b'.repeat(40) } }]])
      assert.throws(() => handoff.selectArtifact(artifacts, run));
  });
  test('same-day delayed run uses actual frozen date, not previous-day run creation', () => {
    const f = fixture('day'); assert.equal(validate(f).allowed, true);
    assert.equal(f.receipt.date, '20261011');
    assert.equal(validate(f, { date: '20261012', now: new Date('2026-10-11T15:10:00Z') }).reason, 'frame-date-is-not-current-jst');
    assert.equal(validate(f, { date: '20261010' }).allowed, false);
  });
  test('receipt id/attempt/repo/event/SHA/times/paths are required, no inference from fields', () => {
    const f = fixture('identity');
    for (const patch of [{ runId: '999' }, { runAttempt: '1' }, { repository: 'other/repository' },
      { event: 'workflow_dispatch' }, { workflowSha: 'b'.repeat(40) }, { savedSha: 'bad' },
      { frozenAt: '2026-10-10T14:59:00Z' }, { savedAt: '2026-10-10T15:11:00Z' },
      { guards: f.receipt.guards.slice(1) }, { guards: [{ ...f.receipt.guards[0], path: '../wrong' }, ...f.receipt.guards.slice(1)] }])
      assert.throws(() => validate(f, { receipt: { ...f.receipt, ...patch } }));
  });
  test('saved SHA must identify the exact receipt tree, including tampered but valid commits', () => {
    const f = fixture('saved-sha');
    write(f.dir, `data/predictions/${date}.json`, '{"different":true}\n'); commit(f.dir);
    const differentSha = git(f.dir, ['rev-parse', 'HEAD']);
    assert.throws(() => validate(f, { receipt: { ...f.receipt, savedSha: differentSha } }), /guards do not match saved commit/);
    assert.throws(() => validate(f, { receipt: { ...f.receipt, savedSha: 'f'.repeat(40) } }));
    assert.throws(() => handoff.ensureSavedCommit(f.dir, '--bad-option'), /Invalid saved commit/);
    const before = git(f.dir, ['rev-parse', 'HEAD']);
    handoff.ensureSavedCommit(f.dir, f.receipt.savedSha);
    assert.equal(git(f.dir, ['rev-parse', 'HEAD']), before);
  });
  test('shallow successor fetches the exact saved commit without changing HEAD or worktree', () => {
    const f = fixture('shallow');
    write(f.dir, 'data/results/unrelated.json', '{}\n'); commit(f.dir);
    const remote = path.join(root, 'handoff-remote.git'), checkout = path.join(root, 'handoff-shallow');
    git(root, ['clone', '--bare', f.dir, remote]);
    git(remote, ['config', 'uploadpack.allowFilter', 'true']);
    git(root, ['clone', '--depth=1', 'file://' + remote, checkout]);
    assert.throws(() => git(checkout, ['cat-file', '-e', `${f.receipt.savedSha}^{commit}`]));
    const head = git(checkout, ['rev-parse', 'HEAD']), before = git(checkout, ['status', '--porcelain']);
    handoff.ensureSavedCommit(checkout, f.receipt.savedSha);
    assert.equal(validate({ ...f, dir: checkout }).allowed, true);
    assert.equal(git(checkout, ['rev-parse', 'HEAD']), head);
    assert.equal(git(checkout, ['status', '--porcelain']), before);
  });
  test('no-op and duplicate validation are read-only/idempotent; no frame fields required for out-of-scope rows', () => {
    const f = fixture('no-op');
    const before = git(f.dir, ['status', '--porcelain']);
    const bytes = fs.readFileSync(path.join(f.dir, `data/predictions/${date}.json`));
    assert.equal(validate(f).allowed, true); assert.equal(validate(f).allowed, true);
    assert.equal(git(f.dir, ['status', '--porcelain']), before);
    assert.deepEqual(fs.readFileSync(path.join(f.dir, `data/predictions/${date}.json`)), bytes);
  });
  test('the frame workflow can verify its own receipt without a second workflow-run handoff', () => {
    const f = fixture('same-run');
    assert.equal(validateSameRun(f).allowed, true);
    assert.throws(() => validateSameRun(f, { env: { ...sameRunEnv, GITHUB_RUN_ID: '999' } }), /identity mismatch/);
    assert.throws(() => validateSameRun(f, { env: { ...sameRunEnv, GITHUB_EVENT_NAME: 'workflow_dispatch' } }), /same-run receipt context/);
    write(f.dir, `data/predictions/${date}.json`, '{"newer":true}\n'); commit(f.dir);
    assert.match(validateSameRun(f).reason, /^frame-source-or-generation-changed:/);
  });
  test('missing frame source is explicit skip even if frame job returned success', () => {
    const f = fixture('missing', { missing: true }); assert.equal(validate(f).reason, 'frame-source-missing');
  });
  for (const [index, file] of handoff.guardedPaths(date).entries()) {
    test(`changed source/generation ${file} rejects before negative capture`, () => {
      const f = fixture('changed-' + index, { archived: true });
      assert.equal(validate(f).allowed, true);
      write(f.dir, ['js', 'scripts', 'config', 'api'].includes(file) ? `${file}/new.json` : file, '{"newer":true}\n'); commit(f.dir);
      assert.match(validate(f).reason, /^frame-source-or-generation-changed:/);
    });
  }
  test('unrelated commits do not invalidate saved source proof', () => {
    const f = fixture('unrelated'); write(f.dir, 'data/results/other.json', '{}\n'); commit(f.dir);
    assert.equal(validate(f).allowed, true);
  });
  test('code/candidate generation changing during frame save cannot be attested', () => {
    const f = fixture('during-save'); write(f.dir, 'config/candidate.json', '{"changed":true}\n'); commit(f.dir);
    assert.throws(() => handoff.createReceipt({ root: f.dir, date, frozenAt: f.receipt.frozenAt, captureSha: f.captureSha,
      now, env: { GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '2', GITHUB_REPOSITORY: repository,
        GITHUB_EVENT_NAME: 'workflow_run', GITHUB_SHA: run.head_sha } }), /generation changed/);
  });
  test('summary explicitly records skipped work rather than claiming capture success', () => {
    const summary = path.join(root, 'summary'), output = path.join(root, 'output');
    handoff.report(admit({ conclusion: 'skipped' }), { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output });
    assert.match(fs.readFileSync(summary, 'utf8'), /SKIPPED \(upstream-skipped\)/);
    assert.match(fs.readFileSync(output, 'utf8'), /allowed=false/);
  });
  test('existing formal/frame/negative fields and source input remain unchanged by repeat attachment', () => {
    const existing = { candidateId: trial.candidateId, status: 'shadow-ready', preserved: true };
    const row = { raceKey: 'fixture', prediction: { practicalTickets: ['1-2-3'], evidence: { preserve: true } },
      frameRiseFallShadowAb: { status: 'before-or-at-cutoff', saved: true }, frameRiseFallNegativeClipShadowAb: existing };
    const source = { predictions: [{ tickets: ['1-2-3'] }], verificationPredictions: [row], metadata: { preserve: true } };
    const before = JSON.stringify(source), once = negative.attach(source), twice = negative.attach(once);
    assert.equal(JSON.stringify(source), before); assert.deepEqual(twice, once);
    assert.deepEqual(once.verificationPredictions[0], row); assert.deepEqual(once.predictions, source.predictions);
    assert.deepEqual(once.metadata, source.metadata);
  });
  test('workflow wiring: automatic negative capture stays in the frame writer lease; PR/manual remain standalone', () => {
    const negativeWorkflow = fs.readFileSync('.github/workflows/collect-frame-rise-fall-negative-clip-ab.yml', 'utf8');
    const frameWorkflow = fs.readFileSync('.github/workflows/collect-frame-rise-fall-shadow-ab.yml', 'utf8');
    assert.doesNotMatch(negativeWorkflow, /^\s+workflow_run:/m);
    assert.match(negativeWorkflow, /^\s+pull_request:/m); assert.match(negativeWorkflow, /^\s+workflow_dispatch:/m);
    assert.match(negativeWorkflow, /steps.ready.outputs.allowed == 'true'/);
    assert.match(negativeWorkflow, /needs.verify-and-collect.outputs.capture_allowed == 'true'/);
    assert.match(negativeWorkflow, /if \[ "\$GITHUB_EVENT_NAME" = "workflow_dispatch" \]/);
    assert.match(frameWorkflow, /frame-shadow-save-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
    assert.equal((frameWorkflow.match(/PREDICT_DATE: \$\{\{ inputs.date \}\}/g) || []).length, 1);
    assert.equal((frameWorkflow.match(/PREDICT_DATE: \$\{\{ steps.target.outputs.date \}\}/g) || []).length, 5);
    const pushed = frameWorkflow.indexOf('git push origin main');
    const receipt = frameWorkflow.indexOf('Attest saved frame source');
    const ready = frameWorkflow.indexOf('ready-same-run');
    const capture = frameWorkflow.indexOf('Capture negative clip checkpoint under frame writer lock');
    const publish = frameWorkflow.indexOf('Publish negative clip checkpoint under the same writer lock');
    assert.ok(pushed < receipt && receipt < ready && ready < capture && capture < publish);
    assert.match(frameWorkflow, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
    assert.match(frameWorkflow, /generated-data-checkpoint.cjs pack negative-clip/);
    assert.match(frameWorkflow, /generated-data-checkpoint.cjs publish negative-clip/);
    assert.ok(negativeWorkflow.indexOf('frame-shadow-save-handoff.cjs ready') < negativeWorkflow.indexOf('node scripts/restore-daily-prediction-source.js'));
    assert.ok(negativeWorkflow.indexOf('publish_comparison:') < negativeWorkflow.indexOf('group: chappy-main-data-writers'));
    assert.match(negativeWorkflow, /generated-data-checkpoint.cjs publish negative-clip/);
    assert.doesNotMatch(negativeWorkflow, /github.actor|triggering_actor|run_started_at/);
  });
  console.log(`frame shadow save handoff: ${checks} tests passed`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
