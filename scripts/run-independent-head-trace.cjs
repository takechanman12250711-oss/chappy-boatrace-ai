'use strict';

// Restore only the original trial's inputs on GitHub, never the complete history.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync, spawnSync} = require('node:child_process');
const archive = require('./daily-prediction-source-archive.js');

const REFERENCE_PATH = 'data/stats/independent-head-coverage-comparison.json';
const REFERENCE_SHA256 = '57e973ea28aabedcf9270e9c921e585e28bb988809861258f90a3aaca2aa3831';
const OUTPUT_PATH = 'data/stats/independent-head-coverage-trace.json';
const EXPECTED_ROWS = 626;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function readReference(root) {
  const bytes = fs.readFileSync(path.join(root, REFERENCE_PATH));
  if (digest(bytes) !== REFERENCE_SHA256) throw new Error('Original trial report SHA256 mismatch');
  const reference = JSON.parse(bytes);
  if (!Array.isArray(reference.rows) || reference.rows.length !== EXPECTED_ROWS) {
    throw new Error('Original trial denominator changed');
  }
  return reference;
}

function planInputRestore(reference) {
  if (!/^[0-9a-f]{40}$/.test(reference.sourceCommit || '')) throw new Error('Invalid original input commit');
  const files = [...new Set(reference.rows.map(row => row.sourcePointer?.path))].sort();
  for (const file of files) {
    if (typeof file !== 'string' || !(/^data\/predictions\/\d{8}\.json$/.test(file) ||
        /^data\/note-drafts\/\d{8}\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(file))) {
      throw new Error('Input pointer outside the original prediction/note allowlist');
    }
  }
  const dates = files.filter(file => file.startsWith('data/predictions/'))
    .map(file => path.posix.basename(file, '.json'));
  const possibleFiles = files.concat(dates.flatMap(date => [
    `data/predictions/source-archives/${date}.json.gz`,
    `data/predictions/source-archives/${date}.meta.json`
  ]));
  return {sourceCommit: reference.sourceCommit, files, dates, possibleFiles};
}

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024});
}

function restoreReferenceInputs(root, reference) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Real input restoration is GitHub Actions only');
  const plan = planInputRestore(reference);
  git(root, ['fetch', '--no-tags', '--filter=blob:none', '--depth=1', 'origin', plan.sourceCommit]);
  const available = new Set(git(root, ['ls-tree', '-r', '--name-only', plan.sourceCommit, '--', ...plan.possibleFiles])
    .trim().split('\n').filter(Boolean));
  const receipts = [];
  function materialize(file) {
    if (!available.has(file)) return false;
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    const fd = fs.openSync(destination, 'w');
    let result;
    try {
      result = spawnSync('git', ['show', `${plan.sourceCommit}:${file}`], {
        cwd: root, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024
      });
    } finally { fs.closeSync(fd); }
    if (result.status !== 0 || result.error) {
      fs.rmSync(destination, {force: true});
      throw new Error(`Original input blob restoration failed: ${file}`);
    }
    return true;
  }
  // One daily archive at a time; raw JSON is streamed to disk, never buffered by git.
  for (const date of plan.dates) {
    const rawPath = `data/predictions/${date}.json`;
    const gzipPath = `data/predictions/source-archives/${date}.json.gz`;
    const metaPath = `data/predictions/source-archives/${date}.meta.json`;
    if (available.has(gzipPath) !== available.has(metaPath)) throw new Error(`Incomplete original archive: ${date}`);
    if (available.has(gzipPath)) {
      materialize(gzipPath);
      materialize(metaPath);
      const restored = archive.restorePredictionSource({rootDirectory: root, date});
      receipts.push({path: rawPath, status: restored.status, sourceSha256: restored.metadata.sourceSha256});
    } else {
      receipts.push({path: rawPath, status: materialize(rawPath) ? 'original-raw-blob' : 'missing-original-input'});
    }
  }
  for (const file of plan.files.filter(file => file.startsWith('data/note-drafts/'))) {
    receipts.push({path: file, status: materialize(file) ? 'original-note-blob' : 'missing-original-input'});
  }
  return {sourceCommit: plan.sourceCommit, requestedFiles: plan.files.length, files: receipts};
}

async function main(root = path.resolve(__dirname, '..')) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Real trace execution is GitHub Actions only');
  const trace = require('./trace-independent-head-coverage.cjs');
  const referenceReport = readReference(root);
  trace.verifyReferenceSources(root, referenceReport);
  const inputRestore = restoreReferenceInputs(root, referenceReport);
  const sourceCommit = git(root, ['rev-parse', 'HEAD']).trim();
  const report = await trace.build(root, {referenceReport, sourceCommit});
  report.referenceArtifact = {
    path: REFERENCE_PATH, sha256: REFERENCE_SHA256, sourceRunId: '39377459439',
    sourceArtifactId: '12244097509', originalInputCommit: referenceReport.sourceCommit
  };
  report.inputRestore = inputRestore;
  fs.mkdirSync(path.join(root, 'data/stats'), {recursive: true});
  fs.writeFileSync(path.join(root, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({path: OUTPUT_PATH, sha256: digest(fs.readFileSync(path.join(root, OUTPUT_PATH))),
    originalRows: referenceReport.rows.length, summary: report.summary}));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {REFERENCE_PATH, REFERENCE_SHA256, OUTPUT_PATH, EXPECTED_ROWS, readReference, planInputRestore, restoreReferenceInputs, main};
