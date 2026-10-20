'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const MAX_CAPTURE_BYTES = 1024 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const REVIEW_TIMEOUT_MS = 10 * 60 * 1000;
const VERSION = 'claude-codex-review-v1';

function runReview({ cwd = process.cwd(), base = 'origin/main', spawnSync = childProcess.spawnSync,
  now = () => new Date() } = {}) {
  const git = (args, directory = cwd) => spawnSync('git', args, {
    cwd: directory, encoding: 'utf8', timeout: 30000, maxBuffer: MAX_CAPTURE_BYTES,
    shell: false, windowsHide: true
  });
  const ok = result => result && !result.error && !result.signal && result.status === 0;
  const value = result => typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  const failure = reason => ({ status: 'failed', reason });
  let root, headSha, baseSha, commonDir;
  try {
    const rootResult = git(['rev-parse', '--show-toplevel']);
    if (!ok(rootResult)) return failure('not-a-git-repository');
    root = fs.realpathSync(value(rootResult));
    const headResult = git(['rev-parse', '--verify', 'HEAD^{commit}'], root);
    const baseResult = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], root);
    if (!ok(headResult) || !/^[0-9a-f]{40,64}$/.test(value(headResult))) return failure('invalid-head');
    headSha = value(headResult);
    if (!ok(baseResult) || !/^[0-9a-f]{40,64}$/.test(value(baseResult))) return failure('invalid-base');
    baseSha = value(baseResult);
    if (!ok(git(['merge-base', '--is-ancestor', baseSha, headSha], root))) {
      return { ...failure('base-not-ancestor'), baseSha, headSha };
    }
    const commonResult = git(['rev-parse', '--git-common-dir'], root);
    if (!ok(commonResult)) return failure('git-directory-unavailable');
    commonDir = fs.realpathSync(path.resolve(root, value(commonResult)));
  } catch {
    return failure('repository-preflight-failed');
  }

  const startedAt = now().toISOString();
  const runDir = path.join(commonDir, 'chappy-agent-reviews',
    `${startedAt.replace(/[^0-9TZ]/g, '')}-${crypto.randomUUID()}`);
  const reportPath = path.join(runDir, 'review.md');
  const receiptPath = path.join(runDir, 'receipt.json');
  const receipt = {
    version: VERSION, reviewer: 'codex', requiredAuthentication: 'chatgpt', authentication: 'unverified',
    status: 'failed', reason: 'review-not-completed', baseSha, headSha,
    startedAt, finishedAt: null, sandbox: 'read-only', approvalPolicy: 'never',
    modelProvider: 'openai', configurationIsolation: 'scratch-cwd-without-user-config-or-rules',
    ephemeral: true, mergeApproved: false, productionChanged: false, report: null
  };
  function saveReceipt() {
    const temporary = path.join(runDir, 'receipt.tmp');
    fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, receiptPath);
  }
  function finish(status, reason, extra = {}) {
    Object.assign(receipt, { status, reason, finishedAt: now().toISOString() }, extra);
    try { saveReceipt(); }
    catch { return { status: 'failed', reason: 'receipt-write-failed', baseSha, headSha }; }
    return { status, reason, baseSha, headSha, receiptPath, reportPath };
  }
  try {
    fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
    saveReceipt();
  } catch {
    return { ...failure('receipt-write-failed'), baseSha, headSha };
  }

  function state() {
    const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], root);
    const status = git(['status', '--porcelain=v1', '--untracked-files=normal'], root);
    return { available: ok(head) && ok(status), headSha: value(head), dirty: value(status) !== '' };
  }
  let executionDir;
  try {
    const before = state();
    if (!before.available) return finish('failed', 'repository-state-unavailable');
    if (before.headSha !== headSha) return finish('stale', 'repository-changed');
    if (before.dirty) return finish('failed', 'dirty-worktree');

    // Start outside the repository so its .codex configuration cannot enable
    // hooks, MCP servers or another model provider before the review begins.
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const relativeTemporary = path.relative(root, temporaryRoot);
    if (!relativeTemporary || (!relativeTemporary.startsWith(`..${path.sep}`) &&
      relativeTemporary !== '..' && !path.isAbsolute(relativeTemporary))) {
      return finish('failed', 'temporary-directory-not-isolated');
    }
    executionDir = fs.mkdtempSync(path.join(temporaryRoot, 'chappy-codex-review-'));
    fs.chmodSync(executionDir, 0o700);

    // Require the OpenAI provider and ChatGPT login in both the status probe and
    // execution. Never echo auth diagnostics or fall back to API billing.
    const authenticationConfig = ['-c', 'model_provider="openai"',
      '-c', 'forced_login_method="chatgpt"'];
    const auth = spawnSync('codex', [...authenticationConfig, 'login', 'status'], {
      cwd: executionDir, encoding: 'utf8', timeout: 30000, maxBuffer: MAX_CAPTURE_BYTES,
      shell: false, windowsHide: true
    });
    const authentication = `${typeof auth?.stdout === 'string' ? auth.stdout : ''}\n` +
      `${typeof auth?.stderr === 'string' ? auth.stderr : ''}`;
    if (!ok(auth) || !/^Logged in using ChatGPT\b/m.test(authentication)) {
      return finish('failed', 'chatgpt-authentication-required');
    }
    receipt.authentication = 'chatgpt';

    const prompt = [
      'You are the independent Codex reviewer for a Claude Code implementation.',
      `Repository root (JSON string): ${JSON.stringify(root)}`,
      `Read ${JSON.stringify(path.join(root, 'AGENTS.md'))} and follow the repository instructions.`,
      'The execution directory is an isolated scratch directory, not the repository.',
      'For every Git command, pass -C with the absolute repository root above; do not change the execution working directory.',
      `Review the committed changes from immutable base ${baseSha} to immutable HEAD ${headSha}.`,
      `Use git -C <repository-root> diff ${baseSha}...${headSha}; the worktree was required to be clean.`,
      'Inspect only. Do not modify files, commit, push, merge, send external messages,',
      'install packages, invoke another AI agent, or run bulk/full-history data analysis.',
      'Find actionable regressions and bugs. Give file paths, line numbers, impact, and needed validation.',
      'Distinguish checks you actually ran from proposed checks. If no issues are found, state the limits of the review.',
      'The review does not approve a merge, publication, spending, or changes to prediction rules.',
      'Return the review as your final message.'
    ].join('\n') + '\n';
    const command = ['--no-daemon', '--ask-for-approval', 'never', 'exec', '--sandbox', 'read-only',
      '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      ...authenticationConfig,
      '-c', 'project_root_markers=[]', '--color', 'never', '--cd', executionDir,
      '--output-last-message', reportPath, '-'];
    // The final message is written by the CLI to reportPath. Discard process
    // streams so verbose events or auth diagnostics are neither retained nor leaked.
    const execution = spawnSync('codex', command, {
      cwd: executionDir, input: prompt, encoding: 'utf8', timeout: REVIEW_TIMEOUT_MS,
      maxBuffer: MAX_CAPTURE_BYTES, stdio: ['pipe', 'ignore', 'ignore'],
      shell: false, windowsHide: true
    });

    const after = state();
    if (!after.available) return finish('stale', 'repository-state-unavailable');
    if (after.headSha !== headSha || after.dirty) return finish('stale', 'repository-changed');
    if (!ok(execution)) {
      return finish('failed', 'codex-execution-failed', {
        exitCode: Number.isInteger(execution?.status) ? execution.status : null,
        signal: typeof execution?.signal === 'string' ? execution.signal : null
      });
    }
    let report;
    try {
      const info = fs.lstatSync(reportPath);
      if (!info.isFile() || info.isSymbolicLink()) return finish('failed', 'invalid-report-file');
      if (info.size > MAX_REPORT_BYTES) return finish('failed', 'report-too-large');
      report = fs.readFileSync(reportPath);
      if (!report.toString('utf8').trim()) return finish('failed', 'empty-report');
      fs.chmodSync(reportPath, 0o600);
    } catch {
      return finish('failed', 'report-unavailable');
    }
    return finish('completed', null, { report: {
      file: 'review.md', sha256: crypto.createHash('sha256').update(report).digest('hex'), bytes: report.length
    } });
  } catch {
    return finish('failed', 'review-process-failed');
  } finally {
    if (executionDir) {
      try { fs.rmSync(executionDir, { recursive: true, force: true }); }
      catch { /* A cleanup failure must not expose captured CLI diagnostics. */ }
    }
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    process.stdout.write('Usage: node scripts/claude-codex-review.cjs [--base <ancestor-ref>]\n');
    return 0;
  }
  let base = 'origin/main';
  if (argv.length === 2 && argv[0] === '--base' && argv[1]) base = argv[1];
  else if (argv.length !== 0) {
    process.stdout.write(JSON.stringify({ status: 'failed', reason: 'invalid-arguments' }) + '\n');
    return 1;
  }
  const result = runReview({ base });
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.status === 'completed' ? 0 : 1;
}

if (require.main === module) process.exitCode = main();
module.exports = { runReview, main, MAX_REPORT_BYTES };
