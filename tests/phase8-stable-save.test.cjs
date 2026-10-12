'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { writeStable } = require('../scripts/theory-validation-phase8-cycle.cjs');
const central = require('../scripts/run-live-improvement-cycle.cjs');
const checkpoint = require('../scripts/result-report-checkpoint.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-stable-save-'));
const PHASE8 = 'data/stats/theory-validation-phase8-cycle.json';
const WALL = 'wall-prospective-lifecycle';
const wallPaths = ['wall-established-attacker2-skip-ab-report', 'theory-validation-phase6-prospective',
  'theory-validation-phase7-lifecycle', 'theory-validation-phase8-cycle'].map(x => `data/stats/${x}.json`);
const sourcePaths = ['data/predictions/20261012.json', 'data/results/20261012.json',
  'data/predictions/source-archives/20261012.json.gz', 'data/predictions/source-archives/20261012.meta.json'];
const report = (count = 3615, generatedAt = '2026-10-12T04:37:52Z') => ({
  schemaVersion: 1, generatedAt, sourceCoverageGeneratedAt: '2026-10-12T03:59:22Z',
  phaseComplete: true, productionChanged: false, rows: [{ theoryId: 'wall', raceCount: count }]
});
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function put(cwd, file, value) {
  const dest = path.join(cwd, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(value) + '\n');
}
function commit(cwd, message) { git(cwd, ['add', '.']); git(cwd, ['commit', '-m', message]); return git(cwd, ['rev-parse', 'HEAD']); }
function originalHashes(remote) { return sourcePaths.map(file => git(remote, ['rev-parse', `main:${file}`])); }
try {
  // Match the existing central writer, including malformed/missing output recovery.
  for (const [name, previous, next, changed] of [
    ['missing', null, report(), true],
    ['identical', JSON.stringify(report()), report(), false],
    ['timestamp-only', JSON.stringify(report(), null, 4) + '\n\n', report(3615, '2026-10-12T05:26:59Z'), false],
    ['evidence-count', JSON.stringify(report()), report(3639), true],
    ['source-clock', JSON.stringify(report()), { ...report(), sourceCoverageGeneratedAt: '2026-10-12T06:13:39Z' }, true],
    ['nested-clock', JSON.stringify({ ...report(), rows: [{ generatedAt: 'old' }] }), { ...report(), rows: [{ generatedAt: 'new' }] }, true],
    ['decision', JSON.stringify(report()), { ...report(), phaseComplete: false }, true],
    ['malformed', '{broken JSON', report(), true]
  ]) {
    const actual = path.join(root, name, 'wall.json'), expected = path.join(root, name, 'central.json');
    fs.mkdirSync(path.dirname(actual), { recursive: true });
    if (previous !== null) { fs.writeFileSync(actual, previous); fs.writeFileSync(expected, previous); }
    const input = JSON.stringify(next);
    const result = writeStable(actual, next), reference = central.writeStable(expected, next);
    assert.equal(result.changed, changed, name); assert.deepEqual(result, reference, name);
    assert.equal(fs.readFileSync(actual, 'utf8'), fs.readFileSync(expected, 'utf8'), name);
    if (!changed) assert.equal(fs.readFileSync(actual, 'utf8'), previous, `${name}: preserve exact bytes`);
    assert.equal(JSON.stringify(next), input, `${name}: do not mutate computed input`);
  }

  // Real CLI builds twice into a temporary output. Neither computation edits input data.
  const cliOutput = path.join(root, 'cli.json');
  const cli = path.resolve(__dirname, '../scripts/theory-validation-phase8-cycle.cjs');
  const runCli = () => execFileSync(process.execPath, [cli, `--output=${cliOutput}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  runCli(); const cliFirst = fs.readFileSync(cliOutput, 'utf8'); runCli();
  assert.equal(fs.readFileSync(cliOutput, 'utf8'), cliFirst, 'CLI preserves bytes across generation clocks');
  assert.equal(JSON.parse(cliFirst).phaseComplete, true);

  // Interleave the actual wall batch publisher with a central diagnostics artifact.
  // A timestamp-only wall build must keep phase8's blob, while real changes must
  // still make the unchanged strict central guard reject the whole stale batch.
  for (const actualChange of [false, true]) {
    const work = path.join(root, actualChange ? 'real-race' : 'clock-race'), remote = `${work}.git`;
    fs.mkdirSync(work); git(work, ['init', '-b', 'main']);
    git(work, ['config', 'user.name', 'test']); git(work, ['config', 'user.email', 'test@example.invalid']);
    for (const file of [...sourcePaths, ...wallPaths]) put(work, file, file === PHASE8 ? report() : { original: file });
    const baseSha = commit(work, 'saved sources');
    git(root, ['clone', '--bare', work, remote]); git(work, ['remote', 'add', 'origin', `file://${remote}`]);
    const originals = originalHashes(remote), oldPhase8Blob = git(work, ['rev-parse', `HEAD:${PHASE8}`]);
    put(work, PHASE8, report(3639, '2026-10-12T06:14:31Z'));
    const diagnosticFile = path.join(root, `diagnostics-${actualChange}.json`);
    checkpoint.pack({ root: work, stage: 'diagnostics', output: diagnosticFile });
    const diagnosticBytes = fs.readFileSync(diagnosticFile), bundle = JSON.parse(diagnosticBytes);
    git(work, ['reset', '--hard', baseSha]);
    for (const file of wallPaths.filter(file => file !== PHASE8)) put(work, file, { refreshed: file });
    writeStable(path.join(work, PHASE8), report(actualChange ? 3616 : 3615, '2026-10-12T05:26:59Z'));
    const wallFile = path.join(root, `wall-${actualChange}.json`);
    checkpoint.pack({ root: work, stage: WALL, output: wallFile });
    const wallBundle = JSON.parse(fs.readFileSync(wallFile));
    assert.deepEqual(wallBundle.files.map(file => file.path), wallPaths, 'all four reports remain required');
    git(work, ['reset', '--hard', baseSha]);
    const wallSaved = checkpoint.publish({ root: work, stage: WALL, baseSha, bundle: wallBundle });
    assert.equal(wallSaved.receipt.files.length, 4, 'wall still records all four reports');
    const nextBlob = git(remote, ['rev-parse', `main:${PHASE8}`]);
    assert.equal(nextBlob === oldPhase8Blob, !actualChange);
    if (actualChange) {
      assert.throws(() => checkpoint.publish({ root: work, stage: 'diagnostics', baseSha, bundle }),
        /Report changed after source checkpoint: data\/stats\/theory-validation-phase8-cycle.json/);
      assert.equal(git(remote, ['rev-parse', 'main']), wallSaved.savedSha, 'stale diagnostics writes nothing');
    } else {
      const saved = checkpoint.publish({ root: work, stage: 'diagnostics', baseSha, bundle });
      assert.equal(saved.receipt.publishedFromSha, wallSaved.savedSha);
      assert.equal(JSON.parse(git(remote, ['show', `main:${PHASE8}`])).rows[0].raceCount, 3639);
    }
    assert.deepEqual(originalHashes(remote), originals, 'prediction, official-result and archive originals unchanged');
    assert.deepEqual(fs.readFileSync(diagnosticFile), diagnosticBytes, 'original failed/successful artifact preserved');
    assert.equal(git(work, ['status', '--porcelain']), '', 'no changes leak into caller checkout');
  }
  console.log('phase8 stable save: 8 parity cases, real CLI, timestamp interleaving, real-conflict rejection and original preservation passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
