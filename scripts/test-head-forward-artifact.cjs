'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {verifyArtifact} = require('./head-forward-artifact.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const META_URL = 'https://api.github.com/repos/takechanman12250711-oss/chappy-boatrace-ai/actions/artifacts/456';
const BATCH = Buffer.from('{"synthetic":true}\n');
const FIRST_DATE = 'Sat, 05 Oct 2030 01:01:00 GMT';
const LAST_DATE = 'Sat, 05 Oct 2030 01:02:00 GMT';
const ZIP_WRITER = [
  'import base64, io, json, stat, sys, zipfile',
  'spec = json.load(sys.stdin)',
  'class Streaming(io.BytesIO):',
  '    def seekable(self): return False',
  '    def seek(self, *args): raise io.UnsupportedOperation()',
  'out = Streaming() if spec.get("descriptor") else io.BytesIO()',
  'with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:',
  '    for row in spec["entries"]:',
  '        info = zipfile.ZipInfo(row["name"])',
  '        info.compress_type = zipfile.ZIP_DEFLATED if spec.get("compressed") else zipfile.ZIP_STORED',
  '        if row.get("symlink"): info.external_attr = (stat.S_IFLNK | 0o777) << 16',
  '        with archive.open(info, "w", force_zip64=spec.get("zip64", False)) as target:',
  '            target.write(base64.b64decode(row["bytes"]))',
  'sys.stdout.buffer.write(out.getvalue())',
].join('\n');
function zip(entries = [{name: 'batch.json', payload: BATCH}], options = {}) {
  return execFileSync('python3', ['-c', ZIP_WRITER], {input: JSON.stringify({...options,
    entries: entries.map(row => ({name: row.name, bytes: Buffer.from(row.payload).toString('base64'), symlink: !!row.symlink}))}),
  maxBuffer: 2 * 1024 * 1024, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe']});
}
const ZIP = zip();
function setup({archive = ZIP, first = {}, last = {}, firstDate = FIRST_DATE, lastDate = LAST_DATE,
  redirect, metadataStatus = 200, downloadStatus = 200, declaredLength, omitSize = false} = {}) {
  const calls = [];
  let metadataCount = 0;
  const metadata = {id: 456, expired: false, digest: 'sha256:' + hash(archive),
    name: 'independent-head-v2-123-2', size_in_bytes: archive.length,
    workflow_run: {id: 123, head_sha: 'a'.repeat(40)}, created_at: '2030-10-05T01:00:00Z'};
  if (omitSize) delete metadata.size_in_bytes;
  const fetcher = async (url, options) => {
    calls.push({url, options});
    assert.equal(options.redirect, 'manual');
    assert(options.signal instanceof AbortSignal);
    if (url === META_URL) {
      metadataCount++;
      assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
      return new Response(JSON.stringify({...metadata, ...first, ...(metadataCount > 1 ? last : {})}), {
        status: metadataStatus, headers: {'date': metadataCount === 1 ? firstDate : lastDate}});
    }
    if (url === META_URL + '/zip' && redirect) return new Response(null, {status: 302, headers: {location: redirect}});
    if (url === META_URL + '/zip' || url === redirect) {
      if (url === redirect) assert.equal(options.headers.Authorization, undefined, 'signed host must never receive GitHub token');
      const headers = declaredLength === undefined ? {} : {'content-length': String(declaredLength)};
      return new Response(archive, {status: downloadStatus, headers});
    }
    throw Error('unexpected synthetic URL');
  };
  return {calls, metadata, options: {artifactId: 456, artifactDigest: hash(archive), runId: '123', runAttempt: '2',
    workflowHead: 'a'.repeat(40), batchBytes: BATCH, token: 'synthetic-token', fetcher}};
}

test('verified ZIP payload is bound to metadata, upload digest and expected batch bytes', async () => {
  const input = setup();
  const result = await verifyArtifact(input.options);
  assert.deepEqual(input.calls.map(c => c.url), [META_URL, META_URL + '/zip', META_URL]);
  assert.deepEqual(result, {artifact: {id: 456, digest: 'sha256:' + hash(ZIP), name: 'independent-head-v2-123-2',
    runId: '123', runAttempt: '2', workflowHead: 'a'.repeat(40), createdAt: '2030-10-05T01:00:00Z',
    confirmedAt: '2030-10-05T01:02:01.000Z'}, batchSha256: hash(BATCH), remoteBytesVerified: true});
});

test('standard deflate, ZIP64 and data descriptors use the standard ZIP reader', async () => {
  for (const options of [{compressed: true}, {zip64: true}, {descriptor: true}, {compressed: true, zip64: true, descriptor: true}]) {
    const input = setup({archive: zip(undefined, options)});
    assert.equal((await verifyArtifact(input.options)).remoteBytesVerified, true);
  }
});

test('only the final metadata response time is used, including a confirmation after a caller deadline', async () => {
  const input = setup({lastDate: 'Sat, 05 Oct 2030 01:10:00 GMT'});
  const result = await verifyArtifact(input.options);
  assert.equal(result.artifact.confirmedAt, '2030-10-05T01:10:01.000Z');
  assert(Date.parse(result.artifact.confirmedAt) >= Date.parse('2030-10-05T01:05:00Z'), 'caller must reject this late confirmation');
});

test('identity, expiry, server dates and final metadata are checked fail closed', async () => {
  const wrong = [{id: 999}, {id: '456'}, {expired: true}, {expired: undefined}, {digest: 'sha256:' + 'f'.repeat(64)},
    {name: 'independent-head-v2-123-1'}, {workflow_run: {id: 999, head_sha: 'a'.repeat(40)}},
    {workflow_run: {id: 123, head_sha: 'b'.repeat(40)}}, {created_at: '2030-02-30T01:00:00Z'},
    {created_at: '2030-10-06T01:00:00Z'}];
  for (const first of wrong) await assert.rejects(verifyArtifact(setup({first}).options), /head_artifact_(identity_mismatch|server_date_invalid)/);
  for (const firstDate of ['', 'invalid', 'Sun, 05 Oct 2030 01:01:00 GMT'])
    await assert.rejects(verifyArtifact(setup({firstDate}).options), /head_artifact_server_date_invalid/);
  await assert.rejects(verifyArtifact(setup({last: {created_at: '2030-10-05T00:59:59Z'}}).options), /head_artifact_metadata_changed/);
  await assert.rejects(verifyArtifact(setup({last: {expired: true}}).options), /head_artifact_identity_mismatch/);
  await assert.rejects(verifyArtifact(setup({lastDate: 'Sat, 05 Oct 2030 01:00:00 GMT'}).options), /head_artifact_metadata_changed/);
});

test('a signed redirect drops Authorization explicitly and unsafe redirects are rejected', async () => {
  const input = setup({redirect: 'https://synthetic-archive.example.test/signed.zip?signature=synthetic'});
  assert.equal((await verifyArtifact(input.options)).remoteBytesVerified, true);
  assert.equal(input.calls[2].options.headers.Authorization, undefined);
  assert.equal(input.calls[3].options.headers.Authorization, 'Bearer synthetic-token');
  for (const redirect of ['http://synthetic-archive.example.test/archive.zip', 'https://user:password@example.test/archive.zip'])
    await assert.rejects(verifyArtifact(setup({redirect}).options), /head_artifact_redirect_invalid/);
});

test('remote ZIP digest and exact uploaded batch bytes cannot be replaced by a local snapshot', async () => {
  const digest = setup();digest.options.artifactDigest = 'f'.repeat(64);
  await assert.rejects(verifyArtifact(digest.options), /head_artifact_identity_mismatch/);
  const mismatch = setup();mismatch.options.batchBytes = Buffer.from('{"synthetic":false}\n');
  await assert.rejects(verifyArtifact(mismatch.options), /head_artifact_batch_bytes_mismatch/);
  assert.equal(mismatch.calls.length, 2, 'a mismatched payload never reaches final confirmation');
  const input = setup();const original = input.options.fetcher;
  input.options.fetcher = async (url, options) => url.endsWith('/zip') ? new Response(Buffer.concat([ZIP, Buffer.from('tampered')])) : original(url, options);
  await assert.rejects(verifyArtifact(input.options), /head_artifact_digest_mismatch/);
});

test('extra, duplicate, traversal, directory and symlink entries are rejected without extracting files', async () => {
  const cases = [
    [{name: 'batch.json', payload: BATCH}, {name: 'other.json', payload: BATCH}],
    [{name: 'batch.json', payload: BATCH}, {name: 'batch.json', payload: BATCH}],
    [{name: '../batch.json', payload: BATCH}], [{name: '/batch.json', payload: BATCH}],
    [{name: 'batch.json/', payload: BATCH}], [{name: 'batch.json', payload: BATCH, symlink: true}],
  ];
  for (const entries of cases) await assert.rejects(verifyArtifact(setup({archive: zip(entries)}).options), /head_artifact_zip_invalid/);
});

test('CRC failures and invalid ZIP bytes are rejected even when artifact digest matches', async () => {
  const corrupt = Buffer.from(ZIP), at = corrupt.indexOf(BATCH);
  assert(at >= 0);corrupt[at] ^= 1;
  await assert.rejects(verifyArtifact(setup({archive: corrupt}).options), /head_artifact_zip_invalid/);
  await assert.rejects(verifyArtifact(setup({archive: Buffer.from('not a zip')}).options), /head_artifact_zip_invalid/);
});

test('streamed/downloaded ZIP and expanded entry size caps are enforced before admission', async () => {
  const streamed = setup({omitSize: true});streamed.options.maxZipBytes = ZIP.length - 1;
  await assert.rejects(verifyArtifact(streamed.options), /head_artifact_zip_size_limit/);
  const declared = setup({omitSize: true, declaredLength: ZIP.length + 999});declared.options.maxZipBytes = ZIP.length;
  await assert.rejects(verifyArtifact(declared.options), /head_artifact_zip_size_limit/);
  const expanded = setup({archive: zip([{name: 'batch.json', payload: Buffer.alloc(4096, 88)}], {compressed: true})});
  expanded.options.maxJsonBytes = 64;
  await assert.rejects(verifyArtifact(expanded.options), /head_artifact_entry_size_limit/);
  const local = setup();local.options.maxJsonBytes = 1;
  await assert.rejects(verifyArtifact(local.options), /head_artifact_batch_size_limit/);
  assert.equal(local.calls.length, 0);
});

test('HTTP failures and missing or invalid required input never produce verified evidence', async () => {
  await assert.rejects(verifyArtifact(setup({metadataStatus: 403}).options), /head_artifact_metadata_unavailable/);
  await assert.rejects(verifyArtifact(setup({downloadStatus: 502}).options), /head_artifact_download_unavailable/);
  for (const change of [{artifactId: -1}, {artifactId: '01'}, {artifactDigest: 'bad'}, {runId: '0'}, {runAttempt: ''},
    {workflowHead: 'bad'}, {token: ''}, {maxZipBytes: Infinity}, {batchBytes: {}}])
    await assert.rejects(verifyArtifact({...setup().options, ...change}), /head_artifact_input_invalid/);
});
