'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const { publicationPayload, parsePublishedDisplayProof } = require('./note-publication-source');
const { recoveryIdentity } = require('./note-recovery-presentation.cjs');
const { recoveryClaimStatus, requireRecoveryPublicationGate, requirePublicationGate,
  preparePublicationRecovery, recoverClaimedPublication } = require('./note-github-ui-transport');
const { requestFixture, response, blobSha } = require('./note-recovery-test-fixture.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_SHA: 'a'.repeat(40), NOTE_CLAIM_TOKEN: 'synthetic-test' };
function original(normal = false) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-recovery-proof-'));
  fs.mkdirSync(path.join(rootDir, 'config'));
  fs.copyFileSync(path.join(__dirname, '../config/note-marketing.json'), path.join(rootDir, 'config/note-marketing.json'));
  const bundle = fixture();
  if (normal) {
    bundle.version = 'note-draft-bundle-v1'; delete bundle.monitor; delete bundle.record.source;
    const prediction = bundle.record.prediction;
    Object.assign(prediction, { date: bundle.record.date, confidence: 84,
      race: { date: bundle.record.date, stadiumName: bundle.record.place, raceNo: bundle.record.raceNo, raceInfo: { deadline: '17:29' } },
      mainSheet: { honmei: { boatNo: 1, name: 'テスト選手', score: 84 },
        evaluations: [1,2,3,4,5,6].map(boatNo => ({ boatNo, name: 'テスト選手', score: 84 })),
        tickets: bundle.baselinePracticalTickets, coverTickets: [{ ticket: '1-3-2', odds: 30 }], flowTickets: [{ ticket: '2-1-3', odds: 50 }] },
      manshuSheet: { tickets: [{ ticket: '3-4-5', odds: 120 }] },
      raceFlow: { title: 'イン逃げ本線', summary: '1号艇の逃げを中心に考える。' } });
    bundle.article = require('../js/note-generator').generateArticle(prediction, { practicalTickets: bundle.baselinePracticalTickets });
  }
  const bytes = JSON.stringify(bundle);
  const sourcePath = `data/note-drafts/${bundle.record.date}/${bundle.record.raceKey}-${hash(bytes)}.json`;
  fs.mkdirSync(path.dirname(path.join(rootDir, sourcePath)), { recursive: true });
  fs.writeFileSync(path.join(rootDir, sourcePath), bytes);
  return { bundle, bytes, sourcePath, rootDir, identity: recoveryIdentity(sourcePath, rootDir),
    cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }) };
}
function publicPage(payload, override) {
  const url = 'https://note.com/great_robin3243/n/n123abc', visited = [];
  const article = { first: () => ({ waitFor: async () => {} }), filter: () => article,
    count: async () => 1, getAttribute: async () => url };
  let current;
  const page = { goto: async address => { current = address; visited.push(address); return { ok: () => true }; },
    url: () => current, getByRole: role => role === 'link' ? article : { waitFor: async () => {} },
    locator: selector => selector === 'article' ? { innerText: async () => override ?? `${payload.freeText}\n\n${payload.paidText}\n¥200` }
      : selector === '.note-common-styles__textnote-body' ? { count: async () => 1,
        innerText: async () => (override ?? `${payload.freeText}\n\n${payload.paidText}`).replace(/\n¥200$/, '') }
      : { evaluateAll: async () => ['2026-09-28T16:02:00+09:00'] } };
  return { page, visited };
}
async function pinned(f, version, options = {}) {
  const mock = requestFixture(f.identity, { version, rootDir: f.rootDir, ...options });
  const gate = await recoveryClaimStatus(f.identity, env, mock.request, f.rootDir);
  assert.equal(gate.ok, true);
  const payload = publicationPayload(f.sourcePath, f.rootDir, f.identity.sourceTime,
    { presentationVersion: gate.recoveryEvidence.presentationVersion });
  return { ...mock, ...gate, payload };
}

test('historical v1/v2 recovery pins exact old body and proof; new publication uses v4', async () => {
  const f = original();
  try {
    for (const version of ['readable-v1', 'readable-v2', 'readable-v3', 'readable-v4']) {
      const p = await pinned(f, version), before = fs.readFileSync(path.join(f.rootDir, f.sourcePath), 'utf8');
      assert.equal(p.payload.presentationVersion, version);
      assert.equal(p.recoveryEvidence.claimCommitSha, p.claimSha);
      assert.equal(p.recoveryEvidence.sourceSha256, hash(f.bytes));
      assert.equal(p.payload.paidText.includes('🔄 コロがし検証対象'), ['readable-v3', 'readable-v4'].includes(version));
      assert.deepEqual(requireRecoveryPublicationGate(p.payload, p.recoveryEvidence, f.rootDir), p.payload);
      if (version === 'readable-v1') {
        assert.ok(p.payload.freeText.includes('展開の考え方\n'));
        assert.ok(!p.payload.freeText.includes('🧭 展開の考え方'));
        assert.ok(p.payload.freeText.includes('的中報告の対象は中心の買い目です。'));
        assert.notEqual(p.payload.freeText, require('./note-readable-article').readableArticle(f.bundle.article, f.bundle,
          { presentationVersion: 'readable-v1' }).freeText, 'later v1 free introduction is not the published original');
      }
      const ui = publicPage(p.payload), receipt = await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence);
      assert.deepEqual(receipt.publishedDisplayProof, parsePublishedDisplayProof(p.payload));
      assert.equal(receipt.sourceSha256, hash(f.bytes));
      assert.ok(!Object.hasOwn(receipt, 'paidText'));
      assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(receipt.publishedDisplayProof)));
      assert.deepEqual(ui.visited, ['https://note.com/great_robin3243', receipt.url]);
      assert.equal(fs.readFileSync(path.join(f.rootDir, f.sourcePath), 'utf8'), before);
      if (version !== 'readable-v4') assert.throws(() => requirePublicationGate(p.payload, f.rootDir, f.identity.sourceTime), /handoff_mismatch/);
      else assert.deepEqual(requirePublicationGate(p.payload, f.rootDir, f.identity.sourceTime), p.payload);
      assert.equal(publicationPayload(f.sourcePath, f.rootDir, f.identity.sourceTime).presentationVersion, 'readable-v4');
    }
  } finally { f.cleanup(); }
});

test('prepare recovery ignores untrusted version fields and preserves original v2 claim semantics', async () => {
  const f = original();
  try {
    const mock = requestFixture(f.identity, { version: 'readable-v2', rootDir: f.rootDir });
    const result = await preparePublicationRecovery({ rootDir: f.rootDir, env, request: mock.request,
      handoff: { candidates: [{ ...f.identity, presentationVersion: 'readable-v3', sourceCommit: 'd'.repeat(40) }] } });
    assert.equal(result.ok, true); assert.equal(result.recoveryOnly, true);
    assert.equal(result.payload.presentationVersion, 'readable-v2');
    assert.ok(!result.payload.paidText.includes('🔄 コロがし検証対象'));
    assert.ok(mock.calls.filter(url => url.includes('/contents/')).every(url => url.endsWith('?ref=' + mock.claimSha)));
    assert.ok(mock.calls.some(url => url.includes('/contents/scripts/note-category-article.js')));
    assert.ok(mock.calls.some(url => url.includes('/contents/scripts/note-publication-source.js')));
    assert.ok(mock.calls.some(url => url.includes('/contents/js/note-generator.js')));
    for (const file of ['scripts/note-pricing.js', 'scripts/note-article-series.js', 'scripts/note-marketing-content.js', 'config/note-marketing.json']) {
      assert.ok(mock.calls.some(url => url.includes('/contents/' + file)));
    }
  } finally { f.cleanup(); }
});

test('claim code and immutable source verification supports large-source Git blob fallback', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v2', { largeSource: true });
    assert.ok(p.calls.some(url => url.includes('/git/blobs/')));
    assert.equal(p.payload.sourceSha256, f.identity.sourceSha256);
    assert.ok(p.calls.every(url => url.startsWith('https://api.github.com/repos/takechanman12250711-oss/chappy-boatrace-ai/')));
  } finally { f.cleanup(); }
});

test('a published receipt ends recovery without reinterpreting it under current code', async () => {
  const f = original();
  try {
    const mock = requestFixture(f.identity, { rootDir: f.rootDir, mutate: (url, result) => url.includes('/note-published/') ? response({}) : result });
    assert.deepEqual(await recoveryClaimStatus(f.identity, env, mock.request, f.rootDir), { ok: false, reason: 'publication_receipt_exists' });
    assert.equal(mock.calls.length, 2);
  } finally { f.cleanup(); }
});

test('wrong ref, non-commit, wrong commit object and mismatched source identity cannot select a renderer', async () => {
  const f = original();
  try {
    for (const mutate of [
      async (url, r) => url.includes('/note-draft-claim/') ? response({ ...(await r.json()), ref: 'refs/tags/wrong' }) : r,
      async (url, r) => url.includes('/note-draft-claim/') ? response({ ...(await r.json()), object: { type: 'tag', sha: 'b'.repeat(40) } }) : r,
      async (url, r) => url.includes('/note-draft-claim/') ? response({ ...(await r.json()), object: { type: 'commit', sha: 'main' } }) : r,
      async (url, r) => url.includes('/git/commits/') ? response({ ...(await r.json()), sha: 'e'.repeat(40) }) : r
    ]) {
      const mock = requestFixture(f.identity, { rootDir: f.rootDir, mutate });
      await assert.rejects(recoveryClaimStatus(f.identity, env, mock.request, f.rootDir));
    }
    const mock = requestFixture(f.identity, { rootDir: f.rootDir });
    await assert.rejects(recoveryClaimStatus({ ...f.identity, sourceSha256: 'e'.repeat(64) }, env, mock.request, f.rootDir), /claim_identity_mismatch/);
  } finally { f.cleanup(); }
});

test('unknown or changed code/dependencies/source fail closed without evaluating downloaded code', async () => {
  const f = original();
  try {
    for (const file of [f.sourcePath, 'scripts/note-readable-article.js', 'scripts/note-publication-source.js',
      'scripts/note-category-article.js', 'js/note-generator.js', 'scripts/note-pricing.js',
      'scripts/note-article-series.js', 'scripts/note-marketing-content.js', 'config/note-marketing.json']) {
      const mock = requestFixture(f.identity, { version: 'readable-v2', rootDir: f.rootDir, mutate: async (url, result) => {
        if (!url.includes('/contents/' + file + '?')) return result;
        const data = await result.json(), bytes = Buffer.from('throw Error("downloaded-code-must-never-run");');
        return response({ ...data, sha: blobSha(bytes), content: bytes.toString('base64') });
      } });
      await assert.rejects(recoveryClaimStatus(f.identity, env, mock.request, f.rootDir), /claim_source_mismatch|renderer_unreviewed|dependency_unreviewed/);
    }
    const missing = requestFixture(f.identity, { rootDir: f.rootDir,
      mutate: (url, result) => url.includes('/contents/' + f.sourcePath) ? response(null, 404) : result });
    await assert.rejects(recoveryClaimStatus(f.identity, env, missing.request, f.rootDir), /file_unavailable_404/);
    const brokenBlob = requestFixture(f.identity, { rootDir: f.rootDir, largeSource: true,
      mutate: async (url, result) => url.includes('/git/blobs/') ? response({ ...(await result.json()), sha: 'e'.repeat(40) }) : result });
    await assert.rejects(recoveryClaimStatus(f.identity, env, brokenBlob.request, f.rootDir), /blob_identity_invalid/);
  } finally { f.cleanup(); }
});

test('recovery tokens cannot be forged, serialized, rebound or used to alter the frozen body', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v2');
    for (const evidence of [undefined, {}, { ...p.recoveryEvidence }, JSON.parse(JSON.stringify(p.recoveryEvidence)),
      Object.freeze({ ...p.recoveryEvidence, presentationVersion: 'readable-v3' })]) {
      assert.throws(() => requireRecoveryPublicationGate(p.payload, evidence, f.rootDir), /evidence_unverified/);
    }
    assert.throws(() => requireRecoveryPublicationGate({ ...p.payload, presentationVersion: 'readable-v3' }, p.recoveryEvidence, f.rootDir), /handoff_mismatch/);
    assert.throws(() => requireRecoveryPublicationGate({ ...p.payload, freeText: p.payload.freeText + '\nchanged' }, p.recoveryEvidence, f.rootDir), /handoff_mismatch/);
    const wrong = publicPage(p.payload, `${p.payload.freeText}\n\n${p.payload.paidText.replace('1 → 2 → 3・4', '1 → 3 → 2・4')}\n¥200`);
    await assert.rejects(recoverClaimedPublication(wrong.page, p.payload, f.rootDir, p.recoveryEvidence), /recovery_body_mismatch/);
    const unverified = publicPage(p.payload);
    await assert.rejects(recoverClaimedPublication(unverified.page, p.payload, f.rootDir), /evidence_unverified/);
    assert.deepEqual(unverified.visited, [], 'missing claim proof stops before browser navigation');
  } finally { f.cleanup(); }
});

test('normal historical recovery preserves its verified navigation and old presentation', async () => {
  const f = original(true);
  try {
    for (const version of ['readable-v1', 'readable-v2']) {
      const p = await pinned(f, version);
      assert.ok(p.payload.freeText.includes('今日の予想一覧\nhttps://note.com/great_robin3243/n/'));
      assert.ok(p.payload.freeText.includes('はじめての方へ\nhttps://note.com/great_robin3243/n/'));
      assert.ok(!p.payload.freeText.includes('コロがし検証'));
      assert.ok(!p.payload.paidText.includes('コロがし検証'));
      const ui = publicPage(p.payload), receipt = await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence);
      assert.equal(receipt.publishedDisplayProof.presentationVersion, version);
    }
  } finally { f.cleanup(); }
});

test('historical body check rejects appended v3, extra ticket text, changed whitespace and unknown layout', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v2');
    const { recoveryBodyMatches } = require('./note-github-ui-transport');
    const body = `${p.payload.freeText}\n\n${p.payload.paidText}`;
    const v3 = publicationPayload(f.sourcePath, f.rootDir, f.identity.sourceTime);
    const appendix = v3.paidText.slice(p.payload.paidText.length);
    for (const text of [body + appendix + '\n¥200', body + '\n追加の説明\n¥200',
      body + '\n6 → 5 → 4\n¥200', '1 → 2 → 3\n' + body + '\n¥200',
      body.replace('1 → 2 → 3・4', '1→2→3・4') + '\n¥200',
      `${p.payload.freeText}\n未知の境界テキスト\n${p.payload.paidText}\n¥200`]) {
      assert.equal(recoveryBodyMatches(text.replace(/\n¥200$/, ''), p.payload), false);
      await assert.rejects(recoverClaimedPublication(publicPage(p.payload, text).page, p.payload, f.rootDir, p.recoveryEvidence), /recovery_body_mismatch/);
    }
    assert.equal(recoveryBodyMatches(body.replaceAll('\n', '\r\n\r\n'), p.payload), true);
  } finally { f.cleanup(); }
});

test('serialized handoff must reacquire claim evidence before historical recovery', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v2');
    const handoff = JSON.parse(JSON.stringify(p.payload)), serializedEvidence = JSON.parse(JSON.stringify(p.recoveryEvidence));
    assert.throws(() => requireRecoveryPublicationGate(handoff, serializedEvidence, f.rootDir), /evidence_unverified/);
    const fetchedAgain = requestFixture(f.identity, { version: 'readable-v2', rootDir: f.rootDir });
    const gate = await recoveryClaimStatus(handoff, env, fetchedAgain.request, f.rootDir);
    assert.ok(fetchedAgain.calls.some(url => url.includes('/git/ref/tags/note-draft-claim/')));
    assert.deepEqual(requireRecoveryPublicationGate(handoff, gate.recoveryEvidence, f.rootDir), handoff);
    const receipt = await recoverClaimedPublication(publicPage(handoff).page, handoff, f.rootDir, gate.recoveryEvidence);
    assert.equal(receipt.publishedDisplayProof.presentationVersion, 'readable-v2');
  } finally { f.cleanup(); }
});

test('missing or ambiguous paid-body element blocks recovery instead of trusting article wrapper text', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v2');
    for (const count of [0, 2]) {
      const ui = publicPage(p.payload), locator = ui.page.locator;
      ui.page.locator = selector => selector === '.note-common-styles__textnote-body' ? { count: async () => count } : locator(selector);
      await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence), /body_layout_unverified/);
    }
  } finally { f.cleanup(); }
});
