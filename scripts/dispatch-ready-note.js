'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildLatestHandoff } = require('./build-note-publish-handoff');
const { preparePublication, requirePublicationGate } = require('./note-github-ui-transport');
const REPOSITORY = 'takechanman12250711-oss/chappy-boatrace-ai';

function assertSourceOnlyChanges(git) {
  const paths = [git(['diff', '--name-only', 'HEAD']), git(['ls-files', '--others', '--exclude-standard'])]
    .join('\n').split('\n').filter(Boolean);
  if (paths.some(file => !/^data\/note-drafts\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(file))) {
    throw new Error('note_only_writer_has_unrelated_changes');
  }
  return [...new Set(paths)];
}

function pushSourceWithRebase(git, guard) {
  // Only immutable note files may be rebased concurrently with the central writer.
  // Ref updates stay fast-forward: a lost race retries against the new main.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    guard();
    git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'pull', '--rebase', 'origin', 'main']);
    guard();
    try { git(['push', 'origin', 'HEAD:refs/heads/main']); return; }
    catch (error) { if (attempt === 2) throw error; }
  }
}

function persistSourceInWorktree({ payload, guard, rootDir = process.cwd(),
  git = args => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(),
  gitAt = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim() }) {
  const file = payload.sourcePath;
  const match = /^data\/note-drafts\/(\d{8})\/\1-\d{2}-\d{1,2}-([a-f0-9]{64})\.json$/.exec(file);
  if (!match || match[2] !== payload.sourceSha256) throw new Error('note_source_identity_invalid');
  const bytes = fs.readFileSync(path.join(rootDir, file));
  if (createHash('sha256').update(bytes).digest('hex') !== payload.sourceSha256) throw new Error('note_source_hash_mismatch');
  guard();
  // The collector has dirty predictions/statistics. Never stash, rebase, commit
  // or move its HEAD/index here. A sparse worktree carries only the audited file.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'note-source-writer-'));
  const worktree = path.join(temporary, 'source');
  const sourceGit = args => gitAt(worktree, args);
  let attached = false;
  try {
    git(['fetch', 'origin', 'main']);
    git(['worktree', 'add', '--detach', '--no-checkout', worktree, 'FETCH_HEAD']);
    attached = true;
    sourceGit(['sparse-checkout', 'set', '--no-cone', `/${file}`]);
    sourceGit(['checkout', '--detach', 'HEAD']);
    const target = path.join(worktree, file);
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(bytes)) throw new Error('note_source_existing_bytes_mismatch');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx' });
    assertSourceOnlyChanges(sourceGit);
    sourceGit(['add', '--', file]);
    if (sourceGit(['diff', '--cached', '--name-only', '--', file])) {
      sourceGit(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '--only', '-m', `Save audited note source ${payload.raceKey}`, '--', file]);
    }
    const sourceGuard = () => {
      guard();
      if (!fs.readFileSync(target).equals(bytes)) throw new Error('note_source_persisted_bytes_mismatch');
      if (assertSourceOnlyChanges(sourceGit).length) throw new Error('note_source_writer_not_clean');
    };
    pushSourceWithRebase(sourceGit, sourceGuard);
    sourceGuard();
    console.log(`NOTE_EARLY_SOURCE_SAVED=${JSON.stringify({ writer: 'isolated_worktree', sourcePath: file, sourceSha256: payload.sourceSha256, commit: sourceGit(['rev-parse', 'HEAD']) })}`);
  } finally {
    // This is only our disposable copy; the collector retains the original even
    // after a conflict, deadline expiry or uncertain dispatch response.
    if (attached) git(['worktree', 'remove', '--force', worktree]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

async function dispatchReadyNote({ env = process.env, request = fetch, rootDir = process.cwd(),
  git = args => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(),
  prepare = preparePublication, build = buildLatestHandoff, guard = requirePublicationGate,
  persist = persistSourceInWorktree } = {}) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' || !env.NOTE_CLAIM_TOKEN) {
    throw new Error('note_early_dispatch_context_invalid');
  }
  const gate = await prepare({ rootDir, env, request, handoff: build({ write: false }).payload });
  console.log(`NOTE_EARLY_PREFLIGHT=${JSON.stringify({ ok: gate.ok, reason: gate.reason, skipped: gate.skipped })}`);
  if (!gate.ok) return { dispatched: false, reason: gate.reason };
  const check = () => guard(gate.payload, rootDir);
  check();
  const file = gate.payload.sourcePath;
  const isolated = env.NOTE_SOURCE_ISOLATED === 'true';
  if (!isolated) {
    persist({ payload: gate.payload, rootDir, git, guard: check });
  } else {
    const files = [...new Set([...assertSourceOnlyChanges(git), file])];
    // Persist the exact audited bundle before dispatch. Do not include pending
    // prediction/statistics changes, and never force-push or rewrite history.
    git(['add', '--', ...files]);
    if (git(['diff', '--cached', '--name-only', '--', ...files])) {
      git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '--only', '-m', `Save audited note source ${gate.payload.raceKey}`, '--', ...files]);
    }
    pushSourceWithRebase(git, check);
  }
  check();
  const response = await request(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/note-github-ui-transport.yml/dispatches`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.NOTE_CLAIM_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: 'publish' } }), signal: AbortSignal.timeout(30000)
  });
  if (response.status !== 204) throw new Error(`note_early_dispatch_failed_${response.status}`);
  console.log(`NOTE_EARLY_DISPATCHED=${gate.payload.raceKey}`);
  return { dispatched: true, raceKey: gate.payload.raceKey };
}

if (require.main === module) dispatchReadyNote().catch(error => {
  console.error(`NOTE_EARLY_DISPATCH_FAILED=${error.message}`); process.exitCode = 1;
});
module.exports = { dispatchReadyNote, assertSourceOnlyChanges, pushSourceWithRebase, persistSourceInWorktree };
