'use strict';

// Recovery chooses reviewed local code from immutable claim-time bytes. Remote
// JavaScript is read and hashed only; it is never evaluated, imported or run.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { seriesOfBundle, publicationKey } = require('./note-article-series');
const { LEGACY_READABLE } = require('./note-published-ticket-sections');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, reason) => { if (!value) throw Error(reason); };
const codeRoot = path.join(__dirname, '..');
const PATHS = Object.freeze({
  rendererSha256: 'scripts/note-readable-article.js',
  publicationSourceSha256: 'scripts/note-publication-source.js',
  generatorSha256: 'js/note-generator.js',
  categorySha256: 'scripts/note-category-article.js',
  modelSha256: 'scripts/note-korogashi-presentation.cjs',
  publishedSectionsSha256: 'scripts/note-published-ticket-sections.js',
  seriesSha256: 'scripts/note-article-series.js',
  pricingSha256: 'scripts/note-pricing.js',
  navigationSha256: 'scripts/note-marketing-content.js',
  navigationConfigSha256: 'config/note-marketing.json',
  freeExplanationSha256: 'scripts/note-free-explanation.cjs'
});
const COMMON = Object.freeze({
  generatorSha256: LEGACY_READABLE.generatorSha256,
  seriesSha256: '71c1b74fdb3008c69e1ece95620d5063fab824aab0f5522edce1b2a602b7a443',
  pricingSha256: '547d27c05376da818606369ea745cb5446e863ae11aac680ef1f1d1eea5d9f83',
  navigationConfigSha256: '4464274af39b8bb406b7e978d7175f0675399f7e76f8f7005c659fa0e7b740be'
});
const HISTORICAL = Object.freeze({
  'readable-v3': Object.freeze({"rendererSha256":"6252711c7f94c57829c86628cb22b5e4aab68a5ee35dad2eba619eb6f9eb1b4c","publicationSourceSha256":"6a2d118df6e393314f3c4f98dca738ff75bc137d94437b42b1b749e35314e929","generatorSha256":"2f4b9769f34e29287e8b23bae208a694c39eca66700850397a64879619d48be3","categorySha256":"ee5b85c309ba1cb896c5b9efea46dc8a4a3bbdeaf781995faa6ec596a16c5f87","modelSha256":"992a8f844f90c3a22cb20cbcc6de4bb87d0d990d35e888495775973a146666d6","publishedSectionsSha256":"7290edb1c23394e76649c913738a24c1c37e439cf95be7ec99150c7aeace88dd","seriesSha256":"71c1b74fdb3008c69e1ece95620d5063fab824aab0f5522edce1b2a602b7a443","pricingSha256":"547d27c05376da818606369ea745cb5446e863ae11aac680ef1f1d1eea5d9f83","navigationSha256":"014e4cd1778d44c3d5a7aaf8a2a907f6db1a457618ed9354c2ceb7cf37b359d1","navigationConfigSha256":"4464274af39b8bb406b7e978d7175f0675399f7e76f8f7005c659fa0e7b740be"}),
  'readable-v1': Object.freeze({ ...COMMON,
    rendererSha256: LEGACY_READABLE.rendererSha256,
    publicationSourceSha256: LEGACY_READABLE.publicationSourceSha256,
    navigationSha256: '4458cecbb55422ff117d414a5e6abf92804e83fb5b14c62b73ded6a97b5582fa'
  }),
  'readable-v2': Object.freeze({ ...COMMON,
    rendererSha256: 'eac89651b731c090b962c2ca3b56c9ec3e6d77fd17ab83b631f56fa40e2d4a15',
    publicationSourceSha256: '3e866410106dfc19e782c88074a4debb153b0ca1f7ebb63926c8cba761b9cccb',
    categorySha256: 'ee5b85c309ba1cb896c5b9efea46dc8a4a3bbdeaf781995faa6ec596a16c5f87',
    publishedSectionsSha256: 'd3b157508c88184627e6b06bb74cdabe8f8d8e3b46f87132f094f4b61974ac53',
    navigationSha256: '014e4cd1778d44c3d5a7aaf8a2a907f6db1a457618ed9354c2ceb7cf37b359d1'
  })
});
const verifiedEvidence = new WeakMap();
function localFingerprints(rootDir = codeRoot) {
  return Object.fromEntries(Object.entries(PATHS).map(([key, file]) => [key,
    hash(fs.readFileSync(path.join(key === 'navigationConfigSha256' ? rootDir : codeRoot, file)))]));
}
function recoveryIdentity(sourcePath, rootDir = process.cwd()) {
  const match = /^data\/note-drafts\/(\d{8})\/\1-(\d{2})-(\d{1,2})-([a-f0-9]{64})\.json$/.exec(String(sourcePath));
  check(match, 'publication_source_path_invalid');
  const bytes = fs.readFileSync(path.join(rootDir, sourcePath));
  check(hash(bytes) === match[4], 'publication_source_hash_mismatch');
  let bundle;
  try { bundle = JSON.parse(bytes); } catch { throw Error('publication_source_json_invalid'); }
  const raceKey = `${match[1]}-${match[2]}-${match[3]}`, articleSeries = seriesOfBundle(bundle);
  check(bundle.record?.raceKey === raceKey, 'publication_source_identity_mismatch');
  const sourceTime = Date.parse(bundle.record.selectedAt || bundle.monitor?.confirmedAt || bundle.capturedAt);
  check(Number.isFinite(sourceTime) && sourceTime < Date.parse(bundle.record.deadlineAt), 'publication_recovery_source_time_invalid');
  return { sourcePath, sourceSha256: match[4], raceKey, articleSeries,
    publicationKey: publicationKey(raceKey, articleSeries), sourceTime };
}
async function githubBytes(file, revision, base, options, request) {
  const response = await request(`${base}/contents/${file}?ref=${revision}`, options);
  check(response.status === 200, `publication_recovery_file_unavailable_${response.status}`);
  let data = await response.json();
  check(data.type === 'file' && data.path === file && /^[a-f0-9]{40}$/.test(data.sha || ''), 'publication_recovery_file_identity_invalid');
  const blobSha = data.sha;
  // Contents returns encoding:none for large immutable originals. The observed
  // Git blob SHA is the only allowed fallback; never download a guessed URL.
  if (data.encoding === 'none') {
    const blob = await request(`${base}/git/blobs/${blobSha}`, options);
    check(blob.status === 200, `publication_recovery_blob_unavailable_${blob.status}`);
    data = await blob.json();
    check(data.sha === blobSha, 'publication_recovery_blob_identity_invalid');
  }
  check(data.encoding === 'base64' && typeof data.content === 'string' &&
    /^[A-Za-z0-9+/\r\n]*={0,2}[\r\n]*$/.test(data.content), 'publication_recovery_file_encoding_invalid');
  const bytes = Buffer.from(data.content, 'base64');
  const gitSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  check(gitSha === blobSha, 'publication_recovery_blob_hash_mismatch');
  return bytes;
}
async function verifyRecoveryPresentation(identity, claimSha, { base, options, request, rootDir = process.cwd() }) {
  check(/^[a-f0-9]{40}$/.test(claimSha || ''), 'publication_recovery_claim_commit_invalid');
  const commitResponse = await request(`${base}/git/commits/${claimSha}`, options);
  check(commitResponse.status === 200, `publication_recovery_commit_unavailable_${commitResponse.status}`);
  const commit = await commitResponse.json();
  check(commit.sha === claimSha && /^[a-f0-9]{40}$/.test(commit.tree?.sha || ''), 'publication_recovery_claim_commit_invalid');
  const original = await githubBytes(identity.sourcePath, claimSha, base, options, request);
  check(hash(original) === identity.sourceSha256, 'publication_recovery_claim_source_mismatch');
  // Read the renderer first to bound dependency lookup and reject unknown code.
  const rendererSha256 = hash(await githubBytes(PATHS.rendererSha256, claimSha, base, options, request));
  const current = localFingerprints(rootDir);
  const presentationVersion = Object.keys(HISTORICAL).find(version => HISTORICAL[version].rendererSha256 === rendererSha256)
    || (rendererSha256 === current.rendererSha256 ? 'readable-v4' : null);
  check(presentationVersion, 'publication_recovery_renderer_unreviewed');
  const expected = presentationVersion === 'readable-v4' ? current : HISTORICAL[presentationVersion];
  const fingerprints = { rendererSha256 };
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'rendererSha256') continue;
    fingerprints[key] = hash(await githubBytes(PATHS[key], claimSha, base, options, request));
    check(fingerprints[key] === value, 'publication_recovery_dependency_unreviewed');
  }
  // Recovery uses the same navigation, pricing, series and generator semantics.
  // Historical v1/v2 modules are frozen locally; current foundational files must
  // still match their reviewed snapshots before historical code is selected.
  if (presentationVersion !== 'readable-v4') {
    for (const key of Object.keys(COMMON)) check(current[key] === COMMON[key], 'publication_recovery_local_dependency_changed');
    check(hash(fs.readFileSync(path.join(__dirname, 'note-recovery-readable-v1.cjs'))) === LEGACY_READABLE.rendererSha256,
      'publication_recovery_local_renderer_changed');
    check(current.navigationSha256 === HISTORICAL['readable-v2'].navigationSha256, 'publication_recovery_local_dependency_changed');
    if (presentationVersion === 'readable-v3') {
      for (const key of ['categorySha256', 'modelSha256']) check(current[key] === expected[key], 'publication_recovery_local_dependency_changed');
      check(hash(fs.readFileSync(path.join(__dirname, 'note-recovery-readable-v3.cjs'))) === expected.rendererSha256, 'publication_recovery_local_renderer_changed');
    }
    if (presentationVersion === 'readable-v2') {
      check(current.categorySha256 === expected.categorySha256, 'publication_recovery_local_dependency_changed');
      check(hash(fs.readFileSync(path.join(__dirname, 'note-recovery-readable-v2.cjs'))) === expected.rendererSha256,
        'publication_recovery_local_renderer_changed');
    }
  }
  const evidence = Object.freeze({ version: 'note-recovery-presentation-v1', ...identity,
    claimCommitSha: claimSha, presentationVersion, codeSha256: hash(JSON.stringify(fingerprints)) });
  verifiedEvidence.set(evidence, JSON.stringify(evidence));
  return evidence;
}
function requireRecoveryEvidence(evidence, identity) {
  check(evidence && typeof evidence === 'object' && verifiedEvidence.has(evidence) &&
    verifiedEvidence.get(evidence) === JSON.stringify(evidence) && Object.isFrozen(evidence), 'publication_recovery_evidence_unverified');
  for (const key of ['sourcePath', 'sourceSha256', 'raceKey', 'articleSeries', 'publicationKey', 'sourceTime']) {
    check(evidence[key] === identity[key], 'publication_recovery_evidence_mismatch');
  }
  return evidence.presentationVersion;
}
module.exports = { PATHS, HISTORICAL, recoveryIdentity, verifyRecoveryPresentation, requireRecoveryEvidence };
