'use strict';
// Persist a derived report, never prediction inputs. Rebuild on a fresh main
// after a concurrent push; do not force-push or rebase a stale ledger.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const OUTPUT = 'data/stats/continuous-performance-ledger.json';
const BUILDER = 'scripts/build-continuous-performance-ledger.cjs';

function command(cwd, executable, args, timeout = 120000) {
  const result = spawnSync(executable, args, {
    cwd, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  });
  return { ...result, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function checked(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${String(result.error?.message || result.stderr || result.stdout).slice(-2000)}`);
  }
  return result.stdout.trim();
}
function buildLedger(worktree) {
  checked(command(worktree, process.execPath, [BUILDER], 600000), 'ledger-build-failed');
}
function validateOutput(worktree) {
  const file = path.join(worktree, OUTPUT);
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error('invalid-ledger-output');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (report.schemaVersion !== 1 || report.analysisId !== 'continuous-performance-ledger-v1' ||
      !Array.isArray(report.rows) || report.cumulative?.races !== report.rows.length) {
    throw new Error('invalid-ledger-output');
  }
  const status = command(worktree, 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  checked(status, 'status-failed');
  const changed = status.stdout;
  // Each entry includes XY + a space, even for untracked generated files.
  if (changed.split('\0').filter(Boolean).some(entry => entry.slice(3) !== OUTPUT)) {
    throw new Error('unexpected-generated-path');
  }
  return report;
}
function persist(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const maximum = options.maxAttempts ?? 3;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3) throw new Error('invalid-attempt-limit');
  const git = (...args) => command(root, 'git', args);
  checked(git('rev-parse', '--show-toplevel'), 'not-a-repository');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy-ledger-persist-'));
  const worktree = path.join(parent, 'checkout');
  let attached = false;
  const cleanup = () => {
    if (attached) {
      checked(git('worktree', 'remove', '--force', worktree), 'temporary-worktree-cleanup-failed');
      attached = false;
    }
  };
  const fetchMain = () => {
    checked(git('fetch', '--no-tags', 'origin', 'main'), 'fetch-main-failed');
    return checked(git('rev-parse', 'FETCH_HEAD'), 'fetch-sha-failed');
  };
  try {
    for (let attempt = 1; attempt <= maximum; attempt++) {
      cleanup();
      const sourceCommit = fetchMain();
      checked(git('worktree', 'add', '--detach', worktree, sourceCommit), 'temporary-worktree-failed');
      attached = true;
      (options.build || buildLedger)(worktree);
      const report = validateOutput(worktree);
      checked(command(worktree, 'git', ['add', '--', OUTPUT]), 'stage-ledger-failed');
      const diff = command(worktree, 'git', ['diff', '--cached', '--quiet', '--', OUTPUT]);
      if (diff.status === 0) return { status: 'unchanged', attempts: attempt, sourceCommit, publishedCommit: null, cumulative: report.cumulative, rolling100: report.rolling100 };
      if (diff.status !== 1) checked(diff, 'ledger-diff-failed');
      checked(command(worktree, 'git', ['-c', 'user.name=github-actions[bot]', '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '--only', '-m', 'Update continuous performance ledger', '--', OUTPUT]), 'commit-ledger-failed');
      const commit = checked(command(worktree, 'git', ['rev-parse', 'HEAD']), 'commit-sha-failed');
      options.beforePush?.({ attempt, worktree, sourceCommit, commit });
      const pushed = options.push ? options.push(worktree) : command(worktree, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
      if (!pushed.error && pushed.status === 0) return { status: 'pushed', attempts: attempt, sourceCommit, publishedCommit: commit, cumulative: report.cumulative, rolling100: report.rolling100 };
      // Reconcile an ambiguous response before retrying. A report accepted by
      // the remote is not written a second time, even if another writer followed it.
      const current = fetchMain();
      if (git('merge-base', '--is-ancestor', commit, current).status === 0) {
        return { status: 'push-confirmed-after-fetch', attempts: attempt, sourceCommit, publishedCommit: commit, cumulative: report.cumulative, rolling100: report.rolling100 };
      }
      if (current === sourceCommit) checked(pushed, 'ledger-push-rejected');
      // The remote advanced: next iteration rebuilds using its current code
      // and inputs. No conflict resolution can drop another writer's data.
    }
    throw new Error('ledger-persistence-contention-limit');
  } finally {
    try { cleanup(); } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  }
}
if (require.main === module) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
      throw new Error('ledger-publication-main-only');
    }
    console.log(JSON.stringify(persist()));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { OUTPUT, BUILDER, command, buildLedger, validateOutput, persist };
