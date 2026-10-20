'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { test } = require('node:test');
const { runReview } = require('../scripts/claude-codex-review.cjs');

function git(root, args, options = {}) {
  return childProcess.execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options
  }).trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy codex review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Review Fixture']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Review committed changes. Preserve saved predictions.\n');
  fs.writeFileSync(path.join(root, 'example.cjs'), 'module.exports = 1;\n');
  git(root, ['add', 'AGENTS.md', 'example.cjs']);
  git(root, ['commit', '--quiet', '-m', 'Fixture base']);
  const base = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  fs.writeFileSync(path.join(root, 'example.cjs'), 'module.exports = 2;\n');
  git(root, ['add', 'example.cjs']);
  git(root, ['commit', '--quiet', '-m', 'Fixture implementation']);
  const head = git(root, ['rev-parse', 'HEAD']);
  return { root, base, head };
}

function fakeCodex({ authStatus = 0, authText = 'Logged in using ChatGPT\n', authStderr = '',
  authError, execStatus = 0, execError, report = 'No actionable bugs found in the committed diff.\n',
  writeReport = true, afterExec } = {}) {
  const calls = [];
  const spawnSync = (command, args, options) => {
    if (command !== 'codex') return childProcess.spawnSync(command, args, options);
    calls.push({ command, args: [...args], options });
    const loginIndex = args.indexOf('login');
    if (loginIndex >= 0 && args[loginIndex + 1] === 'status') {
      return { status: authStatus, stdout: authText, stderr: authStderr, error: authError };
    }
    assert.ok(args.includes('exec'), 'only the login probe and a review execution may call Codex');
    const outputIndex = args.indexOf('--output-last-message');
    assert.ok(outputIndex >= 0);
    const outputPath = args[outputIndex + 1];
    if (writeReport) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, report);
    }
    afterExec?.({ command, args, options, outputPath });
    return { status: execStatus, stdout: 'untrusted CLI output is not evidence\n',
      stderr: 'untrusted diagnostic output\n', error: execError };
  };
  return { calls, spawnSync, executions: () => calls.filter(call => call.args.includes('exec')) };
}

function readReceipt(result) {
  assert.ok(result.receiptPath, 'known repository reviews leave a receipt');
  return JSON.parse(fs.readFileSync(result.receiptPath, 'utf8'));
}

function assertNoApproval(receipt) {
  assert.equal(receipt.mergeApproved, false);
  assert.equal(receipt.productionChanged, false);
}

function assertInside(parent, file) {
  const relative = path.relative(parent, file);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative),
    `expected output under the Git metadata directory: ${relative}`);
}

function assertScratchRemoved(fake, repositoryRoot) {
  assert.ok(fake.calls.length > 0);
  const scratch = fake.calls[0].options.cwd;
  assert.ok(path.isAbsolute(scratch));
  const relative = path.relative(repositoryRoot, scratch);
  assert.ok(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),
    'Codex starts outside the reviewed repository');
  assert.match(path.basename(scratch), /^chappy-codex-review-/);
  for (const call of fake.calls) assert.equal(call.options.cwd, scratch);
  assert.equal(fs.existsSync(scratch), false, 'the private scratch directory is removed after the child exits');
}

function assertConfigurationIsolation(args) {
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--skip-git-repo-check']) {
    assert.ok(args.includes(flag), `${flag} prevents configuration discovery outside the review boundary`);
  }
  const overrides = args.flatMap((value, index) => value === '-c' ? [args[index + 1]] : []);
  assert.ok(overrides.includes('model_provider="openai"'));
  assert.ok(overrides.includes('forced_login_method="chatgpt"'));
  assert.ok(overrides.includes('project_root_markers=[]'));
}

test('committed diff is reviewed with read-only argv, stdin SHA binding and a hashed receipt', async t => {
  const f = fixture(t), fake = fakeCodex();
  const result = await runReview({ cwd: f.root, base: 'origin/main', spawnSync: fake.spawnSync });
  assert.equal(result.status, 'completed');
  assert.equal(result.baseSha, f.base);
  assert.equal(result.headSha, f.head);
  assert.equal(fake.executions().length, 1);
  const { args, options } = fake.executions()[0];
  assert.deepEqual(args.slice(0, 4), ['--no-daemon', '--ask-for-approval', 'never', 'exec']);
  assert.deepEqual(fake.calls[0].args, ['-c', 'model_provider="openai"',
    '-c', 'forced_login_method="chatgpt"', 'login', 'status']);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('--ephemeral'));
  assert.equal(args[args.indexOf('--color') + 1], 'never');
  assert.equal(args[args.indexOf('--cd') + 1], options.cwd);
  assertScratchRemoved(fake, f.root);
  assertConfigurationIsolation(args);
  assert.equal(args.at(-1), '-');
  assert.ok(!options.shell, 'the runner never uses shell interpolation');
  assert.equal(typeof options.input, 'string');
  assert.ok(options.input.includes(f.base));
  assert.ok(options.input.includes(f.head));
  assert.ok(options.input.includes(`Repository root (JSON string): ${JSON.stringify(f.root)}`));
  assert.ok(options.input.includes(`git -C <repository-root> diff ${f.base}...${f.head}`));
  assert.ok(options.input.includes('For every Git command, pass -C with the absolute repository root above; do not change the execution working directory.'));
  assert.ok(options.input.includes(JSON.stringify(path.join(f.root, 'AGENTS.md')).slice(1, -1)));
  assert.match(options.input, /AGENTS\.md/);
  assert.ok(options.timeout > 0 && options.timeout <= 15 * 60 * 1000);
  assert.ok(options.maxBuffer > 0 && options.maxBuffer <= 2 * 1024 * 1024);
  assert.ok(!args.some(value => value.includes('dangerously')));
  assert.ok(!args.includes('--model') && !args.includes('-m'), 'the reviewer uses the CLI default model');
  const receipt = readReceipt(result);
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.baseSha, f.base);
  assert.equal(receipt.headSha, f.head);
  assert.equal(receipt.configurationIsolation, 'scratch-cwd-without-user-config-or-rules');
  assert.equal(receipt.modelProvider, 'openai');
  assertNoApproval(receipt);
  const report = fs.readFileSync(result.reportPath);
  assert.equal(receipt.report.file, 'review.md');
  assert.equal(receipt.report.bytes, report.length);
  assert.equal(receipt.report.sha256, crypto.createHash('sha256').update(report).digest('hex'));
  const commonDir = path.resolve(f.root, git(f.root, ['rev-parse', '--git-common-dir']));
  assertInside(commonDir, result.receiptPath);
  assertInside(commonDir, result.reportPath);
  assert.equal(git(f.root, ['status', '--porcelain=v1']), '', 'reports never dirty the implementation branch');
});

test('default base resolves origin/main rather than floating ref text in the receipt', async t => {
  const f = fixture(t), fake = fakeCodex();
  const result = await runReview({ cwd: f.root, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'completed');
  assert.equal(readReceipt(result).baseSha, f.base);
});

test('the normal ChatGPT login status may be written to stderr', async t => {
  const f = fixture(t), fake = fakeCodex({ authText: '', authStderr: 'Logged in using ChatGPT\n' });
  const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'completed');
  assert.equal(fake.executions().length, 1);
  assertNoApproval(readReceipt(result));
});

test('repository API provider, MCP and hook settings stay outside the child configuration boundary', async t => {
  const f = fixture(t);
  const configPath = path.join(f.root, '.codex', 'config.toml');
  const config = [
    'model_provider = "unapproved-project-provider"',
    '[model_providers.unapproved-project-provider]',
    'name = "Unapproved fixture provider"',
    'base_url = "https://never-contact-project-api.example.invalid/v1"',
    'env_key = "NEVER_READ_PROJECT_API_SECRET"',
    '[mcp_servers.unapproved_project_tool]',
    'command = "node"',
    'args = ["-e", "throw new Error(\'NEVER_RUN_PROJECT_MCP\')"]',
    '[hooks]',
    'SessionStart = [{ command = "echo NEVER_RUN_PROJECT_HOOK" }]',
    ''
  ].join('\n');
  fs.mkdirSync(path.dirname(configPath));
  fs.writeFileSync(configPath, config);
  git(f.root, ['add', '.codex/config.toml']);
  git(f.root, ['commit', '--quiet', '-m', 'Fixture project configuration']);
  f.head = git(f.root, ['rev-parse', 'HEAD']);
  const fake = fakeCodex({ afterExec: ({ args, options }) => {
    // The fake checks the actual child boundary without executing repository settings.
    assert.ok(fs.existsSync(options.cwd), 'private scratch exists while Codex is executing');
    assert.equal(fs.existsSync(path.join(options.cwd, '.codex', 'config.toml')), false);
    assert.notEqual(options.cwd, f.root);
    assert.equal(args[args.indexOf('--cd') + 1], options.cwd);
    assertConfigurationIsolation(args);
  } });
  const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'completed');
  assert.equal(readReceipt(result).headSha, f.head);
  assert.equal(fs.readFileSync(configPath, 'utf8'), config);
  assert.equal(git(f.root, ['status', '--porcelain=v1']), '');
  assertScratchRemoved(fake, f.root);
  assert.doesNotMatch(JSON.stringify({ result, receipt: readReceipt(result) }),
    /never-contact-project-api|NEVER_READ_PROJECT_API_SECRET|NEVER_RUN_PROJECT_MCP|NEVER_RUN_PROJECT_HOOK/);
});

for (const [label, prepare] of [
  ['tracked edit', f => fs.writeFileSync(path.join(f.root, 'example.cjs'), 'uncommitted\n')],
  ['staged edit', f => {
    fs.writeFileSync(path.join(f.root, 'example.cjs'), 'staged\n');
    git(f.root, ['add', 'example.cjs']);
  }],
  ['untracked file', f => fs.writeFileSync(path.join(f.root, 'unexpected.cjs'), 'untracked\n')]
]) {
  test(`dirty worktree (${label}) stops before any model request`, async t => {
    const f = fixture(t), fake = fakeCodex(); prepare(f);
    const before = git(f.root, ['status', '--porcelain=v1']);
    const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
    assert.equal(result.status, 'failed');
    assert.equal(fake.executions().length, 0);
    assert.equal(git(f.root, ['status', '--porcelain=v1']), before);
  });
}

test('unknown base ref stops before a model request', async t => {
  const f = fixture(t), fake = fakeCodex();
  const result = await runReview({ cwd: f.root, base: 'refs/heads/not-present', spawnSync: fake.spawnSync });
  assert.equal(result.status, 'failed');
  assert.equal(fake.executions().length, 0);
});

test('base outside the implementation ancestry is rejected', async t => {
  const f = fixture(t), fake = fakeCodex();
  const tree = git(f.root, ['rev-parse', `${f.base}^{tree}`]);
  const unrelated = git(f.root, ['commit-tree', tree], { input: 'Independent root commit\n' });
  const result = await runReview({ cwd: f.root, base: unrelated, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'failed');
  assert.equal(fake.executions().length, 0);
});

for (const [label, auth] of [
  ['logged out', { authStatus: 1, authText: 'Not logged in\n' }],
  ['API credentials', { authText: 'Logged in using an API key: never-echo-this-auth-value\n' }],
  ['unrecognized auth', { authText: 'Authentication state unknown\n' }],
  ['missing executable', { authStatus: null, authText: '',
    authError: Object.assign(new Error('never-echo-this-auth-value'), { code: 'ENOENT' }) }]
]) {
  test(`${label} cannot silently use a paid API or start a model request`, async t => {
    const f = fixture(t), fake = fakeCodex(auth);
    const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
    assert.equal(result.status, 'failed');
    assert.equal(fake.executions().length, 0);
    const receipt = result.receiptPath ? readReceipt(result) : {};
    assert.doesNotMatch(JSON.stringify({ result, receipt }), /never-echo-this-auth-value/);
    if (result.receiptPath) assertNoApproval(receipt);
    assertScratchRemoved(fake, f.root);
  });
}

for (const [label, options] of [
  ['nonzero exit with a plausible report', { execStatus: 7 }],
  ['missing final report', { writeReport: false }],
  ['empty final report', { report: ' \n\t' }],
  ['oversized final report', { report: 'x'.repeat(2 * 1024 * 1024 + 1) }],
  ['timed out CLI', { execStatus: null,
    execError: Object.assign(new Error('never-echo-this-process-value'), { code: 'ETIMEDOUT' }) }]
]) {
  test(`${label} produces a failed receipt`, async t => {
    const f = fixture(t), fake = fakeCodex(options);
    const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
    assert.equal(result.status, 'failed');
    assert.equal(fake.executions().length, 1);
    const receipt = readReceipt(result);
    assert.equal(receipt.status, 'failed');
    assertNoApproval(receipt);
    assert.doesNotMatch(JSON.stringify({ result, receipt }), /never-echo-this-process-value|untrusted CLI output|untrusted diagnostic output/);
    assertScratchRemoved(fake, f.root);
  });
}

test('a symlink final report is rejected before its external target is read', async t => {
  const f = fixture(t), target = path.join(f.root, 'example.cjs');
  const before = fs.readFileSync(target);
  let outputPath, outputReads = 0;
  const fake = fakeCodex({ writeReport: false, afterExec: call => {
    outputPath = call.outputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.symlinkSync(target, outputPath);
  } });
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    if (file === outputPath) outputReads++;
    return readFileSync.call(this, file, ...args);
  };
  let result;
  try {
    result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
  } finally {
    fs.readFileSync = readFileSync;
  }
  assert.equal(result.status, 'failed');
  assert.equal(outputReads, 0);
  assert.deepEqual(fs.readFileSync(target), before);
  assertNoApproval(readReceipt(result));
});

test('tracked changes made while reviewing invalidate the result', async t => {
  const f = fixture(t);
  const fake = fakeCodex({ afterExec: () => fs.writeFileSync(path.join(f.root, 'example.cjs'), 'changed during review\n') });
  const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'stale');
  assert.equal(readReceipt(result).status, 'stale');
  assertNoApproval(readReceipt(result));
  assert.equal(fs.readFileSync(path.join(f.root, 'example.cjs'), 'utf8'), 'changed during review\n',
    'the wrapper does not erase concurrent work');
});

test('a new clean commit made while reviewing also invalidates the old head', async t => {
  const f = fixture(t);
  const fake = fakeCodex({ afterExec: () => {
    fs.writeFileSync(path.join(f.root, 'example.cjs'), 'module.exports = 3;\n');
    git(f.root, ['add', 'example.cjs']);
    git(f.root, ['commit', '--quiet', '-m', 'Concurrent implementation']);
  } });
  const result = await runReview({ cwd: f.root, base: f.base, spawnSync: fake.spawnSync });
  assert.equal(git(f.root, ['status', '--porcelain=v1']), '');
  assert.notEqual(git(f.root, ['rev-parse', 'HEAD']), f.head);
  assert.equal(result.status, 'stale');
  const receipt = readReceipt(result);
  assert.equal(receipt.status, 'stale');
  assert.equal(receipt.headSha, f.head, 'the receipt keeps the originally reviewed SHA');
  assertNoApproval(receipt);
});

test('linked worktrees store review output in Git metadata and keep the worktree clean', async t => {
  const f = fixture(t), fake = fakeCodex();
  const linked = path.join(f.root, 'linked worktree');
  git(f.root, ['worktree', 'add', '--quiet', '--detach', linked, f.head]);
  const result = await runReview({ cwd: linked, base: f.base, spawnSync: fake.spawnSync });
  assert.equal(result.status, 'completed');
  const commonDir = path.resolve(linked, git(linked, ['rev-parse', '--git-common-dir']));
  assertInside(commonDir, result.receiptPath);
  assertInside(commonDir, result.reportPath);
  assert.equal(git(linked, ['status', '--porcelain=v1']), '');
  assertNoApproval(readReceipt(result));
});
