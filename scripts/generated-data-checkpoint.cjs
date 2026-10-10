'use strict';

// Frozen output transport for two existing writers, not a general data writer.
// Compute/pack outside the shared lock; publish exact bytes without rebuilding.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const archive = require('./daily-prediction-source-archive');
const VERSION = 'generated-data-checkpoint-v1';
const LIMIT = 100 * 1024 * 1024;
const PROFILES = new Set(['negative-clip', 'active-100r']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const git = (root, args, env = {}) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env },
}).trimEnd();
const validBlob = value => value === null || /^[a-f0-9]{40}$/.test(value || '');
function profilePaths(profile, date) {
  if (!PROFILES.has(profile) || (profile === 'negative-clip' && !/^\d{8}$/.test(date || '')) ||
      (profile === 'active-100r' && date !== '')) throw new Error('Invalid profile/date');
  return profile === 'active-100r' ? ['data/stats/active-100r-early-monitor.json'] : [
    `data/predictions/${date}.json`,
    `data/predictions/source-archives/${date}.json.gz`,
    `data/predictions/source-archives/${date}.meta.json`,
    'data/stats/frame-rise-fall-negative-clip-result-report.json',
  ];
}
function blob(root, ref, file) {
  const row = git(root, ['ls-tree', ref, '--', file]);
  if (!row) return null;
  const match = /^100644 blob ([a-f0-9]{40})\t/.exec(row);
  if (!match) throw new Error(`Not a regular data file: ${file}`);
  return match[1];
}
function checkIdentity({ profile, date, baseSha, runId, runAttempt }) {
  profilePaths(profile, date);
  if (!/^[a-f0-9]{40}$/.test(baseSha || '') || !/^[1-9]\d*$/.test(runId || '') ||
      !/^[1-9]\d*$/.test(runAttempt || '')) throw new Error('Invalid source/run/attempt');
}
function regular(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error(`Missing or nonregular payload: ${file}`);
  return fs.readFileSync(file);
}
function pack({ root = process.cwd(), profile, date = '', output, runId, runAttempt }) {
  const baseSha = git(root, ['rev-parse', 'HEAD']);
  checkIdentity({ profile, date, baseSha, runId, runAttempt });
  const allowed = profilePaths(profile, date);
  const changes = [...new Set([
    ...git(root, ['diff', '--name-only', '-z', 'HEAD']).split('\0'),
    ...git(root, ['diff', '--cached', '--name-only', '-z']).split('\0'),
    ...git(root, ['diff', '--name-only', '-z']).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))].sort();
  if (changes.some(file => !allowed.includes(file))) throw new Error('Unexpected generated file');
  if (fs.existsSync(output)) throw new Error('Checkpoint directory already exists');
  // Guard raw AND archive even when preparation restored the raw working tree.
  // A new archive must never hide a concurrent update to the raw source.
  const guards = allowed.map(file => ({ path: file, baseBlob: blob(root, baseSha, file) }));
  const files = changes.map(file => {
    const baseBlob = guards.find(guard => guard.path === file).baseBlob;
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) {
      if (!file.includes('/source-archives/') || baseBlob === null) throw new Error('Source/report deletion forbidden');
      return { path: file, baseBlob, operation: 'delete' };
    }
    const bytes = regular(absolute);
    if (!bytes.length || bytes.length >= LIMIT) throw new Error('Invalid payload size');
    if (file.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
    return { path: file, baseBlob, operation: 'write', size: bytes.length,
      sha256: sha256(bytes), newBlob: gitBlob(bytes), bytes };
  });
  if (profile === 'negative-clip') {
    const [, gzip, meta] = allowed;
    const gzipExists = fs.existsSync(path.join(root, gzip));
    const metaExists = fs.existsSync(path.join(root, meta));
    if (gzipExists !== metaExists) throw new Error('Archive pair incomplete');
    if (gzipExists) {
      // Existing reader validates compressed AND uncompressed fingerprints.
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-archive-check-'));
      try {
        fs.mkdirSync(path.join(temporary, 'data/predictions/source-archives'), { recursive: true });
        for (const file of [gzip, meta]) fs.copyFileSync(path.join(root, file), path.join(temporary, file));
        archive.restorePredictionSource({ rootDirectory: temporary, date });
      } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    }
    const deleted = files.filter(file => file.operation === 'delete');
    if (deleted.length && (deleted.length !== 2 || !files.some(file => file.path === allowed[0] && file.operation === 'write')))
      throw new Error('Archive removal requires the replacement raw source');
  }
  fs.mkdirSync(path.join(output, 'files'), { recursive: true });
  for (const file of files) {
    if (file.bytes) fs.writeFileSync(path.join(output, 'files', file.sha256), file.bytes);
    delete file.bytes;
  }
  const manifest = { version: VERSION, profile, date, baseSha, runId, runAttempt,
    createdAt: new Date().toISOString(), guards, files };
  const bytes = Buffer.from(JSON.stringify(manifest) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), bytes);
  return { baseSha, manifestSha256: sha256(bytes), files: files.length, date, runId, runAttempt };
}
function load({ directory, expected }) {
  checkIdentity(expected);
  if (!/^[1-9]\d*$/.test(expected.artifactId || '') || !/^[a-f0-9]{64}$/.test(expected.manifestSha256 || ''))
    throw new Error('Missing artifact identity/hash');
  const bytes = regular(path.join(directory, 'manifest.json'));
  if (sha256(bytes) !== expected.manifestSha256) throw new Error('Manifest hash mismatch');
  const manifest = JSON.parse(bytes);
  const allowed = profilePaths(expected.profile, expected.date);
  if (manifest.version !== VERSION || ['profile', 'date', 'baseSha', 'runId', 'runAttempt'].some(key => manifest[key] !== expected[key]) ||
      !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.files) || manifest.files.length > allowed.length ||
      !Array.isArray(manifest.guards) || manifest.guards.length !== allowed.length)
    throw new Error('Checkpoint identity mismatch');
  if (manifest.guards.some((guard, index) => guard.path !== allowed[index] || !validBlob(guard.baseBlob)))
    throw new Error('Invalid source guards');
  const seen = new Set();
  for (const file of manifest.files) {
    if (!allowed.includes(file.path) || seen.has(file.path) || !validBlob(file.baseBlob) ||
        manifest.guards.find(guard => guard.path === file.path).baseBlob !== file.baseBlob)
      throw new Error('Invalid checkpoint path/base');
    seen.add(file.path);
    if (file.operation === 'delete') {
      if (!file.path.includes('/source-archives/') || file.baseBlob === null) throw new Error('Source/report deletion forbidden');
    } else if (file.operation === 'write') {
      if (!/^[a-f0-9]{64}$/.test(file.sha256 || '') || !/^[a-f0-9]{40}$/.test(file.newBlob || '') ||
          !Number.isInteger(file.size) || file.size < 1 || file.size >= LIMIT) throw new Error('Invalid payload metadata');
      const payload = regular(path.join(directory, 'files', file.sha256));
      if (payload.length !== file.size || sha256(payload) !== file.sha256 || gitBlob(payload) !== file.newBlob)
        throw new Error('Payload fingerprint mismatch');
      if (file.path.endsWith('.json')) JSON.parse(payload.toString('utf8'));
    } else throw new Error('Invalid operation');
  }
  const deleted = manifest.files.filter(file => file.operation === 'delete');
  if (deleted.length && (deleted.length !== 2 || !manifest.files.some(file => file.path === allowed[0] && file.operation === 'write')))
    throw new Error('Archive removal requires the replacement raw source');
  return manifest;
}
function publish({ root = process.cwd(), directory, expected, beforePush = () => {} }) {
  const manifest = load({ directory, expected });
  const { baseSha, profile } = manifest;
  const workflow = profile === 'negative-clip' ? 'collect-frame-rise-fall-negative-clip-ab.yml' : 'check-active-100r-early-monitor.yml';
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-data-publish-'));
  const env = { GIT_INDEX_FILE: path.join(temporary, 'index'),
    GIT_AUTHOR_NAME: 'github-actions[bot]', GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'github-actions[bot]', GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com' };
  try {
    git(root, ['fetch', '--no-tags', '--depth=1', 'origin', baseSha]);
    for (const guard of manifest.guards) {
      if (blob(root, baseSha, guard.path) !== guard.baseBlob) throw new Error(`Incorrect source blob: ${guard.path}`);
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      git(root, ['fetch', '--no-tags', '--depth=1', 'origin', 'main']);
      const latest = git(root, ['rev-parse', 'FETCH_HEAD']);
      if (git(root, ['diff', '--name-only', baseSha, latest, '--', 'scripts', 'js', 'config', 'api', `.github/workflows/${workflow}`]))
        throw new Error('Builder code changed after capture; keep artifact and stop');
      // Complete remote preflight before writing any Git objects or index.
      let alreadySaved = manifest.files.length > 0;
      for (const guard of manifest.guards) {
        const current = blob(root, latest, guard.path);
        const file = manifest.files.find(entry => entry.path === guard.path);
        const desired = file ? (file.operation === 'delete' ? null : file.newBlob) : guard.baseBlob;
        if (current !== guard.baseBlob && current !== desired)
          throw new Error(`Source changed after capture: ${guard.path}; keep artifact and stop`);
        if (file && current !== desired) alreadySaved = false;
      }
      if (!manifest.files.length || alreadySaved)
        return { savedSha: latest, sourceSha: baseSha, artifactId: expected.artifactId, attempt,
          status: alreadySaved ? 'already-persisted' : 'no-changes', files: manifest.files };
      git(root, ['read-tree', latest], env);
      for (const file of manifest.files) {
        if (file.operation === 'delete') git(root, ['update-index', '--force-remove', '--', file.path], env);
        else {
          const actual = git(root, ['hash-object', '-w', '--', path.join(directory, 'files', file.sha256)]);
          if (actual !== file.newBlob) throw new Error('Git blob fingerprint mismatch');
          git(root, ['update-index', '--add', '--cacheinfo', `100644,${actual},${file.path}`], env);
        }
      }
      // Unchanged entries come from the fetched remote tree; new blobs were
      // written and hash-checked above. Do not hydrate unrelated promised data.
      const tree = git(root, ['write-tree', '--missing-ok'], env);
      const savedSha = git(root, ['commit-tree', tree, '-p', latest, '-m', `Save ${profile} generated checkpoint\n\nSource: ${baseSha}\nRun: ${manifest.runId}/${manifest.runAttempt}\nArtifact: ${expected.artifactId}\nManifest-SHA256: ${expected.manifestSha256}`], env);
      beforePush({ attempt, savedSha, latest });
      try {
        git(root, ['push', 'origin', `${savedSha}:refs/heads/main`]);
        return { savedSha, sourceSha: baseSha, artifactId: expected.artifactId, attempt, status: 'saved', files: manifest.files };
      } catch (error) {
        git(root, ['fetch', '--no-tags', '--depth=1', 'origin', 'main']);
        const remote = git(root, ['rev-parse', 'FETCH_HEAD']);
        if (remote === savedSha) return { savedSha, sourceSha: baseSha, artifactId: expected.artifactId, attempt, status: 'saved', files: manifest.files };
        // A terminal attempt may also have been accepted before another writer
        // advanced main. Check exact bytes once without issuing a fourth push.
        const persisted = manifest.files.length > 0 && manifest.guards.every(guard => {
          const file = manifest.files.find(entry => entry.path === guard.path);
          const desired = file ? (file.operation === 'delete' ? null : file.newBlob) : guard.baseBlob;
          return blob(root, remote, guard.path) === desired;
        });
        if (persisted) return { savedSha: remote, sourceSha: baseSha, artifactId: expected.artifactId, attempt, status: 'already-persisted', files: manifest.files };
        if (remote === latest || attempt === 3) throw error;
        // Remote moved: validate the SAME immutable bundle against it. No rebase,
        // force, regeneration, or three-way merge of prediction/archive bytes.
      }
    }
    throw new Error('Publication retry exhausted; keep artifact');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) {
  const [command, profile, directory] = process.argv.slice(2);
  const { GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt } = process.env;
  try {
    const date = profile === 'negative-clip' ? (command === 'pack' ? archive.resolveTargetDate() : process.env.CHECKPOINT_DATE) : '';
    if (command === 'publish' && (process.env.CAPTURE_RUN_ID !== runId ||
        !/^[1-9]\d*$/.test(process.env.CAPTURE_RUN_ATTEMPT || '') ||
        Number(process.env.CAPTURE_RUN_ATTEMPT) > Number(runAttempt)))
      throw new Error('Capture run/attempt does not belong to this workflow execution');
    const result = command === 'pack' ? pack({ profile, date, output: directory, runId, runAttempt }) :
      command === 'publish' ? publish({ directory, expected: { profile, date, runId, runAttempt: process.env.CAPTURE_RUN_ATTEMPT,
        baseSha: process.env.BASE_SHA, artifactId: process.env.ARTIFACT_ID, manifestSha256: process.env.MANIFEST_SHA256 } }) :
      (() => { throw new Error('Use pack or publish'); })();
    if (process.env.GITHUB_OUTPUT) {
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' || typeof value === 'number') fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
    }
    console.log(JSON.stringify(result));
    if (command === 'publish' && process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${profile}: ${result.status}; source ${result.sourceSha}; saved ${result.savedSha}; artifact ${result.artifactId}; attempts ${result.attempt}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { pack, load, publish, sha256, gitBlob, profilePaths };
