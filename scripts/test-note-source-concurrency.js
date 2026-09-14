'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assertSourceOnlyChanges, pushSourceWithRebase } = require('./dispatch-ready-note');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'note-source-concurrency-'));
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
  console.log('concurrent official result and immutable note source writes preserve both histories');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
