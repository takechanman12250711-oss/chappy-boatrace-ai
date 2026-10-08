'use strict';

// Heavy builders run against a saved source commit without the main writer lock.
// Only this bounded publication step enters the shared writer queue.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const VERSION = 'result-report-checkpoint-v1';
// Fixed, single-output audit profiles. Artifact contents cannot select a receipt
// path or borrow another audit's report/official-result checkpoint permissions.
const AUDIT_PROFILES = new Map([
  ['local-water-strong-condition-cohort', 'data/stats/local-water-strong-condition-cohort.json'],
  ['local-water-outer-head-candidate-ranking-audit', 'data/stats/local-water-outer-head-candidate-ranking-audit.json'],
  ['outer-head-drop-stage-audit', 'data/stats/outer-head-drop-stage-audit.json'],
  ['local-water-outer-head-stage-audit', 'data/stats/local-water-outer-head-stage-audit.json'],
  ['local-water-main-head-selection-audit', 'data/stats/local-water-main-head-selection-audit.json'],
  ['local-water-result-breakdown', 'data/stats/local-water-result-breakdown.json'],
  ['local-water-outer-head-bottleneck-audit', 'data/stats/local-water-outer-head-bottleneck-audit.json'],
]);
const STAGES = new Set(['diagnostics', 'calibration', ...AUDIT_PROFILES.keys()]);
// These existing builder outputs are derived reports, despite their directory.
// Only the calibration stage may publish them; daily/source prediction data is
// never permitted through this report checkpoint.
const CALIBRATION_REPORTS = new Set([
  'data/predictions/calibration.json',
  'data/predictions/improvement-review.json',
]);
// This standalone report also belongs to the live prediction writer. Preserve
// its newer generation; interdependent diagnostic reports must fail as a batch.
const KEEP_NEWER = new Set([
  'data/stats/practical-priority-shadow-report.json',
]);
const CODE_PATHS = ['scripts', 'js', 'api', 'config', '.github/workflows/collect-results.yml'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const receiptPath = stage => AUDIT_PROFILES.has(stage)
  ? `data/stats/audit-checkpoints/${stage}.json` : `data/stats/result-${stage}-checkpoint.json`;
const codePaths = stage => AUDIT_PROFILES.has(stage)
  ? [...CODE_PATHS, `.github/workflows/check-${stage}.yml`] : CODE_PATHS;
const validBlob = value => value === null || (typeof value === 'string' && /^[a-f0-9]{40}$/.test(value));
function allowed(file, stage) {
  if (AUDIT_PROFILES.has(stage)) return file === AUDIT_PROFILES.get(stage);
  return (/^data\/stats\/[a-z0-9][a-z0-9.-]*\.json$/.test(file) &&
    !/^data\/stats\/result-(diagnostics|calibration)-checkpoint\.json$/.test(file)) ||
    file === 'data/analysis/reference-tag-effectiveness.json' ||
    (stage === 'calibration' && CALIBRATION_REPORTS.has(file));
}
function blob(cwd, ref, file) {
  const row = git(cwd, ['ls-tree', ref, '--', file]);
  if (!row) return null;
  const match = /^100644 blob ([a-f0-9]{40})\t/.exec(row);
  if (!match) throw new Error(`Not a regular data file: ${file}`);
  return match[1];
}
function changed(cwd, audit = false) {
  return [...new Set([
    ...git(cwd, ['diff', '--name-only', '-z', 'HEAD']).split('\0'),
    // A staged change can be hidden by restoring only the working-tree bytes.
    ...(audit ? git(cwd, ['diff', '--cached', '--name-only', '-z']).split('\0') : []),
    ...(audit ? git(cwd, ['diff', '--name-only', '-z']).split('\0') : []),
    ...git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))].sort();
}
function pack({ root = process.cwd(), stage, output }) {
  if (!STAGES.has(stage)) throw new Error('Unknown checkpoint stage');
  const baseSha = git(root, ['rev-parse', 'HEAD']);
  const audit = AUDIT_PROFILES.has(stage);
  const paths = changed(root, audit);
  // prepare --all normalizes restored archives but also stages predictions.
  // Audit compute is disposable: refuse every remaining change except its one
  // report, including index derivatives and staged/unstaged source archives.
  if (audit) {
    const unexpected = paths.filter(file => !allowed(file, stage));
    if (unexpected.length) throw new Error(`Unsaved source or unexpected audit changes: ${unexpected.join(', ')}`);
  }
  // Prediction/result originals must have been saved in the source checkpoint.
  // A report artifact must never smuggle old originals into a newer main.
  const originalChanges = paths.filter(file => /^data\/(results|predictions)\//.test(file) &&
    !/^data\/predictions\/(index(?:-manifest)?\.json|index-shards\/)/.test(file) &&
    !(stage === 'calibration' && CALIBRATION_REPORTS.has(file)));
  if (originalChanges.length) throw new Error(`Unsaved source changes: ${originalChanges.join(', ')}`);
  // Include the audit report even when bytes are unchanged: the receipt records
  // this computation and prevents an older artifact replaying its provenance.
  const reportPaths = audit ? [AUDIT_PROFILES.get(stage)] : paths.filter(file => allowed(file, stage));
  const files = reportPaths.map(file => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) throw new Error(`Deleted/nonregular report: ${file}`);
    const content = fs.readFileSync(absolute, 'utf8');
    JSON.parse(content);
    return { path: file, baseBlob: blob(root, baseSha, file), sha256: sha256(content), content };
  });
  const bundle = { version: VERSION, stage, baseSha, createdAt: new Date().toISOString(), files };
  if (audit) bundle.receiptBaseBlob = blob(root, baseSha, receiptPath(stage));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(bundle) + '\n');
  return { stage, baseSha, files: files.length };
}
function validate(bundle, { stage, baseSha }) {
  if (bundle.version !== VERSION || !STAGES.has(stage) || bundle.stage !== stage ||
      !/^[a-f0-9]{40}$/.test(baseSha || '') || bundle.baseSha !== baseSha ||
      !Number.isFinite(Date.parse(bundle.createdAt)) || !Array.isArray(bundle.files) || bundle.files.length > 500)
    throw new Error('Invalid checkpoint identity');
  if (AUDIT_PROFILES.has(stage) && (!validBlob(bundle.receiptBaseBlob) || bundle.files.length !== 1 ||
      Object.keys(bundle).some(key => !['version', 'stage', 'baseSha', 'createdAt', 'files', 'receiptBaseBlob'].includes(key))))
    throw new Error('Invalid audit checkpoint identity');
  const seen = new Set();
  for (const file of bundle.files) {
    if (!allowed(file.path, stage) || seen.has(file.path) || typeof file.content !== 'string' ||
        !(file.baseBlob === null || /^[a-f0-9]{40}$/.test(file.baseBlob)) || sha256(file.content) !== file.sha256)
      throw new Error('Invalid checkpoint file');
    seen.add(file.path);
    JSON.parse(file.content);
  }
}
function apply({ root, bundle, stage, baseSha }) {
  validate(bundle, { stage, baseSha });
  if (git(root, ['status', '--porcelain'])) throw new Error('Publication checkout must be clean');
  if (git(root, ['diff', '--name-only', baseSha, 'HEAD', '--', ...codePaths(stage)]))
    throw new Error('Builder code changed after source checkpoint; rebuild from current main');
  const receiptFile = receiptPath(stage);
  if (AUDIT_PROFILES.has(stage)) {
    if (blob(root, baseSha, receiptFile) !== bundle.receiptBaseBlob)
      throw new Error(`Incorrect source receipt blob: ${receiptFile}`);
    if (blob(root, 'HEAD', receiptFile) !== bundle.receiptBaseBlob)
      throw new Error(`Audit receipt changed after source checkpoint: ${receiptFile}`);
  }
  const preserved = [], publish = [];
  // Validate every base blob and every destination before changing any file.
  for (const file of bundle.files) {
    if (blob(root, baseSha, file.path) !== file.baseBlob) throw new Error(`Incorrect source blob: ${file.path}`);
    const current = blob(root, 'HEAD', file.path);
    if (current !== file.baseBlob) {
      if (!KEEP_NEWER.has(file.path)) throw new Error(`Report changed after source checkpoint: ${file.path}`);
      preserved.push({ path: file.path, blob: current });
    } else publish.push(file);
  }
  const beforeSha = git(root, ['rev-parse', 'HEAD']);
  const receipt = { version: VERSION, stage, sourceSha: baseSha, builtAt: bundle.createdAt,
    publishedFromSha: beforeSha, publishedAt: new Date().toISOString(),
    files: publish.map(({ path, sha256 }) => ({ path, sha256 })), preservedNewer: preserved };
  for (const file of publish) {
    const absolute = path.join(root, file.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.content);
  }
  fs.mkdirSync(path.dirname(path.join(root, receiptFile)), { recursive: true });
  fs.writeFileSync(path.join(root, receiptFile), JSON.stringify(receipt, null, 2) + '\n');
  const savePaths = [...publish.map(file => file.path), receiptFile];
  // The publisher intentionally omits prediction originals from its sparse
  // checkout. Stage only validated explicit paths, including the two reports.
  git(root, ['add', '--sparse', '--', ...savePaths]);
  const staged = git(root, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  if (staged.some(file => !savePaths.includes(file))) throw new Error('Unexpected staged file');
  return receipt;
}
function publish({ root = process.cwd(), bundle, stage, baseSha, beforePush = () => {} }) {
  validate(bundle, { stage, baseSha });
  // A disposable worktree protects the caller's branch and any local changes.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy-result-publish-'));
  const checkout = path.join(temporary, 'work');
  let attached = false;
  try {
    git(root, ['fetch', '--no-tags', '--depth=1', 'origin', baseSha]);
    for (let attempt = 1; attempt <= 3; attempt++) {
      git(root, ['fetch', '--no-tags', '--depth=1', 'origin', 'main']);
      const latest = git(root, ['rev-parse', 'FETCH_HEAD']);
      if (attached) git(root, ['worktree', 'remove', '--force', checkout]);
      git(root, ['worktree', 'add', '--detach', checkout, latest]);
      attached = true;
      const receipt = apply({ root: checkout, bundle, stage, baseSha });
      git(checkout, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '-m', `Update result ${stage} reports`]);
      const savedSha = git(checkout, ['rev-parse', 'HEAD']);
      beforePush({ attempt, checkout, savedSha });
      try {
        git(checkout, ['push', 'origin', 'HEAD:refs/heads/main']);
        return { savedSha, receipt };
      } catch (error) {
        git(root, ['fetch', '--no-tags', '--depth=1', 'origin', 'main']);
        const remote = git(root, ['rev-parse', 'FETCH_HEAD']);
        if (remote === savedSha) return { savedSha, receipt }; // accepted push with lost acknowledgement
        if (remote === latest || attempt === 3) throw error;
        // Recheck the complete batch against the new main; never force push or
        // merge stale JSON text. The expensive builders are not run in this lock.
      }
    }
    throw new Error('Publication retry exhausted');
  } finally {
    if (attached) git(root, ['worktree', 'remove', '--force', checkout]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module) {
  const [command, stage, file, baseSha] = process.argv.slice(2);
  try {
    const result = command === 'pack' ? pack({ stage, output: file }) : command === 'publish'
      ? publish({ stage, baseSha, bundle: JSON.parse(fs.readFileSync(file, 'utf8')) }) : (() => { throw new Error('Use pack or publish'); })();
    if (result.savedSha && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `sha=${result.savedSha}\n`);
    if (result.receipt && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\n${stage}: source ${baseSha}; saved ${result.savedSha}; ${result.receipt.files.length} reports; preserved newer: ${result.receipt.preservedNewer.map(x => x.path).join(', ') || 'none'}\n`);
    console.log(JSON.stringify(result.receipt ? { savedSha: result.savedSha, ...result.receipt } : result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { pack, validate, apply, publish, allowed, sha256 };
