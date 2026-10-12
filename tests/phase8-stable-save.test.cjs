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
const report = (count = 3615, generatedAt = '2026-10-12T04:37:52Z') => ({
  schemaVersion: 1, generatedAt, sourceCoverageGeneratedAt: '2026-10-12T03:59:22Z',
  phaseComplete: true, productionChanged: false, rows: [{ theoryId: 'wall', raceCount: count }]
});
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

  // Phase8 publication ordering moved to test-phase8-single-writer.cjs.
  // No precomputed checkpoint profile may own these bytes anymore.
  for (const stage of ['diagnostics', 'calibration', WALL]) assert.equal(checkpoint.allowed(PHASE8, stage), false);
  console.log('phase8 stable save: 8 parity cases, real CLI, exclusive fresh-main ownership passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
