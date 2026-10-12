'use strict';
// Sole main publisher for saved phase8. Build from already-published reports;
// never accept phase8 artifact bytes or modify prediction/result originals.
// Both existing collectors call this after their strict checkpoint job succeeds.
// A failed refresh can rerun independently without replaying that checkpoint.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const OUTPUT = 'data/stats/theory-validation-phase8-cycle.json';
const BUILDER = 'scripts/theory-validation-phase8-cycle.cjs';

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
function buildCycle(worktree) {
  checked(command(worktree, process.execPath, [BUILDER, `--output=${OUTPUT}`], 120000), 'cycle-build-failed');
}
function validateOutput(worktree) {
  const file = path.join(worktree, OUTPUT);
  if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error('invalid-cycle-output');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (report.schemaVersion !== 1 || report.analysisId !== 'theory-validation-phase8-cycle-v1' ||
      report.phaseComplete !== true || report.productionChanged !== false ||
      report.policy?.automaticProductionAdoption !== false || !Array.isArray(report.rows) ||
      report.rows.length !== 13 || report.rows.some(row => row.productionChanged !== false)) {
    throw new Error('invalid-cycle-output');
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
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy-cycle-persist-'));
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
      (options.build || buildCycle)(worktree);
      const report = validateOutput(worktree);
      checked(command(worktree, 'git', ['add', '--', OUTPUT]), 'stage-cycle-failed');
      const diff = command(worktree, 'git', ['diff', '--cached', '--quiet', '--', OUTPUT]);
      if (diff.status === 0) {
        // Even a no-op must not declare an obsolete main fresh.
        if (fetchMain() !== sourceCommit) continue;
        return { status: 'unchanged', attempts: attempt, sourceCommit, publishedCommit: null, summary: report.summary };
      }
      if (diff.status !== 1) checked(diff, 'cycle-diff-failed');
      checked(command(worktree, 'git', ['-c', 'user.name=github-actions[bot]', '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '--only', '-m', 'Refresh theory validation phase8 from saved reports', '--', OUTPUT]), 'commit-cycle-failed');
      const commit = checked(command(worktree, 'git', ['rev-parse', 'HEAD']), 'commit-sha-failed');
      options.beforePush?.({ attempt, worktree, sourceCommit, commit });
      const pushed = options.push ? options.push(worktree) : command(worktree, 'git', ['push', 'origin', 'HEAD:refs/heads/main']);
      if (!pushed.error && pushed.status === 0) return { status: 'pushed', attempts: attempt, sourceCommit, publishedCommit: commit, summary: report.summary };
      // Reconcile an ambiguous response before retrying. A report accepted by
      // the remote is not written a second time, even if another writer followed it.
      const current = fetchMain();
      if (git('merge-base', '--is-ancestor', commit, current).status === 0) {
        // A later saved input may follow the accepted push. Re-evaluate that
        // new main rather than returning a stale final handoff commit.
        if (current !== commit) continue;
        return { status: 'push-confirmed-after-fetch', attempts: attempt, sourceCommit, publishedCommit: commit, summary: report.summary };
      }
      if (current === sourceCommit) checked(pushed, 'cycle-push-rejected');
      // The remote advanced: next iteration rebuilds using its current code
      // and inputs. No conflict resolution can drop another writer's data.
    }
    throw new Error('cycle-persistence-contention-limit');
  } finally {
    try { cleanup(); } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  }
}
function writeReportCommit(result, outputFile) {
  if (!outputFile) return;
  const commit = result.publishedCommit || result.sourceCommit;
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('invalid-report-commit');
  fs.appendFileSync(outputFile, `sha=${commit}\n`);
}
if (require.main === module) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
      throw new Error('cycle-publication-main-only');
    }
    const result = persist();
    writeReportCommit(result, process.env.GITHUB_OUTPUT);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { OUTPUT, BUILDER, command, buildCycle, validateOutput, persist, writeReportCommit };
