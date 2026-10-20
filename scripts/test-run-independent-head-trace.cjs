'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {execFileSync} = require('node:child_process');
const zlib = require('node:zlib');
const archive = require('./daily-prediction-source-archive.js');
const cli = require('./run-independent-head-trace.cjs');

test('input restore is confined to exact original pointers and their daily archive pairs', () => {
  const sourceCommit = 'a'.repeat(40);
  const pointer = file => ({sourcePointer: {path: file}});
  const plan = cli.planInputRestore({sourceCommit, rows: [pointer('data/predictions/20261006.json'),
    pointer('data/note-drafts/20261006/race-123.json'), pointer('data/predictions/20261006.json')]});
  assert.equal(plan.sourceCommit, sourceCommit);
  assert.equal(plan.files.length, 2);
  assert.deepEqual(plan.dates, ['20261006']);
  assert.deepEqual(plan.possibleFiles.slice(2), ['data/predictions/source-archives/20261006.json.gz',
    'data/predictions/source-archives/20261006.meta.json']);
  assert.equal(plan.possibleFiles.some(file => /results|history/.test(file)), false);
  for (const file of ['../../outside.json', 'data/results/20261006.json', 'data/note-drafts/20261006/../../escape.json', undefined]) {
    assert.throws(() => cli.planInputRestore({sourceCommit, rows: [pointer(file)]}), /allowlist/);
  }
  assert.throws(() => cli.planInputRestore({sourceCommit: 'HEAD', rows: []}), /commit/);
});

test('changed trial artifact fails before source restoration or analysis', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-reference-'));
  try {
    fs.mkdirSync(path.join(root, 'data/stats'), {recursive: true});
    fs.writeFileSync(path.join(root, cli.REFERENCE_PATH), '{"rows":[]}\n');
    assert.throws(() => cli.readReference(root), /SHA256 mismatch/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('real input restoration cannot run in the local workspace', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-independent-head-trace.cjs')], {
    encoding: 'utf8', env: {...process.env, GITHUB_ACTIONS: 'false'}
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub Actions only/);
  assert.doesNotMatch(result.stderr, /Cannot find module|ENOENT|Authentication/);
});

test('tiny git fixture restores the pinned commit and validates archive pairs without checking out results', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-input-restore-'));
  const origin = path.join(temp, 'origin'), root = path.join(temp, 'runner');
  const previous = process.env.GITHUB_ACTIONS;
  const git = (cwd, args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const write = (base, file, value) => {
    fs.mkdirSync(path.dirname(path.join(base, file)), {recursive: true});
    fs.writeFileSync(path.join(base, file), value);
  };
  try {
    fs.mkdirSync(origin); fs.mkdirSync(root);
    git(origin, ['init', '--quiet']);
    git(origin, ['config', 'user.name', 'Trace fixture']);
    git(origin, ['config', 'user.email', 'fixture@example.invalid']);
    const archivedPath = 'data/predictions/20261006.json', rawPath = 'data/predictions/20261007.json';
    const notePath = 'data/note-drafts/20261006/original.json';
    const bytes = Buffer.from('{"predictions":[{"version":"original-archive"}]}');
    const gzip = zlib.gzipSync(bytes);
    write(origin, 'data/predictions/source-archives/20261006.json.gz', gzip);
    write(origin, 'data/predictions/source-archives/20261006.meta.json', JSON.stringify(archive.metadataFor({
      date: '20261006', raw: bytes, archive: gzip, parsed: JSON.parse(bytes), generatedAt: '2026-10-20T00:00:00Z'
    })));
    write(origin, rawPath, '{"version":"original-raw"}');
    write(origin, notePath, '{"record":{"version":"original-note"}}');
    write(origin, 'data/results/20261006.json', '{"mustNotBeRead":true}');
    git(origin, ['add', '.']); git(origin, ['commit', '--quiet', '-m', 'Original tiny inputs']);
    const originalCommit = git(origin, ['rev-parse', 'HEAD']);
    write(origin, rawPath, '{"version":"later-raw"}');
    git(origin, ['add', '.']); git(origin, ['commit', '--quiet', '-m', 'Later tiny input']);
    git(root, ['init', '--quiet']); git(root, ['remote', 'add', 'origin', origin]);
    process.env.GITHUB_ACTIONS = 'true';
    const paths = [archivedPath, rawPath, notePath, 'data/note-drafts/20261006/missing.json'];
    const receipt = cli.restoreReferenceInputs(root, {sourceCommit: originalCommit,
      rows: paths.map(file => ({sourcePointer: {path: file}}))});
    assert.equal(receipt.sourceCommit, originalCommit); assert.equal(receipt.requestedFiles, 4);
    assert.equal(fs.readFileSync(path.join(root, archivedPath), 'utf8'), bytes.toString());
    assert.equal(fs.readFileSync(path.join(root, rawPath), 'utf8'), '{"version":"original-raw"}');
    assert.equal(fs.readFileSync(path.join(root, notePath), 'utf8'), '{"record":{"version":"original-note"}}');
    assert.equal(receipt.files.find(file => file.path === archivedPath).status, 'restored');
    assert.equal(receipt.files.find(file => file.path.endsWith('/missing.json')).status, 'missing-original-input');
    assert.equal(fs.existsSync(path.join(root, 'data/results')), false);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = previous;
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
