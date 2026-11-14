'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

// Exercise the workflow's actual Bash against tiny local repositories. No
// builder, saved predictions/results, GitHub API, or network remote is used.
const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/check-theory-validation-phase8-cycle.yml'), 'utf8');
const lines = workflow.split('\n');
const guardStart = lines.indexOf('      - name: Guard production prediction files');
assert.notEqual(guardStart, -1, 'production guard step must exist');
const nextStep = lines.findIndex((line, index) => index > guardStart && line.startsWith('      - '));
const step = lines.slice(guardStart, nextStep === -1 ? undefined : nextStep);
const runStart = step.indexOf('        run: |');
assert.notEqual(runStart, -1, 'production guard Bash must exist');
// The substitution lets the same regression test demonstrate the old guard's
// failure before its fix; the replacement guard has no inline expressions.
const guard = step.slice(runStart + 1).map(line => line.slice(10)).join('\n')
  .replaceAll('${{ github.base_ref }}', 'main');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-production-guard-'));
const protectedPaths = ['prediction.js', 'js/prediction.js', 'js/ai-core.js', 'ai-core.js'];
const git = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const write = (cwd, file, content) => {
  const absolute = path.join(cwd, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
};
const commit = (cwd, message) => {
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
};
function fixture(name, change = cwd => write(cwd, 'docs.txt', 'PR documentation\n')) {
  const work = path.join(tmp, name);
  fs.mkdirSync(work);
  git(work, ['init', '-b', 'main']);
  git(work, ['config', 'user.name', 'test']);
  git(work, ['config', 'user.email', 'test@example.invalid']);
  for (const file of protectedPaths) write(work, file, '// production fixture\n');
  const base = commit(work, 'event base');
  git(work, ['checkout', '-b', 'feature']);
  change(work);
  commit(work, 'PR changes');
  git(work, ['checkout', '-b', 'pr-merge', base]);
  git(work, ['merge', '--no-ff', '--no-edit', 'feature']);
  return { work, base, head: git(work, ['rev-parse', 'HEAD']) };
}
function runGuard(f, overrides = {}) {
  const env = { ...process.env, BASE_SHA: f.base, EXPECTED_HEAD_SHA: f.head, ...overrides };
  return spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', guard], {
    cwd: f.work, env, encoding: 'utf8'
  });
}
function succeeds(f, name) {
  const result = runGuard(f);
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
  assert.equal(git(f.work, ['status', '--porcelain']), '', `${name}: guard is read-only`);
}
function rejects(f, name, overrides = {}) {
  const result = runGuard(f, overrides);
  assert.notEqual(result.status, 0, `${name}: guard must fail closed`);
  assert.equal(git(f.work, ['status', '--porcelain']), '', `${name}: rejection is read-only`);
  return result;
}

try {
  const moving = fixture('moving-main');
  const remote = path.join(tmp, 'origin.git');
  git(tmp, ['clone', '--bare', moving.work, remote]);
  git(moving.work, ['checkout', 'main']);
  write(moving.work, 'js/prediction.js', '// main-only production change\n');
  const laterMain = commit(moving.work, 'main advances after PR event');
  git(moving.work, ['push', remote, 'main']);
  const runner = path.join(tmp, 'runner');
  git(tmp, ['clone', '--branch', 'pr-merge', `file://${remote}`, runner]);
  const f = { ...moving, work: runner };

  // Reproduce the incident: fetching a newer main with depth 1 destroys its
  // merge-base traversal even though the event's PR merge still has its base.
  const old = spawnSync('bash', ['-e', '-o', 'pipefail', '-c',
    'git fetch origin main --depth=1\ngit diff --name-only origin/main...HEAD'], {
    cwd: runner, encoding: 'utf8'
  });
  assert.equal(old.status, 128, 'old shallow/live-main comparison must reproduce exit 128');
  assert.match(old.stderr, /no merge base/);
  assert.equal(git(runner, ['rev-parse', 'origin/main']), laterMain);
  succeeds(f, 'fixed event base remains valid after main-only production changes');

  assert.ok(step.includes('          BASE_SHA: ${{ github.event.pull_request.base.sha }}'), 'workflow must supply the fixed event base');
  assert.ok(step.includes('          EXPECTED_HEAD_SHA: ${{ github.sha }}'), 'workflow must supply the fixed event checkout');

  for (const file of protectedPaths) {
    const changed = fixture(`changed-${file.replaceAll('/', '-')}`, cwd => write(cwd, file, '// changed in PR\n'));
    assert.match(rejects(changed, `protected change ${file}`).stdout, /must not modify production prediction logic/);
  }
  const deleted = fixture('deleted-production', cwd => fs.unlinkSync(path.join(cwd, 'prediction.js')));
  rejects(deleted, 'protected deletion');
  const renamed = fixture('renamed-production', cwd => fs.renameSync(path.join(cwd, 'js/prediction.js'), path.join(cwd, 'js/renamed.js')));
  rejects(renamed, 'protected rename must expose its deleted production path');

  rejects(f, 'missing event base', { BASE_SHA: '' });
  rejects(f, 'malformed event base', { BASE_SHA: 'main' });
  rejects(f, 'unknown event base', { BASE_SHA: '0'.repeat(40) });
  rejects(f, 'unexpected checkout', { EXPECTED_HEAD_SHA: f.base });
  rejects(f, 'missing event checkout', { EXPECTED_HEAD_SHA: '' });

  const unrelated = fixture('non-ancestor');
  git(unrelated.work, ['checkout', '--orphan', 'other-history']);
  const unrelatedBase = commit(unrelated.work, 'unrelated base');
  git(unrelated.work, ['checkout', '--detach', unrelated.head]);
  rejects(unrelated, 'base outside event checkout history', { BASE_SHA: unrelatedBase });

  console.log('phase8 production guard: moving-main shallow regression, 4 protected paths, deletion/rename, and fail-closed identity checks passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
