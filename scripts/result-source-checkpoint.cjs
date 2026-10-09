'use strict';

// This is a separate, official-result-only handoff. Never grant the report
// publisher permission to write source data or transfer a prediction snapshot.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { normalizeDateKey, getRecentDateKeys, isCompleteResultFile } = require('./repair-recent-results');
const { validateQueue, assertRepairableResultFile } = require('./repair-queued-results');
const { mergeOfficialResults, resultRaceKey } = require('./collect-results');
const VERSION = 'official-result-source-checkpoint-v1';
const RECEIPT = 'data/stats/result-source-checkpoint.json';
const CODE_PATHS = ['scripts', 'js', 'api', 'config', '.github/workflows/collect-results.yml'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trimEnd();
const blob = (root, ref, file) => {
  const row = git(root, ['ls-tree', ref, '--', file]);
  if (!row) return null;
  const match = /^100644 blob ([a-f0-9]{40})\t/.exec(row);
  if (!match) throw Error(`Not a regular source file: ${file}`);
  return match[1];
};
const validBlob = value => value === null || (typeof value === 'string' && /^[a-f0-9]{40}$/.test(value));
function identity(context, requireArtifact = false) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository || '') ||
      !/^[1-9]\d*$/.test(String(context.runId || '')) || !/^[1-9]\d*$/.test(String(context.runAttempt || '')) ||
      !/^[a-f0-9]{40}$/.test(context.sourceSha || '') ||
      !/^\d{8}$/.test(context.anchorDate || '') || normalizeDateKey(context.anchorDate) !== context.anchorDate ||
      (requireArtifact && !/^[1-9]\d*$/.test(String(context.artifactId || '')))) throw Error('Invalid source checkpoint context');
}
function targetDates(root, anchorDate) {
  const queue = validateQueue(JSON.parse(fs.readFileSync(path.join(root, 'config/result-repair-queue.json'), 'utf8')));
  for (const entry of queue) normalizeDateKey(entry.date);
  return { recent: getRecentDateKeys(anchorDate), queue,
    dates: [...new Set([...getRecentDateKeys(anchorDate), ...queue.filter(x => x.enabled).map(x => x.date)])].sort() };
}
function validateResult(content, date) {
  const data = JSON.parse(content);
  if (data?.source !== 'boatrace-official' || data.date !== date || !Array.isArray(data.races) || !data.races.length ||
      data.races.length > 288 || !Array.isArray(data.venues)) throw Error(`Invalid official result: ${date}`);
  const keys = data.races.map(resultRaceKey);
  if (keys.some(key => !/^(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(key)) || new Set(keys).size !== keys.length)
    throw Error(`Invalid official race identity: ${date}`);
  if (data.races.some(r => String(r.date || date) !== date || r.source && r.source !== 'boatrace-official'))
    throw Error(`Invalid official race date/source: ${date}`);
  const normalized = mergeOfficialResults(null, data);
  for (const key of ['raceCount', 'completedRaces', 'voidRaces', 'resolvedRaces', 'pendingRaces', 'failedRaces', 'complete']) {
    if (data[key] !== normalized[key]) throw Error(`Invalid official result counts: ${date}/${key}`);
  }
  return data;
}
function acquire({ root = process.cwd(), context, output, run = (script, args) =>
  execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd: root, env: process.env, stdio: 'inherit' }) }) {
  identity(context);
  if (git(root, ['rev-parse', 'HEAD']) !== context.sourceSha || git(root, ['status', '--porcelain']))
    throw Error('Acquisition checkout must be clean and pinned');
  const targets = targetDates(root, context.anchorDate);
  const bases = new Map(targets.dates.map(date => [date, blob(root, 'HEAD', `data/results/${date}.json`)]));
  // Keep correction refreshes for complete recent days and the existing three
  // request workers inside collect-results.js. No prediction archive is restored.
  for (const date of targets.recent) run('collect-results.js', [`--date=${date}`]);
  for (const entry of targets.queue) {
    if (!entry.enabled) continue;
    const file = path.join(root, `data/results/${entry.date}.json`);
    if (isCompleteResultFile(file, entry.date)) continue;
    assertRepairableResultFile(file, entry.date);
    run('collect-results.js', [`--date=${entry.date}`]);
    if (!isCompleteResultFile(file, entry.date)) throw Error(`${entry.date}: queued official result remains incomplete`);
  }
  const files = targets.dates.map(date => {
    const file = `data/results/${date}.json`;
    const absolute = path.join(root, file);
    if (!fs.lstatSync(absolute).isFile()) throw Error('Nonregular source output');
    const content = fs.readFileSync(absolute, 'utf8');
    validateResult(content, date);
    return { path: file, date, baseBlob: bases.get(date), sha256: sha256(content), content };
  });
  const changed = git(root, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean).map(x => x.slice(3));
  if (changed.some(file => !files.some(x => x.path === file))) throw Error('Unexpected acquisition changes');
  const bundle = { version: VERSION, repository: context.repository, runId: String(context.runId), runAttempt: String(context.runAttempt),
    sourceSha: context.sourceSha, anchorDate: context.anchorDate, createdAt: new Date().toISOString(),
    receiptBaseBlob: blob(root, 'HEAD', RECEIPT), files };
  validate({ root, bundle, context });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(bundle) + '\n');
  return { sourceSha: context.sourceSha, anchorDate: context.anchorDate, files: files.length };
}
function validate({ root, bundle, context }) {
  identity(context);
  const fields = ['version', 'repository', 'runId', 'runAttempt', 'sourceSha', 'anchorDate', 'createdAt', 'receiptBaseBlob', 'files'];
  if (!bundle || Object.keys(bundle).some(key => !fields.includes(key)) || bundle.version !== VERSION ||
      ['repository', 'runId', 'runAttempt', 'sourceSha', 'anchorDate'].some(key => bundle[key] !== String(context[key])) ||
      !Number.isFinite(Date.parse(bundle.createdAt)) || !validBlob(bundle.receiptBaseBlob) || !Array.isArray(bundle.files))
    throw Error('Invalid source checkpoint identity');
  const { dates } = targetDates(root, context.anchorDate);
  if (bundle.files.length !== dates.length) throw Error('Incomplete source checkpoint dates');
  const seen = new Set();
  for (const file of bundle.files) {
    if (Object.keys(file).some(key => !['path', 'date', 'baseBlob', 'sha256', 'content'].includes(key)) ||
        !dates.includes(file.date) || file.path !== `data/results/${file.date}.json` || seen.has(file.date) ||
        !validBlob(file.baseBlob) || typeof file.content !== 'string' || Buffer.byteLength(file.content) > 16 * 1024 * 1024 ||
        file.sha256 !== sha256(file.content)) throw Error('Invalid source checkpoint file');
    seen.add(file.date);
    validateResult(file.content, file.date);
  }
}
function apply({ root = process.cwd(), bundle, context }) {
  identity(context, true);
  validate({ root, bundle, context });
  if (git(root, ['status', '--porcelain'])) throw Error('Source publication checkout must be clean');
  if (git(root, ['diff', '--name-only', context.sourceSha, 'HEAD', '--', ...CODE_PATHS]))
    throw Error('Source code changed after acquisition; collect again from current main');
  if (blob(root, context.sourceSha, RECEIPT) !== bundle.receiptBaseBlob || blob(root, 'HEAD', RECEIPT) !== bundle.receiptBaseBlob)
    throw Error('Source receipt changed after acquisition');
  for (const file of bundle.files) {
    if (blob(root, context.sourceSha, file.path) !== file.baseBlob) throw Error(`Incorrect source blob: ${file.path}`);
    if (blob(root, 'HEAD', file.path) !== file.baseBlob) throw Error(`Official result changed after acquisition: ${file.path}`);
  }
  // Validate the whole batch before writing anything; apply only result bytes.
  for (const file of bundle.files) {
    const absolute = path.join(root, file.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.content);
  }
  const receipt = { version: VERSION, repository: context.repository, runId: String(context.runId), runAttempt: String(context.runAttempt),
    artifactId: String(context.artifactId), sourceSha: context.sourceSha, anchorDate: context.anchorDate, fetchedAt: bundle.createdAt,
    appliedFromSha: git(root, ['rev-parse', 'HEAD']), appliedAt: new Date().toISOString(),
    files: bundle.files.map(({ path, date, baseBlob, sha256 }) => ({ path, date, baseBlob, sha256 })) };
  fs.mkdirSync(path.dirname(path.join(root, RECEIPT)), { recursive: true });
  fs.writeFileSync(path.join(root, RECEIPT), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
function guardPush({ root = process.cwd(), bundle, context, destination = 'refs/remotes/origin/main' }) {
  identity(context, true);
  validate({ root, bundle, context });
  if (git(root, ['diff', '--name-only', context.sourceSha, destination, '--', ...CODE_PATHS]))
    throw Error('Source code changed before push');
  if (blob(root, destination, RECEIPT) !== bundle.receiptBaseBlob) throw Error('Source receipt changed before push');
  for (const file of bundle.files) {
    if (blob(root, context.sourceSha, file.path) !== file.baseBlob || blob(root, destination, file.path) !== file.baseBlob)
      throw Error(`Official result changed before push: ${file.path}`);
  }
  return { checkedDestination: git(root, ['rev-parse', destination]) };
}

if (require.main === module) {
  try {
    const [command, file] = process.argv.slice(2);
    const context = { repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.SOURCE_RUN_ATTEMPT || process.env.GITHUB_RUN_ATTEMPT, sourceSha: process.env.SOURCE_SHA,
      anchorDate: process.env.SOURCE_DATE, artifactId: process.env.SOURCE_ARTIFACT_ID };
    if (command !== 'acquire' && (!/^[1-9]\d*$/.test(process.env.SOURCE_RUN_ATTEMPT || '') ||
        !/^[1-9]\d*$/.test(process.env.GITHUB_RUN_ATTEMPT || '') ||
        BigInt(process.env.SOURCE_RUN_ATTEMPT) > BigInt(process.env.GITHUB_RUN_ATTEMPT)))
      throw Error('Invalid acquisition attempt output');
    const result = command === 'acquire' ? acquire({ context, output: file }) : command === 'apply'
      ? apply({ context, bundle: JSON.parse(fs.readFileSync(file, 'utf8')) }) : command === 'guard-push'
      ? guardPush({ context, bundle: JSON.parse(fs.readFileSync(file, 'utf8')) }) : (() => { throw Error('Use acquire, apply or guard-push'); })();
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { VERSION, RECEIPT, CODE_PATHS, sha256, targetDates, validateResult, acquire, validate, apply, guardPush };
