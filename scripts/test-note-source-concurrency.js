'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { assertSourceOnlyChanges, pushSourceWithRebase, persistSourceInWorktree, dispatchReadyNote } = require('./dispatch-ready-note');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-source-concurrency-'));
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function testCollectorIsolation() {
  const base = path.join(root, 'collector-isolation'); fs.mkdirSync(base);
  const bare = path.join(base, 'remote.git'), collector = path.join(base, 'collector'), writer = path.join(base, 'writer');
  git(base, ['init', '--bare', bare]); git(base, ['init', '-b', 'main', collector]);
  for (const args of [['config', 'user.name', 'test'], ['config', 'user.email', 'test@example.com']]) git(collector, args);
  for (const file of ['data/stats/result.json', 'data/predictions/20300914.json']) {
    fs.mkdirSync(path.dirname(path.join(collector, file)), { recursive: true });
    fs.writeFileSync(path.join(collector, file), 'original');
  }
  git(collector, ['add', '.']); git(collector, ['commit', '-m', 'initial']);
  git(collector, ['remote', 'add', 'origin', bare]); git(collector, ['push', 'origin', 'main']);
  git(base, ['clone', '--branch', 'main', bare, writer]);
  for (const args of [['config', 'user.name', 'test'], ['config', 'user.email', 'test@example.com']]) git(writer, args);
  const bytes = Buffer.from('immutable audited source\n');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const file = `data/note-drafts/20300914/20300914-02-9-${sha}.json`;
  const payload = { sourcePath: file, sourceSha256: sha, raceKey: '20300914-02-9' };
  fs.mkdirSync(path.dirname(path.join(collector, file)), { recursive: true });
  fs.writeFileSync(path.join(collector, file), bytes);
  const untouched = {
    'data/stats/result.json': 'staged statistics',
    'data/predictions/20300914.json': 'unsaved predictions',
    'untracked.txt': 'untracked collector work',
    [`data/note-drafts/20300914/20300914-02-10-${'b'.repeat(64)}.json`]: 'another note'
  };
  for (const [name, content] of Object.entries(untouched)) fs.writeFileSync(path.join(collector, name), content);
  git(collector, ['add', '--', 'data/stats/result.json']);
  const snapshot = () => ['rev-parse HEAD', 'status --porcelain', 'ls-files --stage'].map(args => git(collector, args.split(' ')));
  const before = snapshot();
  const remote = name => git(base, ['--git-dir', bare, 'show', `main:${name}`]);
  const advance = content => {
    git(writer, ['pull', '--rebase', 'origin', 'main']);
    fs.writeFileSync(path.join(writer, 'data/stats/result.json'), content);
    git(writer, ['add', '.']); git(writer, ['commit', '-m', 'concurrent data save']); git(writer, ['push', 'origin', 'main']);
  };
  // Start behind main, then lose one more push race after the first rebase.
  advance('saved before early note');
  let pushes = 0, dispatches = 0, worktree;
  const options = {
    rootDir: collector,
    env: { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_REF: 'refs/heads/main', NOTE_CLAIM_TOKEN: 'test' },
    build: () => ({ payload: {} }), prepare: async () => ({ ok: true, payload }),
    guard: () => assert.ok(fs.readFileSync(path.join(collector, file)).equals(bytes)),
    persist: args => persistSourceInWorktree({ ...args, gitAt: (cwd, command) => {
      worktree = cwd;
      if (command[0] === 'push') {
        assert.equal(fs.existsSync(path.join(cwd, 'data/predictions/20300914.json')), false, 'do not check out large collector data');
        if (++pushes === 1) advance('concurrent official result');
      }
      return git(cwd, command);
    } }),
    request: async () => { dispatches++; assert.equal(remote(file), bytes.toString().trim()); return { status: 204 }; }
  };
  assert.equal((await dispatchReadyNote(options)).dispatched, true);
  assert.equal(pushes, 2); assert.equal(dispatches, 1);
  assert.equal(remote('data/stats/result.json'), 'concurrent official result');
  assert.equal(remote('data/predictions/20300914.json'), 'original');
  assert.deepEqual(snapshot(), before, 'collector HEAD, status and index remain unchanged');
  for (const [name, content] of Object.entries(untouched)) assert.equal(fs.readFileSync(path.join(collector, name), 'utf8'), content);
  assert.equal(fs.existsSync(worktree), false, 'disposable source worktree is removed');
  const savedHead = git(base, ['--git-dir', bare, 'rev-parse', 'main']);
  // A lost dispatch response is uncertain: do not resend the POST or recreate a commit.
  let requests = 0;
  await assert.rejects(dispatchReadyNote({ ...options, persist: persistSourceInWorktree,
    request: async () => { requests++; throw new Error('response_lost'); } }), /response_lost/);
  assert.equal(requests, 1);
  assert.equal(git(base, ['--git-dir', bare, 'rev-parse', 'main']), savedHead, 'same immutable source is idempotent');
  assert.deepEqual(snapshot(), before);
  await assert.rejects(dispatchReadyNote({ ...options, env: { ...options.env, NOTE_SOURCE_ISOLATED: 'true' } }), /unrelated_changes/,
    'setting the isolated flag on the dirty collector must still fail');
  const persistOptions = { payload, rootDir: collector, guard: () => {} };
  assert.throws(() => persistSourceInWorktree({ ...persistOptions, payload: { ...payload, sourceSha256: '0'.repeat(64) } }), /identity_invalid/);
  fs.writeFileSync(path.join(collector, file), 'changed source');
  assert.throws(() => persistSourceInWorktree(persistOptions), /hash_mismatch/);
  fs.writeFileSync(path.join(collector, file), bytes);
  // Expiry during retry aborts before a second push and never dispatches.
  let expired = false, stalePushes = 0;
  await assert.rejects(dispatchReadyNote({ ...options, guard: () => { if (expired) throw new Error('deadline_passed'); },
    persist: args => persistSourceInWorktree({ ...args, gitAt: (cwd, command) => {
      worktree = cwd;
      if (command[0] === 'push') { stalePushes++; expired = true; throw new Error('push_race'); }
      return git(cwd, command);
    } }), request: async () => assert.fail('must not dispatch after expiry') }), /deadline_passed/);
  assert.equal(stalePushes, 1); assert.equal(fs.existsSync(worktree), false); assert.deepEqual(snapshot(), before);
  // Exhausted races leave all original work intact and never dispatch.
  let failedPushes = 0;
  await assert.rejects(dispatchReadyNote({ ...options,
    persist: args => persistSourceInWorktree({ ...args, gitAt: (cwd, command) => {
      worktree = cwd;
      if (command[0] === 'push') { failedPushes++; throw new Error('push_failed'); }
      return git(cwd, command);
    } }), request: async () => assert.fail('must not dispatch an unsaved source') }), /push_failed/);
  assert.equal(failedPushes, 3); assert.equal(fs.existsSync(worktree), false); assert.deepEqual(snapshot(), before);
  // The normal final collector save can rebase past the already saved source.
  git(collector, ['add', '--', file, 'data/predictions/20300914.json']);
  // Keep the statistics file out of this fixture's final commit to avoid a real
  // conflicting edit with the independent official-result writer.
  git(collector, ['restore', '--staged', 'data/stats/result.json']);
  git(collector, ['commit', '-m', 'save collected predictions']);
  git(collector, ['pull', '--rebase', '--autostash', 'origin', 'main']);
  assert.equal(git(collector, ['show', `HEAD:${file}`]), bytes.toString().trim());
  assert.equal(git(collector, ['show', 'HEAD:data/predictions/20300914.json']), 'unsaved predictions');
  assert.equal(remote(file), bytes.toString().trim());
  // An existing immutable pathname containing other bytes is never overwritten.
  git(writer, ['pull', '--rebase', 'origin', 'main']);
  fs.writeFileSync(path.join(writer, file), 'corrupt existing source');
  git(writer, ['add', '--', file]); git(writer, ['commit', '-m', 'simulate immutable source conflict']); git(writer, ['push', 'origin', 'main']);
  assert.throws(() => persistSourceInWorktree(persistOptions), /existing_bytes_mismatch/);
  assert.equal(remote(file), 'corrupt existing source');
  assert.ok(fs.readFileSync(path.join(collector, file)).equals(bytes));
}

async function main() {
try {
  const bare = path.join(root, 'remote.git'), central = path.join(root, 'central'), worker = path.join(root, 'worker');
  git(root, ['init', '--bare', bare]);
  git(root, ['init', '-b', 'main', central]);
  for (const args of [['config', 'user.name', 'test'], ['config', 'user.email', 'test@example.com']]) git(central, args);
  fs.mkdirSync(path.join(central, 'data/stats'), { recursive: true });
  fs.writeFileSync(path.join(central, 'data/stats/result.json'), 'original');
  git(central, ['add', '.']); git(central, ['commit', '-m', 'initial']);
  git(central, ['remote', 'add', 'origin', bare]); git(central, ['push', 'origin', 'main']);
  git(root, ['clone', '--branch', 'main', bare, worker]);
  for (const args of [['config', 'user.name', 'test'], ['config', 'user.email', 'test@example.com']]) git(worker, args);
  const source = 'data/note-drafts/20300914/20300914-02-9-' + 'a'.repeat(64) + '.json';
  fs.mkdirSync(path.dirname(path.join(worker, source)), { recursive: true });
  fs.writeFileSync(path.join(worker, source), 'immutable note source');
  assertSourceOnlyChanges(args => git(worker, args));
  fs.writeFileSync(path.join(worker, 'data/stats/result.json'), 'must not write this');
  assert.throws(() => assertSourceOnlyChanges(args => git(worker, args)), /unrelated_changes/);
  git(worker, ['restore', 'data/stats/result.json']);
  git(worker, ['add', '--', source]); git(worker, ['commit', '--only', '-m', 'note source', '--', source]);
  // Actions sets identity on the commit command only; rebase must supply its own.
  git(worker, ['config', '--unset', 'user.name']);
  git(worker, ['config', '--unset', 'user.email']);
  let raced = false, pushes = 0, guards = 0;
  pushSourceWithRebase(args => {
    if (args[0] === 'push') {
      pushes++;
      if (!raced) {
        raced = true;
        fs.writeFileSync(path.join(central, 'data/stats/result.json'), 'new official result');
        git(central, ['add', '.']); git(central, ['commit', '-m', 'result saved concurrently']);
        git(central, ['push', 'origin', 'main']);
      }
    }
    return git(worker, args);
  }, () => { guards++; });
  assert.equal(pushes, 2, 'retry only the failed fast-forward source push');
  assert.equal(guards, 4, 'check deadline around every rebase');
  assert.equal(git(root, ['--git-dir', bare, 'show', 'main:data/stats/result.json']), 'new official result');
  assert.equal(git(root, ['--git-dir', bare, 'show', `main:${source}`]), 'immutable note source');
  let attempts = 0;
  assert.throws(() => pushSourceWithRebase(args => { if (args[0] === 'push') { attempts++; throw new Error('push_failed'); } }, () => {}), /push_failed/);
  assert.equal(attempts, 3, 'bound conflict retries');
  let calls = 0;
  assert.throws(() => pushSourceWithRebase(() => { calls++; }, () => { throw new Error('deadline_passed'); }), /deadline_passed/);
  assert.equal(calls, 0);
  const independent = 'data/outer-attack-sources/20300914/20300914-02-9-' + 'b'.repeat(64) + '.json';
  fs.mkdirSync(path.dirname(path.join(worker, independent)), { recursive: true });
  fs.writeFileSync(path.join(worker, independent), 'immutable independent evidence');
  const saveArgs = { env: { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_REF: 'refs/heads/main' },
    git: args => git(worker, args) };
  const save = require('./save-live-verification-sources').save;
  assert.equal(save(saveArgs).saved, 1, 'research saved without a publication token or eligible article');
  assert.equal(git(root, ['--git-dir', bare, 'show', `main:${independent}`]), 'immutable independent evidence');
  assert.equal(git(root, ['--git-dir', bare, 'show', 'main:data/stats/result.json']), 'new official result');
  assert.equal(save(saveArgs).saved, 0, 'no empty source commits');
  const reference = 'data/omura-reference/20300914/20300914-24-6-' + 'c'.repeat(64) + '.json';
  fs.mkdirSync(path.dirname(path.join(worker, reference)), { recursive: true });
  fs.writeFileSync(path.join(worker, reference), 'immutable reporter comparison');
  assert.equal(save(saveArgs).saved, 1, 'reporter reference shares immutable-only persistence');
  assert.equal(git(root, ['--git-dir', bare, 'show', `main:${reference}`]), 'immutable reporter comparison');
  const forward = 'data/partner-forward/20300914/20300914-24-6-' + 'd'.repeat(64) + '.json';
  fs.mkdirSync(path.dirname(path.join(worker, forward)), { recursive: true });
  fs.writeFileSync(path.join(worker, forward), 'sealed partner candidate');
  assert.equal(save(saveArgs).saved, 1, 'partner evidence shares immutable-only persistence');
  assert.equal(git(root, ['--git-dir', bare, 'show', `main:${forward}`]), 'sealed partner candidate');
  fs.writeFileSync(path.join(worker, 'data/stats/result.json'), 'must not be included');
  assert.throws(() => save(saveArgs), /unrelated_changes/);
  await testCollectorIsolation();
  console.log('concurrent official result and immutable note source writes preserve both histories');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
