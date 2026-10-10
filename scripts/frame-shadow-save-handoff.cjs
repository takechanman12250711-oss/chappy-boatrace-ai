'use strict';

// Ordering evidence only. This does not establish a race-deadline capture or
// change which research rows qualify. Never infer the date from run_started_at.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const archive = require('./daily-prediction-source-archive');
const VERSION = 'frame-shadow-save-handoff-v1';
const WORKFLOW = 'Collect frame rise fall shadow A/B';
const WORKFLOW_PATH = '.github/workflows/collect-frame-rise-fall-shadow-ab.yml';
const RECEIPT_FILE = 'frame-shadow-save.json';
const GENERATION_PATHS = [
  'js', 'scripts', 'config', 'api', WORKFLOW_PATH,
  '.github/workflows/collect-frame-rise-fall-negative-clip-ab.yml',
  'data/stats/theory-improvement-proposal-phase9.json',
  'data/stats/theory-candidate-branch-analysis-phase9.json',
];
const id = value => /^[1-9]\d*$/.test(String(value || ''));
const sha = value => /^[a-f0-9]{40}$/.test(value || '');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trimEnd();
const skip = reason => ({ allowed: false, reason });

function admission({ eventName, event = {}, repository }) {
  if (eventName === 'pull_request') return { allowed: true, mode: 'verify-only' };
  if (eventName === 'workflow_dispatch') return { allowed: true, mode: 'manual' };
  if (eventName !== 'workflow_run' || event.action !== 'completed') return skip('not-completed-workflow-run');
  const run = event.workflow_run || {};
  if (run.name !== WORKFLOW || run.path !== WORKFLOW_PATH) return skip('unexpected-upstream-workflow');
  if (run.event !== 'workflow_run') return skip('upstream-pr-or-manual-not-chained');
  if (run.head_branch !== 'main') return skip('upstream-not-main');
  if (!repository || run.head_repository?.full_name !== repository || event.repository?.full_name !== repository)
    return skip('upstream-repository-mismatch');
  if (run.status !== 'completed' || run.conclusion !== 'success') return skip(`upstream-${run.conclusion || run.status || 'unknown'}`);
  if (!id(run.id) || !id(run.run_attempt) || !sha(run.head_sha)) throw new Error('Invalid upstream run identity');
  // Bot actors are legitimate. Do not use actor/triggering_actor as a filter.
  return { allowed: true, mode: 'automatic' };
}

function artifactName(runId, attempt) {
  if (!id(runId) || !id(attempt)) throw new Error('Invalid receipt run/attempt');
  return `frame-shadow-save-${runId}-${attempt}`;
}
function selectArtifact(artifacts, run) {
  const matches = artifacts.filter(item => item.name === artifactName(run.id, run.run_attempt));
  if (matches.length !== 1) throw new Error('Missing or ambiguous exact frame save artifact');
  const item = matches[0];
  if (!id(item.id) || item.expired !== false || item.workflow_run?.id !== run.id ||
      item.workflow_run?.head_sha !== run.head_sha || item.workflow_run?.head_branch !== 'main' ||
      !/^sha256:[a-f0-9]{64}$/.test(item.digest || '') ||
      !Number.isInteger(item.size_in_bytes) || item.size_in_bytes <= 0 || item.size_in_bytes > 1024 * 1024)
    throw new Error('Invalid frame save artifact identity/digest');
  return item;
}
function verifyArtifact(bytes, item) {
  // download-artifact warns on a bad digest. This handoff must fail closed.
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== item.digest)
    throw new Error('Frame save artifact digest mismatch');
}

function guardedPaths(date) {
  if (!/^\d{8}$/.test(date || '')) throw new Error('Invalid receipt date');
  return [
    `data/predictions/${date}.json`,
    `data/predictions/source-archives/${date}.json.gz`,
    `data/predictions/source-archives/${date}.meta.json`,
    // Tree IDs bind the code/config generation without loading large blobs.
    ...GENERATION_PATHS,
    'data/stats/theory-ab-phase10.json',
    'data/stats/frame-rise-fall-shadow-snapshot-archive.json',
  ];
}
function identities(root, ref, date) {
  return guardedPaths(date).map(file => {
    const row = git(root, ['ls-tree', ref, '--', file]);
    if (!row) return { path: file, object: null };
    const match = /^(100644 blob|040000 tree) ([a-f0-9]{40})\t/.exec(row);
    if (!match) throw new Error(`Nonregular handoff source: ${file}`);
    return { path: file, object: match[2] };
  });
}
function ensureSavedCommit(root, savedSha) {
  if (!sha(savedSha)) throw new Error('Invalid saved commit');
  try { git(root, ['cat-file', '-e', `${savedSha}^{commit}`]); }
  catch { git(root, ['fetch', '--no-tags', '--depth=1', '--filter=blob:none', 'origin', savedSha]); }
}
function createReceipt({ root = process.cwd(), date, frozenAt, captureSha, env = process.env, now = new Date() }) {
  const savedSha = git(root, ['rev-parse', 'HEAD']);
  if (!sha(savedSha) || !sha(captureSha) || !sha(env.GITHUB_SHA) || env.GITHUB_EVENT_NAME !== 'workflow_run' || !id(env.GITHUB_RUN_ID) || !id(env.GITHUB_RUN_ATTEMPT) ||
      !env.GITHUB_REPOSITORY || !Number.isFinite(Date.parse(frozenAt)) ||
      archive.getJstDate(new Date(frozenAt)) !== date || now < new Date(frozenAt))
    throw new Error('Invalid frame save receipt identity/date');
  const guards = identities(root, savedSha, date);
  const captured = identities(root, captureSha, date);
  // Rebase may bring unrelated commits. Never attest to code/candidate inputs
  // that changed after the frame computation, even if the save itself succeeded.
  for (let index = 3; index < 3 + GENERATION_PATHS.length; index++) {
    if (captured[index].object !== guards[index].object) throw new Error('Frame generation changed during save');
  }
  const [raw, gzip, meta] = guards;
  if (Boolean(gzip.object) !== Boolean(meta.object)) throw new Error('Incomplete saved frame source archive');
  return {
    version: VERSION, repository: env.GITHUB_REPOSITORY,
    workflow: WORKFLOW, event: env.GITHUB_EVENT_NAME,
    runId: String(env.GITHUB_RUN_ID), runAttempt: String(env.GITHUB_RUN_ATTEMPT),
    workflowSha: env.GITHUB_SHA, captureSha, savedSha, date, frozenAt, savedAt: now.toISOString(),
    status: raw.object || gzip.object ? 'saved' : 'source-missing', guards,
  };
}
function validateReceipt({ receipt, root = process.cwd(), run, repository, date, now = new Date() }) {
  if (!receipt || receipt.version !== VERSION || receipt.repository !== repository ||
      receipt.workflow !== WORKFLOW || receipt.event !== 'workflow_run' ||
      receipt.runId !== String(run.id) || receipt.runAttempt !== String(run.run_attempt) ||
      receipt.workflowSha !== run.head_sha || !sha(receipt.captureSha) || !sha(receipt.savedSha) ||
      !/^\d{8}$/.test(receipt.date || '') ||
      !Number.isFinite(Date.parse(receipt.frozenAt)) || !Number.isFinite(Date.parse(receipt.savedAt)) ||
      new Date(receipt.savedAt) < new Date(receipt.frozenAt) || new Date(receipt.savedAt) > now ||
      archive.getJstDate(new Date(receipt.frozenAt)) !== receipt.date ||
      !['saved', 'source-missing'].includes(receipt.status)) throw new Error('Frame save receipt identity mismatch');
  const paths = guardedPaths(receipt.date);
  if (!Array.isArray(receipt.guards) || receipt.guards.length !== paths.length ||
      receipt.guards.some((guard, index) => guard.path !== paths[index] || (guard.object !== null && !sha(guard.object))))
    throw new Error('Invalid frame save source guards');
  if (Boolean(receipt.guards[1].object) !== Boolean(receipt.guards[2].object)) throw new Error('Incomplete receipt source archive');
  if (receipt.status === 'source-missing') {
    if (receipt.guards.slice(0, 3).some(guard => guard.object)) throw new Error('Invalid missing-source receipt');
    return skip('frame-source-missing');
  }
  if (!receipt.guards[0].object && !receipt.guards[1].object) throw new Error('Receipt has no saved source');
  if (date !== archive.getJstDate(now) || receipt.date !== date) return skip('frame-date-is-not-current-jst');
  const saved = identities(root, receipt.savedSha, date);
  if (saved.some((guard, index) => guard.object !== receipt.guards[index].object))
    throw new Error('Receipt guards do not match saved commit');
  const current = identities(root, 'HEAD', date);
  const changed = current.find((guard, index) => guard.object !== receipt.guards[index].object);
  if (changed) return skip(`frame-source-or-generation-changed:${changed.path}`);
  return { allowed: true, reason: 'exact-frame-save-verified', savedSha: receipt.savedSha };
}
function report(result, env = process.env) {
  const message = `Negative clip handoff: ${result.allowed ? 'ready' : 'SKIPPED'} (${result.reason || result.mode}).`;
  console.log(message);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, message + '\n');
  if (env.GITHUB_OUTPUT) for (const [key, value] of Object.entries(result)) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  return result;
}
function main() {
  const [command, file] = process.argv.slice(2);
  const env = process.env;
  const event = () => JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  if (command === 'admit') return report(admission({ eventName: env.GITHUB_EVENT_NAME, event: event(), repository: env.GITHUB_REPOSITORY }));
  if (command === 'freeze') {
    const now = new Date();
    const date = archive.resolveTargetDate({ now });
    fs.appendFileSync(env.GITHUB_OUTPUT, `date=${date}\nfrozen_at=${now.toISOString()}\ncapture_sha=${git(process.cwd(), ['rev-parse', 'HEAD'])}\n`);
    return;
  }
  if (command === 'receipt') {
    const receipt = createReceipt({ date: env.PREDICT_DATE, frozenAt: env.FROZEN_AT, captureSha: env.CAPTURE_SHA });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(receipt) + '\n');
    return;
  }
  if (command === 'ready') {
    const admitted = admission({ eventName: env.GITHUB_EVENT_NAME, event: event(), repository: env.GITHUB_REPOSITORY });
    if (!admitted.allowed || admitted.mode === 'verify-only') return report(skip(admitted.reason || 'pr-verification-only'));
    if (admitted.mode === 'manual') return report({ allowed: true, reason: 'explicit-manual-date' });
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    ensureSavedCommit(process.cwd(), receipt.savedSha);
    return report(validateReceipt({ receipt, run: event().workflow_run,
      repository: env.GITHUB_REPOSITORY, date: env.PREDICT_DATE }));
  }
  throw new Error('Unknown handoff command');
}
if (require.main === module) {
  try { main(); } catch (error) {
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Negative clip handoff FAILED: ${error.message}\n`);
    throw error;
  }
}
module.exports = { VERSION, WORKFLOW, WORKFLOW_PATH, RECEIPT_FILE, admission, artifactName, selectArtifact,
  verifyArtifact, guardedPaths, identities, ensureSavedCommit, createReceipt, validateReceipt, report };
