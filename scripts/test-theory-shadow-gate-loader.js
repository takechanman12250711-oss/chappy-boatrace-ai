'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loader = require('./build-theory-shadow-production-gate');
const gate = require('../js/theory-shadow-production-gate');

// Exact original collector behavior: alphabetical dates, primary rows followed
// by verification rows, and a last-write-wins Map even for unsettled records.
function legacyCollectRecords(directory) {
  const fs = require('node:fs');
  const path = require('node:path');
  function load(filePath, fallback = {}) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; }
  }
  if (!fs.existsSync(directory)) return [];
  const map = new Map();
  fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort().forEach(name => {
    const data = load(path.join(directory, name), {});
    [...(Array.isArray(data.predictions) ? data.predictions : []), ...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [])]
      .forEach(record => { if (record?.raceKey) map.set(record.raceKey, record); });
  });
  return [...map.values()];
}
function record(index, points = 2) {
  return { raceKey: `20261019-06-${index}`, jcd: '06', result: { settled: true, resultTicket: '1-2-3' },
    theoryShadowAb: { b: { tickets: [{ ticket: '1-2-3', changed: points !== 0,
      adjustmentPoints: points, theories: [{ theoryKey: 'wall' }] }] } },
    unused: { snapshot: Array(20).fill('unrelated saved inputs') } };
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy-shadow-gate-loader-'));
try {
  const fixtures = path.join(temp, 'fixtures');
  fs.mkdirSync(fixtures);
  const rows = Array.from({ length: 120 }, (_, i) => record(i + 1, i % 3 === 0 ? -2 : 2));
  const edge = [
    { ...record(121), result: null },
    { ...record(122), result: { settled: false, resultTicket: '1-2-3' } },
    { ...record(123), result: { settled: 1, resultTicket: '1-2-3' } },
    { ...record(124), theoryShadowAb: null },
    { ...record(125), theoryShadowAb: 0 },
    { ...record(126), theoryShadowAb: false },
    { ...record(127), theoryShadowAb: {} },
    { ...record(128), theoryShadowAb: { b: { tickets: null } } },
    { ...record(129), theoryShadowAb: { b: { tickets: {} } } },
    { ...record(130), theoryShadowAb: { b: { tickets: [null, 0, false, {}, { ticket: '1-2-3', changed: true, adjustmentPoints: 0 }] } } },
    { ...record(131), theoryShadowAb: { b: { tickets: [{ ticket: '1-2-3', changed: false, adjustmentPoints: '-2' }] } } },
    { ...record(132), theoryShadowAb: { b: { tickets: [{ ticket: '1-2-3', changed: true, adjustmentPoints: null }] } } },
    { ...record(133), theoryShadowAb: { b: { tickets: [{ ticket: '1-2-3', changed: true }] } } },
    { ...record(134), theoryShadowAb: { b: { tickets: [{ ticket: '1-2-3', changed: false, adjustmentPoints: 0 }] } } },
    { ...record(135), theoryShadowAb: { b: { tickets: [{ ticket: '2-1-3', changed: true, adjustmentPoints: 2 }] } } },
    { ...record(136), theoryShadowAb: { b: { tickets: [
      { ticket: '1-2-3', changed: true, adjustmentPoints: -2 }, { ticket: '1-2-3', changed: true, adjustmentPoints: 2 }] } } },
    { ...record(137), jcd: null }, { ...record(138), jcd: 0 },
    { ...record(139), raceKey: 0 }, null
  ];
  // Write newer date first to exercise the collector's filename sorting.
  fs.writeFileSync(path.join(fixtures, '20261019.json'), JSON.stringify({ predictions: [record(2, -2)],
    verificationPredictions: [record(2, 3), { ...record(1), result: { settled: false } }] }));
  fs.writeFileSync(path.join(fixtures, '20261018.json'), JSON.stringify({ predictions: rows, verificationPredictions: edge }));
  fs.writeFileSync(path.join(fixtures, 'not-a-date.json'), '{this ignored file is intentionally malformed');
  const before = fs.readdirSync(fixtures).map(name => [name, fs.readFileSync(path.join(fixtures, name), 'utf8')]);
  const raw = legacyCollectRecords(fixtures), small = loader.collectRecords(fixtures);
  assert.deepEqual(gate.build(small), gate.build(raw), 'all gate report fields equal the original collector');
  assert.deepEqual(gate.build(small.map(loader.compactRecord)), gate.build(raw), 'repeated projection preserves output');
  assert.equal(small.find(row => row.raceKey === '20261019-06-1').result.settled, false,
    'later unsettled records still suppress earlier settled rows');
  assert.equal(small.find(row => row.raceKey === '20261019-06-2').theoryShadowAb.b.tickets[0].adjustmentPoints, 3,
    'verification rows keep their existing precedence over same-file primary rows');
  assert.equal(small.find(row => row.raceKey === '20261019-06-121').result, null);
  assert.equal(small.find(row => row.raceKey === '20261019-06-125').theoryShadowAb, 0);
  assert.equal(small.find(row => row.raceKey === '20261019-06-132').theoryShadowAb.b.tickets[0].adjustmentPoints, null);
  assert.equal(small.find(row => row.raceKey === '20261019-06-133').theoryShadowAb.b.tickets[0].adjustmentPoints, undefined);
  assert.equal(small[0].unused, undefined);
  assert.ok(JSON.stringify(small).length < JSON.stringify(raw).length);
  assert.deepEqual(loader.collectRecords(path.join(temp, 'missing')), []);
  assert.deepEqual(fs.readdirSync(fixtures).map(name => [name, fs.readFileSync(path.join(fixtures, name), 'utf8')]), before,
    'the loader never modifies source files');

  // Bounded synthetic data only: no repository history is read. Each child has
  // the same 32 MiB heap. The negative control retains all unused payloads.
  const memory = path.join(temp, 'memory');
  fs.mkdirSync(memory);
  const expectedRows = [];
  for (let day = 1; day <= 12; day++) {
    const records = [record(day * 2 - 1, 2), record(day * 2, -2)];
    for (const [i, row] of records.entries()) row.unused = { payload: Array.from({ length: 768 }, (_, n) =>
      `${day}:${i}:${n}:` + 'x'.repeat(2048)) };
    fs.writeFileSync(path.join(memory, `202610${String(day).padStart(2, '0')}.json`), JSON.stringify({ predictions: records }));
    expectedRows.push(...records.map(loader.compactRecord));
  }
  const child = `const loader=require(process.argv[1]);const gate=require(process.argv[2]);
    const legacyCollectRecords=${legacyCollectRecords.toString()};
    const rows=process.argv[4]==='legacy'?legacyCollectRecords(process.argv[3]):loader.collectRecords(process.argv[3]);
    process.stdout.write(JSON.stringify(gate.build(rows)));`;
  function run(mode) {
    // Disable core dumps for the deliberate OOM negative control. Paths and
    // source are separate argv entries; the shell evaluates no supplied data.
    return spawnSync('/bin/bash', ['-c', 'ulimit -c 0; exec "$@"', 'chappy-gate-loader-memory',
      process.execPath, '--max-old-space-size=32', '-e', child,
      require.resolve('./build-theory-shadow-production-gate'), require.resolve('../js/theory-shadow-production-gate'), memory, mode],
    { encoding: 'utf8', cwd: temp, maxBuffer: 1024 * 1024, timeout: 60000 });
  }
  const projected = run('projected');
  assert.equal(projected.status, 0, projected.stderr);
  assert.deepEqual(JSON.parse(projected.stdout), gate.build(expectedRows));
  const retained = run('legacy');
  assert.ok(retained.status !== 0 || retained.signal, 'the original collector must fail this bounded 32 MiB negative control');
  assert.match(retained.stderr, /heap out of memory|Reached heap limit|Allocation failed/i);
  console.log('theory shadow gate loader: exact reports, precedence, unchanged sources, 32 MiB projected success/raw OOM control: ok');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
