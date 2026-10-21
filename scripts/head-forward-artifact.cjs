'use strict';

// Verify the actual small uploaded payload, rather than admitting a local file
// from artifact metadata alone. No archive is extracted onto the filesystem.
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const REPOSITORY = 'takechanman12250711-oss/chappy-boatrace-ai';
const API = 'https://api.github.com/repos/' + REPOSITORY;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = reason => { throw Error('head_artifact_' + reason); };
const ZIP_READER = [
  'import io, stat, sys, zipfile',
  'limit = int(sys.argv[1])',
  'try:',
  '    raw = sys.stdin.buffer.read()',
  '    with zipfile.ZipFile(io.BytesIO(raw)) as archive:',
  '        entries = archive.infolist()',
  '        if len(entries) != 1: raise ValueError("entry count")',
  '        entry = entries[0]',
  '        mode = entry.external_attr >> 16',
  '        if entry.filename != "batch.json" or entry.orig_filename != "batch.json" or entry.is_dir(): raise ValueError("entry name")',
  '        if entry.flag_bits & 1 or stat.S_IFMT(mode) not in (0, stat.S_IFREG): raise ValueError("entry type")',
  '        if entry.file_size <= 0 or entry.file_size > limit: sys.exit(3)',
  '        with archive.open(entry) as source:',
  '            payload = source.read(limit + 1)',
  '            if len(payload) > limit or len(payload) != entry.file_size: sys.exit(3)',
  '            if source.read(1): sys.exit(3)',
  '        sys.stdout.buffer.write(payload)',
  'except Exception:',
  '    sys.exit(2)',
].join('\n');

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const canonical = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction) => '.' + (fraction || '').padEnd(3, '0') + 'Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonical ? parsed : NaN;
}
function httpTime(response) {
  const raw = response.headers?.get('date');
  const time = typeof raw === 'string' && /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw) ? Date.parse(raw) : NaN;
  if (!Number.isFinite(time) || new Date(time).toUTCString() !== raw) fail('server_date_invalid');
  return time + 1000; // HTTP Date has one-second precision; use the upper bound.
}
async function beforeAbort(promise, signal) {
  if (signal.aborted) fail('timeout');
  let abort;
  const cancelled = new Promise((resolve, reject) => {
    abort = () => reject(Error('head_artifact_timeout'));
    signal.addEventListener('abort', abort, {once: true});
  });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
async function boundedBody(response, limit, signal, reason) {
  const declared = response.headers?.get('content-length');
  if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limit)) fail(reason);
  const reader = response.body?.getReader?.();
  if (!reader) fail('body_unavailable');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await beforeAbort(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) fail(reason);
      chunks.push(Buffer.from(value));
    }
    if (declared !== null && declared !== undefined && size !== Number(declared)) fail('body_length_mismatch');
    return Buffer.concat(chunks, size);
  } catch (error) {
    try { reader.cancel().catch(() => {}); } catch {}
    throw error;
  } finally { reader.releaseLock(); }
}
function identity(metadata, expected) {
  if (!metadata || metadata.id !== expected.artifactId || metadata.expired !== false ||
      metadata.digest !== expected.digest || metadata.name !== expected.name ||
      String(metadata.workflow_run?.id) !== expected.runId || metadata.workflow_run?.head_sha !== expected.workflowHead ||
      !Number.isFinite(instant(metadata.created_at))) fail('identity_mismatch');
  if (metadata.size_in_bytes !== undefined && (!Number.isSafeInteger(metadata.size_in_bytes) || metadata.size_in_bytes < 1 || metadata.size_in_bytes > expected.maxZipBytes)) fail('zip_size_limit');
  return metadata;
}
async function metadataAt(url, expected, fetcher, headers, signal) {
  const response = await beforeAbort(fetcher(url, {headers, redirect: 'manual', signal}), signal);
  if (response.status !== 200) fail('metadata_unavailable');
  const server = httpTime(response);
  const raw = await boundedBody(response, 128 * 1024, signal, 'metadata_size_limit');
  let value;
  try { value = JSON.parse(raw); } catch { fail('metadata_invalid'); }
  identity(value, expected);
  if (instant(value.created_at) > server) fail('server_date_invalid');
  return {value, server};
}
async function download(url, fetcher, headers, signal, maxBytes) {
  let current = url;
  let requestHeaders = headers;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await beforeAbort(fetcher(current, {headers: requestHeaders, redirect: 'manual', signal}), signal);
    if (response.status === 200) return boundedBody(response, maxBytes, signal, 'zip_size_limit');
    if (![301, 302, 303, 307, 308].includes(response.status) || redirects === 3) fail('download_unavailable');
    const location = response.headers?.get('location');
    let target;
    try { target = new URL(location || '', current); } catch { fail('redirect_invalid'); }
    if (!location || target.protocol !== 'https:' || target.username || target.password) fail('redirect_invalid');
    try { response.body?.cancel().catch(() => {}); } catch {}
    current = target.href;
    // Signed archive URLs require no GitHub token. Handle redirects manually,
    // dropping Authorization even for same-host redirects, not relying on a
    // fetch implementation's cross-origin header stripping behavior.
    requestHeaders = {Accept: 'application/octet-stream'};
  }
  fail('download_unavailable');
}

async function verifyArtifact({artifactId, artifactDigest, runId, runAttempt, workflowHead, batchBytes, token,
  fetcher = fetch, maxZipBytes = 8 * 1024 * 1024, maxJsonBytes = 4 * 1024 * 1024} = {}) {
  const id = typeof artifactId === 'string' && /^[1-9]\d*$/.test(artifactId) ? Number(artifactId) : artifactId;
  const digest = 'sha256:' + String(artifactDigest || '').replace(/^sha256:/, '');
  const run = String(runId || ''), attempt = String(runAttempt || '');
  if (!Number.isSafeInteger(id) || id < 1 || !/^sha256:[a-f0-9]{64}$/.test(digest) ||
      !/^[1-9]\d*$/.test(run) || !/^[1-9]\d*$/.test(attempt) || !/^[a-f0-9]{40}$/.test(workflowHead || '') ||
      typeof token !== 'string' || !token || typeof fetcher !== 'function' ||
      !Number.isSafeInteger(maxZipBytes) || maxZipBytes < 1 || !Number.isSafeInteger(maxJsonBytes) || maxJsonBytes < 1 ||
      !(typeof batchBytes === 'string' || batchBytes instanceof Uint8Array)) fail('input_invalid');
  const expectedBytes = Buffer.from(batchBytes);
  if (!expectedBytes.length || expectedBytes.length > maxJsonBytes) fail('batch_size_limit');
  const expected = {artifactId: id, digest, runId: run, workflowHead, maxZipBytes,
    name: 'independent-head-v2-' + run + '-' + attempt};
  const url = API + '/actions/artifacts/' + id;
  const headers = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json'};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const first = await metadataAt(url, expected, fetcher, headers, controller.signal);
    const zip = await download(url + '/zip', fetcher, headers, controller.signal, maxZipBytes);
    if ('sha256:' + hash(zip) !== digest) fail('digest_mismatch');
    let remoteBytes;
    try {
      remoteBytes = execFileSync('python3', ['-c', ZIP_READER, String(maxJsonBytes)], {
        input: zip, timeout: 5000, maxBuffer: maxJsonBytes + 1024, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      fail(error.status === 3 ? 'entry_size_limit' : 'zip_invalid');
    }
    if (!remoteBytes.equals(expectedBytes)) fail('batch_bytes_mismatch');
    // This request occurs after download, CRC/decompression and byte comparison.
    // Its server time, not the initial metadata time or caller clock, is used.
    const last = await metadataAt(url, expected, fetcher, headers, controller.signal);
    if (last.value.created_at !== first.value.created_at || last.server < first.server) fail('metadata_changed');
    return {artifact: {id, digest, name: expected.name, runId: run, runAttempt: attempt, workflowHead,
      createdAt: last.value.created_at, confirmedAt: new Date(last.server).toISOString()},
    batchSha256: hash(expectedBytes), remoteBytesVerified: true};
  } catch (error) {
    if (error?.message?.startsWith('head_artifact_')) throw error;
    fail(controller.signal.aborted ? 'timeout' : 'request_failed');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

module.exports = {verifyArtifact};
