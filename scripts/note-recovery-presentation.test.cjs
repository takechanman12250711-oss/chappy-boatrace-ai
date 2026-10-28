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
  preparePublicationRecovery, recoverClaimedPublication, loadRecoveryTarget, verifyRecoveredPublicPage,
  recoveryBodyDiagnostic, recoveryAccessDiagnostic, articleBody } = require('./note-github-ui-transport');
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
const recoveryUrl = 'https://note.com/great_robin3243/n/n123abc';
const target = payload => ({ sourcePath: payload.sourcePath, url: recoveryUrl });
const targetedEnv = sourcePath => ({ ...env, NOTE_RECOVERY_SOURCE_PATH: sourcePath, NOTE_RECOVERY_URL: recoveryUrl });
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
  const anonymousVisited = [], anonymousChecks = [];
  let anonymousCurrent, closed = 0;
  const anonymous = {
    goto: async address => { anonymousCurrent = address; anonymousVisited.push(address); return { ok: () => true }; },
    url: () => anonymousCurrent,
    getByRole: (role, options) => ({ waitFor: async () => { anonymousChecks.push([role, options]); } }),
    locator: selector => selector === '.note-common-styles__textnote-body'
      ? { count: async () => 1, innerText: async () => payload.freeText }
      : { evaluateAll: async () => ['2026-09-28T16:02:00+09:00'] }
  };
  page.context = () => ({ browser: () => ({ newContext: async () => ({
    newPage: async () => anonymous, close: async () => { closed++; }
  }) }) });
  return { page, visited, anonymous, anonymousVisited, anonymousChecks, closed: () => closed };
}
async function pinned(f, version, options = {}) {
  const mock = requestFixture(f.identity, { version, rootDir: f.rootDir, ...options });
  const gate = await recoveryClaimStatus(f.identity, env, mock.request, f.rootDir);
  assert.equal(gate.ok, true);
  const payload = publicationPayload(f.sourcePath, f.rootDir, f.identity.sourceTime,
    { presentationVersion: gate.recoveryEvidence.presentationVersion });
  return { ...mock, ...gate, payload };
}

test('historical v1-v5 recovery pins exact old body and proof; new publication uses free v6', async () => {
  const f = original();
  try {
    for (const version of ['readable-v1', 'readable-v2', 'readable-v3', 'readable-v4', 'readable-v5']) {
      const p = await pinned(f, version), before = fs.readFileSync(path.join(f.rootDir, f.sourcePath), 'utf8');
      assert.equal(p.payload.presentationVersion, version);
      assert.equal(p.recoveryEvidence.claimCommitSha, p.claimSha);
      assert.equal(p.recoveryEvidence.sourceSha256, hash(f.bytes));
      assert.equal(p.payload.paidText.includes('🔄 コロがし検証対象'), ['readable-v3', 'readable-v4', 'readable-v5'].includes(version));
      assert.deepEqual(requireRecoveryPublicationGate(p.payload, p.recoveryEvidence, f.rootDir), p.payload);
      if (version === 'readable-v1') {
        assert.ok(p.payload.freeText.includes('展開の考え方\n'));
        assert.ok(!p.payload.freeText.includes('🧭 展開の考え方'));
        assert.ok(p.payload.freeText.includes('的中報告の対象は中心の買い目です。'));
        assert.notEqual(p.payload.freeText, require('./note-readable-article').readableArticle(f.bundle.article, f.bundle,
          { presentationVersion: 'readable-v1' }).freeText, 'later v1 free introduction is not the published original');
      }
      const ui = publicPage(p.payload), receipt = await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload));
      assert.deepEqual(receipt.publishedDisplayProof, parsePublishedDisplayProof(p.payload));
      assert.equal(receipt.sourceSha256, hash(f.bytes));
      assert.ok(!Object.hasOwn(receipt, 'paidText'));
      assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(receipt.publishedDisplayProof)));
      assert.deepEqual(ui.visited, [receipt.url]);
      assert.deepEqual(ui.anonymousVisited, [receipt.url]);
      assert.equal(ui.closed(), 1);
      assert.equal(fs.readFileSync(path.join(f.rootDir, f.sourcePath), 'utf8'), before);
      assert.throws(() => requirePublicationGate(p.payload, f.rootDir, f.identity.sourceTime), /handoff_mismatch/);
      const current = publicationPayload(f.sourcePath, f.rootDir, f.identity.sourceTime);
      assert.equal(current.presentationVersion, 'readable-v6');
      assert.equal(current.price, 0);
      assert.equal(p.payload.price, 200);
      // The free v6 keeps the exact paid-section bytes of v5; only free wording and the paywall change.
      if (version === 'readable-v5') assert.equal(current.paidText, p.payload.paidText);
      // Only the free part gains the notice; the paid body and proof stay the v4 bytes.
      if (version === 'readable-v4' || version === 'readable-v5') assert.equal(p.payload.freeText.endsWith(require('./note-readable-article').FREE_NOTICE), version === 'readable-v5');
    }
  } finally { f.cleanup(); }
});

test('prepare recovery ignores untrusted version fields and preserves original v2 claim semantics', async () => {
  const f = original();
  try {
    const mock = requestFixture(f.identity, { version: 'readable-v2', rootDir: f.rootDir });
    const result = await preparePublicationRecovery({ rootDir: f.rootDir, env: targetedEnv(f.sourcePath), request: mock.request,
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
    await assert.rejects(recoverClaimedPublication(wrong.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)), /recovery_body_mismatch/);
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
      const ui = publicPage(p.payload), receipt = await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload));
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
      await assert.rejects(recoverClaimedPublication(publicPage(p.payload, text).page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)), /recovery_body_mismatch/);
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
    const receipt = await recoverClaimedPublication(publicPage(handoff).page, handoff, f.rootDir, gate.recoveryEvidence, target(handoff));
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
      await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)), /body_layout_unverified/);
    }
  } finally { f.cleanup(); }
});

test('recovery requires a single strict original path and owner URL before any lookup', async () => {
  let calls = 0;
  const request = async () => { calls++; throw Error('must not request'); };
  const sourcePath = `data/note-drafts/20261012/20261012-12-12-${'a'.repeat(64)}.json`;
  for (const overrides of [{}, { NOTE_RECOVERY_SOURCE_PATH: sourcePath }, { NOTE_RECOVERY_URL: recoveryUrl },
    { NOTE_RECOVERY_SOURCE_PATH: '../' + sourcePath, NOTE_RECOVERY_URL: recoveryUrl },
    { NOTE_RECOVERY_SOURCE_PATH: sourcePath.replace('/20261012/', '/20261013/'), NOTE_RECOVERY_URL: recoveryUrl },
    ...['https://note.com/other/n/n123abc', recoveryUrl + '?preview=true', recoveryUrl + '#fragment',
      recoveryUrl + '/', recoveryUrl.replace('https:', 'http:'), recoveryUrl.replace('note.com', 'note.com.evil.test'),
      recoveryUrl.replace('note.com', 'user@note.com')].map(NOTE_RECOVERY_URL => ({ NOTE_RECOVERY_SOURCE_PATH: sourcePath, NOTE_RECOVERY_URL }))]) {
    await assert.rejects(preparePublicationRecovery({ env: { ...env, ...overrides }, request }), /publication_recovery_(target_required|source_invalid|url_invalid)/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(loadRecoveryTarget(targetedEnv(sourcePath)), { sourcePath, url: recoveryUrl, noteId: 'n123abc' });
  const { run } = require('./note-github-ui-transport');
  await assert.rejects(run({ env: { NOTE_UI_MODE: 'recover' } }), /publication_recovery_target_required/);
});

test('targeted recovery ignores a tempting other claim and works without latest handoff', async () => {
  const f = original();
  try {
    const mock = requestFixture(f.identity, { version: 'readable-v4', rootDir: f.rootDir });
    const result = await preparePublicationRecovery({ rootDir: f.rootDir, env: targetedEnv(f.sourcePath), request: mock.request,
      handoff: { candidates: [{ sourcePath: 'unrelated-source', raceKey: '20261012-14-1' }] } });
    assert.equal(result.ok, true);
    assert.equal(result.payload.sourcePath, f.sourcePath);
    assert.equal(result.payload.sourceSha256, hash(f.bytes));
    assert.ok(!fs.existsSync(path.join(f.rootDir, 'data/note-publish/latest.json')));
    const exists = await preparePublicationRecovery({ rootDir: f.rootDir, env: targetedEnv(f.sourcePath), request: async url =>
      response({}, url.includes('/note-published/') ? 200 : 404) });
    assert.deepEqual(exists, { ok: false, reason: 'publication_receipt_exists' });
  } finally { f.cleanup(); }
});

test('target/source mismatch stops before navigation and never falls back to title search', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v4');
    for (const selected of [undefined, { ...target(p.payload), sourcePath: f.sourcePath.replace(/-[a-f0-9]{64}\.json$/, '-' + '0'.repeat(64) + '.json') }]) {
      const ui = publicPage(p.payload);
      await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, selected), /publication_recovery_target_(required|mismatch)/);
      assert.deepEqual(ui.visited, []);
    }
  } finally { f.cleanup(); }
});

test('anonymous confirmation must match original free body, exact price, boundary, identity and date', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v4');
    const publishedAt = '2026-09-28T16:02:00+09:00';
    const ok = publicPage(p.payload);
    await verifyRecoveredPublicPage(ok.anonymous, p.payload, target(p.payload), publishedAt);
    assert.deepEqual(ok.anonymousChecks, [
      ['heading', { name: p.payload.title, exact: true }], ['heading', { name: 'ここから先は', exact: true }],
      ['button', { name: '¥200', exact: true }]
    ]);
    for (const scenario of ['redirect', 'http-error', 'price-missing', 'boundary-missing', 'heading-missing',
      'free-added', 'free-omitted', 'paid-leaked', 'body-missing', 'body-ambiguous', 'date-mismatch', 'date-duplicate']) {
      const ui = publicPage(p.payload), anon = ui.anonymous, locator = anon.locator;
      if (scenario === 'redirect') anon.url = () => recoveryUrl + '?preview=true';
      if (scenario === 'http-error') anon.goto = async () => ({ ok: () => false });
      anon.getByRole = (role, options) => ({ waitFor: async () => {
        if ((scenario === 'price-missing' && role === 'button') ||
          (scenario === 'boundary-missing' && options.name === 'ここから先は') ||
          (scenario === 'heading-missing' && options.name === p.payload.title)) throw Error('visible_timeout');
      } });
      anon.locator = selector => {
        if (selector === '.note-common-styles__textnote-body') return {
          count: async () => scenario === 'body-missing' ? 0 : scenario === 'body-ambiguous' ? 2 : 1,
          innerText: async () => scenario === 'free-added' ? p.payload.freeText + '\nunknown' :
            scenario === 'free-omitted' ? p.payload.freeText.split('\n').slice(1).join('\n') :
            scenario === 'paid-leaked' ? `${p.payload.freeText}\n${p.payload.paidText}` : p.payload.freeText
        };
        if (selector === 'time[datetime]') return { evaluateAll: async () => scenario === 'date-mismatch' ? ['2026-09-28T16:03:00+09:00'] :
          scenario === 'date-duplicate' ? [publishedAt, publishedAt] : [publishedAt] };
        return locator(selector);
      };
      await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)),
        /publication_public_page_unavailable|visible_timeout|publication_recovery_(free_body|public_timestamp)/, scenario);
      assert.equal(ui.closed(), 1, scenario + ' closes anonymous context and produces no receipt');
    }
  } finally { f.cleanup(); }
});

test('targeted recovery rejects owner preview, late/future/ambiguous time and changed paid body', async () => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v4');
    for (const scenario of ['preview', 'late', 'future', 'duplicate', 'body-changed']) {
      const ui = publicPage(p.payload), locator = ui.page.locator;
      if (scenario === 'preview') ui.page.url = () => recoveryUrl + '?preview=true';
      ui.page.locator = selector => {
        if (selector === 'time[datetime]') return { evaluateAll: async () => scenario === 'late' ? [p.payload.deadlineAt] :
          scenario === 'future' ? ['2099-01-01T00:00:00Z'] : scenario === 'duplicate' ? ['2026-09-28T16:02:00+09:00', '2026-09-28T16:02:00+09:00'] : ['2026-09-28T16:02:00+09:00'] };
        if (selector === '.note-common-styles__textnote-body' && scenario === 'body-changed') return { count: async () => 1, innerText: async () => `${p.payload.freeText}\nchanged` };
        return locator(selector);
      };
      await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)),
        /publication_public_page_unavailable|publication_timestamp_unverified|publication_recovery_body_mismatch/);
      assert.deepEqual(ui.anonymousVisited, []);
    }
  } finally { f.cleanup(); }
});

test('workflow keeps recovery inputs out of shell interpolation and never rebuilds current handoff for recover', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '../.github/workflows/note-github-ui-transport.yml'), 'utf8');
  const sparsePaths = yaml.match(/          sparse-checkout: \|\n((?: {12}[^\n]+\n)+)/)?.[1].trim().split('\n').map(line => line.trim());
  assert.ok(sparsePaths?.includes('.github/workflows'), 'transport checkout must include its workflow contract test input');
  assert.match(yaml, /recovery_source_path:\n[\s\S]*recovery_url:/);
  assert.match(yaml, /NOTE_RECOVERY_SOURCE_PATH: \$\{\{ github.event_name == 'workflow_dispatch' && inputs.recovery_source_path \|\| '' \}\}/);
  assert.match(yaml, /NOTE_RECOVERY_URL: \$\{\{ github.event_name == 'workflow_dispatch' && inputs.recovery_url \|\| '' \}\}/);
  assert.match(yaml, /const handoff = mode === 'publish' \?/);
  assert.doesNotMatch(yaml, /\['publish', 'recover'\]\.includes\(mode\) \? require/);
  const shell = yaml.slice(yaml.indexOf('    steps:'));
  assert.doesNotMatch(shell, /\$\{\{[^}]*inputs\.recovery_/);
  assert.match(yaml, /group: note-ui-transport/);
});

test('recovery body diagnostics expose only bounded metadata, never text or caller fields', () => {
  const payload = { presentationVersion: 'readable-v4', freeText: 'FREE_CANARY\nhttps://private.invalid/login',
    paidText: 'PAID_CANARY\n  2 → 3', cookie: 'COOKIE_CANARY', token: 'TOKEN_CANARY' };
  const full = articleBody(payload), lines = require('./note-editor-content').contentLines(full);
  const fields = ['version', 'presentationVersion', 'actualLength', 'expectedLength', 'actualLines',
    'expectedLines', 'actualSha256', 'expectedSha256', 'firstMismatchLine', 'equalsFreeText'];
  const cases = [
    [full, null, false],
    [full.replace(/\n/g, '\r\n').replace(/ /g, '\u00a0'), null, false],
    [payload.freeText, 3, true],
    ['', 1, false],
    [lines.slice(0, 3).join('\n'), 4, false],
    [full + '\nEXTRA_CANARY', 5, false],
    [full.replace('PAID_CANARY', 'CHANGED_CANARY'), 3, false],
    [full.replace('  2', ' 2'), 4, false]
  ];
  for (const [actual, mismatch, freeOnly] of cases) {
    const diagnostic = recoveryBodyDiagnostic(actual, payload), serialized = JSON.stringify(diagnostic);
    assert.deepEqual(Object.keys(diagnostic).sort(), [...fields].sort());
    assert.equal(diagnostic.version, 'note-recovery-body-diagnostic-v1');
    assert.equal(diagnostic.presentationVersion, 'readable-v4');
    assert.equal(diagnostic.actualLength, actual.length);
    assert.equal(diagnostic.expectedLength, full.length);
    assert.equal(diagnostic.actualLines, require('./note-editor-content').contentLines(actual).length);
    assert.equal(diagnostic.expectedLines, 4);
    assert.equal(diagnostic.expectedSha256, hash(JSON.stringify(lines)));
    assert.equal(diagnostic.actualSha256, hash(JSON.stringify(require('./note-editor-content').contentLines(actual))));
    assert.equal(diagnostic.firstMismatchLine, mismatch);
    assert.equal(diagnostic.equalsFreeText, freeOnly);
    assert.doesNotMatch(serialized, /CANARY|https:|private\.invalid|2 → 3|cookie|token/i);
  }
  const unknown = recoveryBodyDiagnostic(full, { ...payload, presentationVersion: 'UNTRUSTED_CANARY' });
  assert.equal(unknown.presentationVersion, 'unknown');
  assert.doesNotMatch(JSON.stringify(unknown), /CANARY/);
});

test('body mismatch logs its original snapshot and preserves rejection even when logging fails', async t => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v4');
    for (const throws of [false, true]) {
      const ui = publicPage(p.payload, p.payload.freeText), locator = ui.page.locator;
      let reads = 0, counts = 0;
      ui.page.locator = selector => selector === '.note-common-styles__textnote-body' ? {
        count: async () => { counts++; return 1; },
        innerText: async () => { reads++; return p.payload.freeText; }
      } : locator(selector);
      const logs = [], logger = t.mock.method(console, 'error', message => {
        logs.push(message);
        if (throws) throw Error('LOGGER_CANARY');
      });
      try {
        await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)),
          /^Error: publication_recovery_body_mismatch$/);
        assert.equal(reads, 2); assert.equal(counts, 2);
        assert.deepEqual(ui.visited, [recoveryUrl]);
        assert.deepEqual(ui.anonymousVisited, []);
        assert.equal(ui.closed(), 0);
        assert.equal(logs.length, 3);
        assert.match(logs[0], /^NOTE_UI_RECOVERY_BODY_DIAGNOSTIC=/);
        const diagnostic = JSON.parse(logs[0].split('=', 2)[1]);
        assert.equal(diagnostic.equalsFreeText, true);
        assert.equal(diagnostic.firstMismatchLine, diagnostic.actualLines + 1);
        assert.ok(diagnostic.expectedLines > diagnostic.actualLines);
        assert.ok(!logs[0].includes(p.payload.freeText));
        assert.ok(!logs[0].includes(p.payload.paidText));
        assert.doesNotMatch(logs[0], /LOGGER_CANARY|https:|<[^>]+>|cookie|token/i);
      } finally { logger.mock.restore(); }
    }
    const logs = [], logger = t.mock.method(console, 'error', message => logs.push(message));
    try {
      const ui = publicPage(p.payload);
      await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload));
      assert.deepEqual(logs, [], 'matching owner body emits no mismatch diagnostic');
    } finally { logger.mock.restore(); }
  } finally { f.cleanup(); }
});

function accessHarness(payload, scenario = 'match', later = payload.freeText) {
  const editUrl = 'https://editor.note.com/notes/n123abc/edit/';
  let editorUrl = editUrl, publicUrl = recoveryUrl;
  const calls = { opened: 0, closed: 0, navigation: [], located: 0, titleReads: 0,
    bodyReads: 0, publicReads: 0, mutations: 0 };
  const fail = () => { throw Error('PRIVATE_EXCEPTION_CANARY https://private.invalid/?token=TOKEN_CANARY'); };
  const mutate = () => { calls.mutations++; fail(); };
  const title = {
    inputValue: async () => { calls.titleReads++; if (scenario === 'title-read-error') fail();
      if (scenario === 'title-redirect') editorUrl += '?private=CANARY';
      return scenario === 'title-mismatch' ? 'PRIVATE_TITLE_CANARY' : payload.title; },
    isEditable: async () => { if (scenario === 'editable-error') fail(); return scenario !== 'title-disabled'; },
    fill: mutate, click: mutate
  };
  const body = {
    isEditable: async () => { if (scenario === 'editable-redirect') editorUrl += '?private=CANARY'; return scenario !== 'body-disabled'; },
    evaluate: async fn => { calls.bodyReads++; if (scenario === 'body-read-error') fail();
      if (scenario === 'body-redirect') editorUrl += '?private=CANARY';
      if (scenario === 'diagnostic-error') return { toString: fail };
      return fn({ tagName: 'DIV', getAttribute: key => key === 'contenteditable' ? 'true' : null,
        innerText: scenario === 'body-changed' ? payload.freeText + '\nPRIVATE_CHANGED_CANARY' : articleBody(payload) }); },
    fill: mutate, click: mutate
  };
  const editor = {
    goto: async url => { calls.navigation.push(url); if (scenario === 'navigation-error') fail();
      if (scenario === 'login') editorUrl = 'https://note.com/login?token=TOKEN_CANARY';
      if (scenario === 'wrong-note') editorUrl = 'https://editor.note.com/notes/n999/edit/';
      return { ok: () => scenario !== 'http-error' }; },
    url: () => editorUrl,
    close: async () => { calls.closed++; if (scenario === 'close-error') fail(); },
    click: mutate, fill: mutate, keyboard: { type: mutate, press: mutate }, waitForTimeout: mutate
  };
  const locate = async (_page, selectors) => { calls.located++; if (scenario === 'fields-error') fail();
    if (scenario === 'fields-redirect') editorUrl += '?private=CANARY';
    if (scenario === 'fields-missing') return null;
    return selectors[0].startsWith('textarea') ? title : body; };
  const page = {
    context: () => ({ newPage: async () => { calls.opened++; if (scenario === 'new-page-error') fail(); return editor; },
      newContext: mutate, browser: mutate }),
    url: () => scenario === 'public-before-redirect' ? recoveryUrl + '?private=CANARY' : publicUrl,
    locator: selector => { assert.equal(selector, '.note-common-styles__textnote-body'); return {
      count: async () => scenario === 'public-ambiguous' ? 2 : 1,
      innerText: async () => { calls.publicReads++; if (scenario === 'public-read-error') fail();
        if (scenario === 'public-after-redirect') publicUrl += '?private=CANARY'; return later; }
    }; },
    goto: mutate, reload: mutate, click: mutate, fill: mutate, waitForTimeout: mutate
  };
  return { page, editor, title, body, locate, calls, editUrl };
}

test('target editor and later public reads remain separate, private observations without writes or sleeps', async () => {
  const payload = { sourcePath: 'data/note-drafts/20261012/20261012-12-12-' + 'a'.repeat(64) + '.json',
    title: 'PRIVATE_TITLE_CANARY', presentationVersion: 'readable-v4',
    freeText: 'PRIVATE_FREE_CANARY\nhttps://private.invalid/', paidText: 'PRIVATE_PAID_CANARY\n  1 → 2' };
  const selected = loadRecoveryTarget(targetedEnv(payload.sourcePath));
  for (const [later, changed] of [[payload.freeText, false], [articleBody(payload), true], ['OTHER_PRIVATE_CANARY', true]]) {
    const h = accessHarness(payload, 'match', later);
    const d = await recoveryAccessDiagnostic(h.page, payload, selected, payload.freeText, h.locate);
    assert.equal(d.version, 'note-recovery-access-diagnostic-v1');
    assert.deepEqual(d.editor, { status: 'body_observed', httpOk: true, exactUrl: true, titleMatches: true,
      titleEditable: true, bodyEditable: true, body: recoveryBodyDiagnostic(articleBody(payload), payload) });
    assert.deepEqual(d.publicAfter, { status: 'body_observed', body: recoveryBodyDiagnostic(later, payload), changedSinceInitial: changed });
    assert.equal(d.tabClose, 'closed');
    assert.deepEqual(h.calls, { opened: 1, closed: 1, navigation: [h.editUrl], located: 2,
      titleReads: 1, bodyReads: 1, publicReads: 1, mutations: 0 });
    assert.doesNotMatch(JSON.stringify(d), /CANARY|https:|private\.invalid|1 → 2|cookie|token/i);
  }
  for (const selected of [{ ...target(payload), noteId: 'n999' }, { ...target(payload), noteId: 'n123abc', sourcePath: 'other' },
    { ...target(payload), noteId: 'n123abc', url: recoveryUrl + '?preview=true' }]) {
    const h = accessHarness(payload);
    const d = await recoveryAccessDiagnostic(h.page, payload, selected, payload.freeText, h.locate);
    assert.equal(d.editor.status, 'target_invalid');
    assert.equal(d.tabClose, 'not_opened'); assert.equal(d.publicAfter.status, 'not_checked');
    assert.equal(h.calls.opened + h.calls.bodyReads + h.calls.publicReads + h.calls.mutations, 0);
  }
});

test('access diagnostics fail closed on identity changes, unavailable fields, read errors and cleanup errors', async () => {
  const payload = { sourcePath: 'data/note-drafts/20261012/20261012-12-12-' + 'a'.repeat(64) + '.json',
    title: 'expected title', presentationVersion: 'readable-v4', freeText: 'FREE_CANARY', paidText: 'PAID_CANARY' };
  const selected = loadRecoveryTarget(targetedEnv(payload.sourcePath));
  const cases = { 'new-page-error': 'tab_open_failed', 'navigation-error': 'navigation_failed', login: 'login_redirect',
    'wrong-note': 'unexpected_url', 'http-error': 'http_error', 'fields-error': 'field_read_failed',
    'fields-redirect': 'unexpected_url', 'fields-missing': 'fields_missing', 'title-read-error': 'field_read_failed',
    'title-redirect': 'unexpected_url', 'title-mismatch': 'title_mismatch', 'editable-error': 'field_read_failed',
    'title-disabled': 'fields_not_editable', 'body-disabled': 'fields_not_editable', 'editable-redirect': 'unexpected_url',
    'body-read-error': 'body_read_failed', 'diagnostic-error': 'body_read_failed', 'body-redirect': 'unexpected_url', 'body-changed': 'body_observed', 'close-error': 'body_observed' };
  for (const [scenario, status] of Object.entries(cases)) {
    const h = accessHarness(payload, scenario);
    const d = await recoveryAccessDiagnostic(h.page, payload, selected, payload.freeText, h.locate);
    assert.equal(d.editor.status, status, scenario);
    assert.equal(d.tabClose, scenario === 'new-page-error' ? 'not_opened' : scenario === 'close-error' ? 'failed' : 'closed', scenario);
    assert.equal(h.calls.closed, scenario === 'new-page-error' ? 0 : 1, scenario);
    assert.equal(d.publicAfter.status, 'body_observed', scenario);
    assert.equal(h.calls.publicReads, 1, scenario); assert.equal(h.calls.mutations, 0, scenario);
    if (status !== 'body_observed') assert.equal(d.editor.body, null, scenario);
    if (!['body-read-error', 'diagnostic-error', 'body-redirect', 'body-changed', 'close-error'].includes(scenario)) assert.equal(h.calls.bodyReads, 0, scenario);
    if (scenario === 'login') { assert.equal(d.editor.titleMatches, null); assert.equal(d.editor.titleEditable, null); }
    if (scenario === 'body-changed') assert.equal(d.editor.body.firstMismatchLine, 2);
    assert.doesNotMatch(JSON.stringify(d), /CANARY|https:|private\.invalid|cookie|token/i, scenario);
  }
  for (const [scenario, reads, status] of [['public-before-redirect', 0, 'unexpected_url'], ['public-after-redirect', 1, 'unexpected_url'],
    ['public-ambiguous', 0, 'body_layout_unverified'], ['public-read-error', 1, 'body_read_failed']]) {
    const h = accessHarness(payload, scenario);
    const d = await recoveryAccessDiagnostic(h.page, payload, selected, payload.freeText, h.locate);
    assert.equal(d.publicAfter.status, status); assert.equal(d.publicAfter.body, null);
    assert.equal(d.publicAfter.changedSinceInitial, null); assert.equal(h.calls.publicReads, reads);
    assert.equal(h.calls.closed, 1); assert.equal(h.calls.mutations, 0);
  }
});

test('matching editor and later public bodies can never turn the initial mismatch into a receipt', async t => {
  const f = original();
  try {
    const p = await pinned(f, 'readable-v4');
    for (const scenario of ['match', 'close-error', 'body-read-error', 'diagnostic-error']) {
      const ui = publicPage(p.payload, p.payload.freeText), h = accessHarness(p.payload, scenario, articleBody(p.payload));
      const originalLocator = ui.page.locator;
      let reads = 0;
      ui.page.locator = selector => selector === '.note-common-styles__textnote-body' ? {
        count: async () => 1, innerText: async () => ++reads === 1 ? p.payload.freeText : articleBody(p.payload)
      } : originalLocator(selector);
      const context = ui.page.context();
      ui.page.context = () => ({ ...context, newPage: async () => { h.calls.opened++; return h.editor; } });
      const helper = require('./note-browserbase-draft-save');
      const locate = t.mock.method(helper, 'waitForVisibleAcrossFrames', h.locate);
      const logs = [], logger = t.mock.method(console, 'error', message => logs.push(message));
      try {
        await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)),
          /^Error: publication_recovery_body_mismatch$/);
        assert.equal(reads, 2); assert.equal(h.calls.opened, 1); assert.equal(h.calls.closed, 1);
        assert.equal(h.calls.mutations, 0); assert.deepEqual(ui.anonymousVisited, []);
        assert.equal(ui.closed(), 0); assert.equal(logs.length, 3);
        assert.match(logs[1], /^NOTE_UI_RECOVERY_ACCESS_DIAGNOSTIC=/);
        const d = JSON.parse(logs[1].split('=', 2)[1]);
        assert.equal(d.publicAfter.changedSinceInitial, true);
        assert.equal(d.publicAfter.body.firstMismatchLine, null);
        assert.equal(d.editor.body?.firstMismatchLine ?? null, null);
        assert.doesNotMatch(logs.join('\n'), /CANARY|https:|cookie|token|NOTE_UI_PUBLICATION/i);
      } finally { locate.mock.restore(); logger.mock.restore(); }
    }
    const ui = publicPage(p.payload), context = ui.page.context();
    let diagnosticPages = 0;
    ui.page.context = () => ({ ...context, newPage: async () => { diagnosticPages++; throw Error('not allowed'); } });
    await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload));
    assert.equal(diagnosticPages, 0, 'an initially matching public body never opens an editor diagnostic');
  } finally { f.cleanup(); }
});

// Passive reader diagnostics are part of this existing production gate. They
// never issue network requests or make a full-body recovery failure pass.
const { EventEmitter } = require('node:events');
const { startRecoveryReaderObserver, VIEWER_QUERY_SHA256, DETAIL_ACTION } = require('./note-recovery-reader-observer.cjs');
// Reconstructed solely from public module 27071 in 337-0a15753b7145f5c6.js.
// Standard GraphQL printing + client __typename fields reproduces the measured
// document digest; this fixture contains no runtime variables or responses.
const publicViewerQuery = `query ViewerQuery {
  viewer {
    ...ViewerFragment
    ...NotLoggedInViewerFragment
    __typename
  }
}

fragment ViewerFragment on Viewer {
  __typename
  id
  numberTypeId
  key
  urlname
  nickname
  profileImageUrl
  isNew
  isPremium
  isBusiness
  isPro
  isProMember
  isAnalysisMember
  isWriteMember
  isTwitterIntegrated
  isTwitterReconnectionNeeded
  isEmailConfirmed
  isBoardDisabled
  isNoteMoneyActivated
  hasLikedEverOnce
  isCircleOwner
  isCircleOwner
  hasJoinedCircle
  canUseUserPage
  isUserPageMember
  customDomain {
    id
    host
    key
    isTlsEnabled
    type
    isOauthRequired
    __typename
  }
  dmAcceptanceScope
  canUseDm
  pointBalance {
    total
    paid
    free
    __typename
  }
  reactions {
    toNoteLike {
      messages {
        id
        __typename
      }
      __typename
    }
    toNotePurchasing {
      messages {
        id
        __typename
      }
      __typename
    }
    toMagazinePurchasing {
      messages {
        id
        __typename
      }
      __typename
    }
    toTip {
      messages {
        id
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment NotLoggedInViewerFragment on NotLoggedInViewer {
  __typename
}`;
const readerTarget = { url: recoveryUrl, noteId: 'n123abc' };
const readerTick = () => new Promise(resolve => setImmediate(resolve));
const readerDeferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function readerHarness() {
  const page = new EventEmitter(), frame = { url: () => current }, otherFrame = {};
  let current = 'about:blank', bodyReads = 0, oneHeaderReads = 0;
  page.url = () => current; page.mainFrame = () => frame;
  const forbidden = () => { throw Error('CANARY forbidden operation'); };
  for (const name of ['goto', 'reload', 'evaluate', 'waitForTimeout', 'context', 'request', 'route']) page[name] = forbidden;
  const request = (kind = 'creator', overrides = {}) => ({
    frame: () => frame, isNavigationRequest: () => false,
    url: () => ({ creator: `https://note.com/api/v3/notes/${readerTarget.noteId}`,
      viewer: 'https://graphql.note.com/graphql', auth: 'https://note.com/api/v3/graphql/auth',
      detail: recoveryUrl, assets: 'https://frontend.st-note.com/next/_next/static/chunks/10961-02318a79c2dbfa50.js' })[kind],
    method: () => ['viewer', 'auth', 'detail'].includes(kind) ? 'POST' : 'GET',
    postDataJSON: () => ({ operationName: 'ViewerQuery', query: publicViewerQuery, variables: { CANARY: 'private' } }),
    headerValue: async name => { oneHeaderReads++; assert.equal(name, 'next-action'); return DETAIL_ACTION; },
    headers: forbidden, allHeaders: forbidden, postData: forbidden, ...overrides
  });
  const response = (req, data, overrides = {}) => ({ request: () => req, status: () => 200,
    json: async () => { bodyReads++; return data; }, body: forbidden, text: forbidden,
    headers: forbidden, allHeaders: forbidden, ...overrides });
  const navigate = () => {
    page.emit('request', request('creator', { url: () => recoveryUrl, isNavigationRequest: () => true }));
    current = recoveryUrl; page.emit('framenavigated', frame);
  };
  return { page, frame, otherFrame, request, response, navigate, setUrl: url => { current = url; },
    reads: () => ({ bodyReads, oneHeaderReads }) };
}
const viewerData = identity => ({ data: { viewer: { __typename: 'Viewer', key: identity,
  email: 'CANARY_EMAIL', pointBalance: 'CANARY_BALANCE' } }, CANARY: 'raw' });
const creatorData = identity => ({ data: { key: readerTarget.noteId,
  body: 'CANARY_ARTICLE', user: { key: identity, urlname: 'great_robin3243' } } });

test('reader observer strictly projects owner/guest/unknown metadata without retaining identities', async t => {
  assert.equal(publicViewerQuery.length, 1229);
  assert.equal(hash(publicViewerQuery), VIEWER_QUERY_SHA256);
  {
    for (const [viewer, creator, expected, match] of [
      [viewerData('CANARY_OWNER'), creatorData('CANARY_OWNER'), 'viewer', true],
      [viewerData('CANARY_OTHER'), creatorData('CANARY_OWNER'), 'viewer', false],
      [viewerData(undefined), creatorData('CANARY_OWNER'), 'viewer', null],
      [{ data: { viewer: { __typename: 'NotLoggedInViewer' } } }, creatorData('CANARY_OWNER'), 'not_logged_in', null],
      [{ data: { viewer: { __typename: 'FutureViewer', key: 'CANARY_OWNER' } } }, creatorData('CANARY_OWNER'), 'unknown', null],
      [{ ...viewerData('CANARY_OWNER'), errors: [{ message: 'CANARY_ERROR' }] }, creatorData('CANARY_OWNER'), 'unknown', null],
      [{ ...viewerData('CANARY_OWNER'), errors: {} }, creatorData('CANARY_OWNER'), 'unknown', null],
      [viewerData('CANARY_OWNER'), { data: { key: 'n999', user: { key: 'CANARY_OWNER', urlname: 'great_robin3243' } } }, 'viewer', null]
    ]) {
      const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
      for (const [kind, data] of [['viewer', viewer], ['creator', creator]]) {
        const req = h.request(kind); h.page.emit('request', req); h.page.emit('response', h.response(req, data));
      }
      await readerTick(); const result = o.stop();
      assert.equal(result.viewer.state, expected); assert.equal(result.viewer.ownerMatch, match);
      assert.equal(result.navigationObserved, true); assert.equal(result.attached, true); assert.equal(result.detached, true);
      assert.equal(result.pendingAtDetach, 0); assert.equal(result.observerErrors, 0);
      assert.equal(h.page.eventNames().length, 0); assert.strictEqual(o.stop(), result);
      assert.doesNotMatch(JSON.stringify(result), /CANARY|https:|cookie|token|password|query|body|email|balance/i);
      assert.deepEqual(Object.keys(result).sort(), ['version','attached','navigationObserved','detached','observerErrors','dropped',
        'pendingAtDetach','viewer','creator','auth','detail','assets'].sort());
    }
  }
});

test('reader observer ignores unrelated, stale, iframe, editor and unrecognized operations', async t => {
  {
    const h = readerHarness(), stale = h.request(), o = startRecoveryReaderObserver(h.page, readerTarget);
    h.setUrl(recoveryUrl); h.page.emit('framenavigated', h.frame); // No observed document request.
    const early = h.request(); h.page.emit('request', early); h.page.emit('response', h.response(early, creatorData('CANARY')));
    h.navigate(); h.page.emit('response', h.response(stale, creatorData('CANARY')));
    for (const [kind, overrides] of [
      ['creator', { frame: () => h.otherFrame }], ['creator', { url: () => 'https://editor.note.com/api/v3/notes/n123abc' }],
      ['creator', { url: () => 'https://note.com/api/v3/notes/n999' }], ['creator', { method: () => 'POST' }],
      ['creator', { url: () => 'https://note.com/api/v3/notes/n123abc?CANARY=1' }],
      ['creator', { url: () => 'https://CANARY@note.com/api/v3/notes/n123abc' }],
      ['viewer', { postDataJSON: () => ({ operationName: 'Mutation', query: publicViewerQuery }) }],
      ['viewer', { postDataJSON: () => ({ operationName: 'ViewerQuery', query: publicViewerQuery + ' ' }) }],
      ['viewer', { url: () => 'https://graphql.note.com/graphql?CANARY=1' }],
      ['detail', { headerValue: async () => 'unknown_action_CANARY' }],
      ['assets', { url: () => 'https://frontend.st-note.com/next/_next/static/chunks/unknown.js' }]
    ]) {
      const req = h.request(kind, overrides); h.page.emit('request', req); h.page.emit('response', h.response(req, { CANARY: 'must not read' }));
    }
    await readerTick(); const result = o.stop();
    for (const kind of ['viewer','creator','auth','detail','assets']) assert.equal(result[kind].requests, 0, kind);
    assert.equal(h.reads().bodyReads, 0); assert.equal(result.navigationObserved, true);
    assert.equal(result.viewer.ownerMatch, null);
  }
});

test('reader observer never reads authentication, action or asset bodies and permits only one named action header', async () => {
  const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
  for (const [kind, status] of [['auth',201], ['detail',200], ['assets',404]]) {
    const req = h.request(kind); h.page.emit('request', req);
    h.page.emit('response', h.response(req, null, { status: () => status,
      json: async () => { throw Error('CANARY body must not read'); } }));
  }
  let consoleReads = 0;
  h.page.emit('console', { type() { consoleReads++; return 'error'; }, text() { consoleReads++; return 'CANARY_SECRET'; } });
  assert.equal(consoleReads, 0, 'unattributable console content is not inspected');
  await readerTick(); const result = o.stop();
  assert.equal(result.auth.httpStatus, 201); assert.equal(result.detail.responses, 1);
  assert.equal(result.assets.httpErrors, 1);
  assert.equal(result.observerErrors, 0); assert.deepEqual(h.reads(), { bodyReads: 0, oneHeaderReads: 1 });
  assert.doesNotMatch(JSON.stringify(result), /CANARY/);
});

test('reader observer distinguishes absent, pending, failure, conflict and late completion', async t => {
  {
    for (const scenario of ['absent','pending','failed','json-error','conflict','late','redirect','header-pending']) {
      const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
      const deferred = readerDeferred(), req = h.request(scenario === 'header-pending' ? 'detail' : 'viewer',
        scenario === 'header-pending' ? { headerValue: () => deferred.promise } : {});
      if (scenario !== 'absent') h.page.emit('request', req);
      if (scenario === 'failed') h.page.emit('requestfailed', req);
      if (scenario === 'json-error') h.page.emit('response', h.response(req, null, { json: async () => { throw Error('CANARY_JSON'); } }));
      if (['late','redirect','conflict'].includes(scenario)) {
        h.page.emit('response', h.response(req, null, { json: () => deferred.promise }));
      }
      if (scenario === 'conflict') {
        const req2 = h.request('viewer'); h.page.emit('request', req2); h.page.emit('response', h.response(req2, viewerData('CANARY_SECOND')));
        await readerTick(); deferred.resolve(viewerData('CANARY_FIRST'));
      }
      await readerTick();
      if (scenario === 'redirect') { h.setUrl('https://note.com/other'); deferred.resolve(viewerData('CANARY_FIRST')); await readerTick(); }
      const result = o.stop(), serialized = JSON.stringify(result);
      assert.equal(result.viewer.state, ({ absent:'not_observed',pending:'pending',failed:'unknown','json-error':'unknown',
        conflict:'conflicting',late:'pending',redirect:'pending','header-pending':'not_observed' })[scenario]);
      assert.equal(result.viewer.ownerMatch, null);
      if (['late','header-pending'].includes(scenario)) assert.ok(result.pendingAtDetach > 0);
      deferred.resolve(scenario === 'header-pending' ? DETAIL_ACTION : viewerData('CANARY_LATE'));
      h.page.emit('response', h.response(req, viewerData('CANARY_LATE'))); await readerTick();
      assert.equal(JSON.stringify(result), serialized, 'late callbacks cannot change frozen evidence');
      assert.equal(result.observerErrors, scenario === 'json-error' ? 1 : 0);
      assert.doesNotMatch(serialized, /CANARY/);
    }
  }
});

test('reader observer contains registration, callback, parsing and teardown failures', async () => {
  const invalid = startRecoveryReaderObserver({}, { ...readerTarget, noteId: 'n999' }).stop();
  assert.equal(invalid.attached, false); assert.equal(invalid.observerErrors, 1);
  const h = readerHarness(), on = h.page.on.bind(h.page), off = h.page.off.bind(h.page);
  let registrations = 0, removals = 0;
  h.page.on = (event, callback) => { on(event, callback); if (++registrations === 2) throw Error('CANARY_REGISTER'); return h.page; };
  h.page.off = (event, callback) => { removals++; off(event, callback); throw Error('CANARY_OFF'); };
  const result = startRecoveryReaderObserver(h.page, readerTarget).stop();
  assert.equal(removals, 2); assert.equal(result.attached, false); assert.equal(result.detached, false);
  assert.equal(result.observerErrors, 3); assert.equal(h.page.eventNames().length, 0);
  assert.doesNotMatch(JSON.stringify(result), /CANARY/);
  const c = readerHarness(), observer = startRecoveryReaderObserver(c.page, readerTarget); c.navigate();
  c.page.emit('request', { frame() { throw Error('CANARY_FRAME'); } });
  c.page.emit('response', { request() { throw Error('CANARY_RESPONSE'); } });
  c.page.emit('request', c.request('viewer', { postDataJSON() { throw Error('CANARY_REQUEST'); } }));
  await readerTick(); const errors = observer.stop(); assert.equal(errors.observerErrors, 3);
  assert.doesNotMatch(JSON.stringify(errors), /CANARY/);
});

test('reader listeners attach before recovery navigation and detach on success or every original rejection', async t => {
  const f = original(), logs = [], logger = t.mock.method(console, 'error', value => logs.push(value));
  try {
    const p = await pinned(f, 'readable-v4');
    for (const scenario of ['success','body','navigation','heading','layout','price','timestamp','anonymous','cleanup']) {
      const ui = publicPage(p.payload, scenario === 'body' ? 'different content' : undefined), events = new EventEmitter();
      const frame = { url: ui.page.url }, goto = ui.page.goto, locate = ui.page.locator;
      ui.page.mainFrame = () => frame; ui.page.on = events.on.bind(events);
      ui.page.off = (event, callback) => { events.off(event, callback); if (scenario === 'cleanup') throw Error('CANARY_CLEANUP'); };
      ui.page.goto = async (...args) => {
        assert.equal(events.eventNames().length, 4, 'observer precedes goto');
        if (scenario === 'navigation') throw Error('original_navigation_error');
        events.emit('request', { frame: () => frame, isNavigationRequest: () => true, method: () => 'GET', url: () => recoveryUrl });
        const result = await goto(...args); events.emit('framenavigated', frame); return result;
      };
      if (scenario === 'heading') ui.page.getByRole = () => ({ waitFor: async () => { throw Error('original_heading_error'); } });
      if (scenario === 'layout') ui.page.locator = selector => selector === '.note-common-styles__textnote-body' ? { count: async () => 2 } : locate(selector);
      if (scenario === 'price') ui.page.locator = selector => selector === 'article' ? { innerText: async () => 'no price' } : locate(selector);
      if (scenario === 'timestamp') ui.page.locator = selector => selector === 'time[datetime]' ? { evaluateAll: async () => [] } : locate(selector);
      if (scenario === 'anonymous') ui.anonymous.goto = async () => { throw Error('original_anonymous_error'); };
      logs.length = 0;
      if (['success','cleanup'].includes(scenario)) {
        await recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)); assert.deepEqual(logs, []);
      } else {
        const expected = { body:'publication_recovery_body_mismatch',navigation:'original_navigation_error',heading:'original_heading_error',
          layout:'publication_recovery_body_layout_unverified',price:'publication_price_unverified',
          timestamp:'publication_timestamp_unverified_review_required',anonymous:'original_anonymous_error' }[scenario];
        await assert.rejects(recoverClaimedPublication(ui.page, p.payload, f.rootDir, p.recoveryEvidence, target(p.payload)),
          error => error.message === expected);
      }
      assert.equal(events.eventNames().length, 0, scenario);
      if (scenario === 'body') {
        assert.equal(logs.length, 2); assert.match(logs[1], /^NOTE_UI_RECOVERY_READER_DIAGNOSTIC=/);
        const d = JSON.parse(logs[1].split('=', 2)[1]); assert.equal(d.navigationObserved, true); assert.equal(d.detached, true);
      }
    }
  } finally { logger.mock.restore(); f.cleanup(); }
});

test('reader observer bounds workload, rejects unsuccessful responses and records mixed statuses', async () => {
  const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
  for (const [kind, status] of [['viewer',401], ['creator',500], ['assets',200], ['assets',404]]) {
    const req = h.request(kind); h.page.emit('request', req);
    const res = h.response(req, { CANARY: 'HTTP failure body must not read' }, { status: () => status });
    h.page.emit('response', res); h.page.emit('response', res); // Duplicate event is ignored.
  }
  await readerTick(); const result = o.stop();
  assert.equal(result.viewer.state, 'unknown'); assert.equal(result.creator.state, 'unknown');
  assert.equal(result.viewer.ownerMatch, null); assert.equal(h.reads().bodyReads, 0);
  assert.equal(result.viewer.responses, 1); assert.equal(result.assets.responses, 2);
  assert.equal(result.assets.httpStatus, null); assert.equal(result.assets.httpStatusConflict, true);
  const bounded = readerHarness(), observer = startRecoveryReaderObserver(bounded.page, readerTarget); bounded.navigate();
  for (let i = 0; i < 100; i++) bounded.page.emit('request', bounded.request('auth'));
  await readerTick(); const limit = observer.stop();
  assert.equal(limit.auth.requests, 64); assert.equal(limit.dropped, 36);
  assert.doesNotMatch(JSON.stringify(limit), /CANARY/);
});

test('reader observer stopped before queued classification reads no request document or header', async () => {
  const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
  let documentReads = 0, headerReads = 0;
  h.page.emit('request', h.request('viewer', { postDataJSON() { documentReads++; throw Error('CANARY_LATE_DOCUMENT'); } }));
  h.page.emit('request', h.request('detail', { headerValue() { headerReads++; throw Error('CANARY_LATE_HEADER'); } }));
  const snapshot = o.stop(), before = JSON.stringify(snapshot);
  assert.equal(snapshot.pendingAtDetach, 2); await readerTick();
  assert.equal(documentReads, 0); assert.equal(headerReads, 0); assert.equal(JSON.stringify(snapshot), before);
});

test('reader owner comparison stays unknown when observation has errors, drops or pending parsing', async () => {
  for (const scenario of ['error', 'drop', 'pending']) {
    const h = readerHarness(), o = startRecoveryReaderObserver(h.page, readerTarget); h.navigate();
    for (const [kind, data] of [['viewer', viewerData('CANARY_OWNER')], ['creator', creatorData('CANARY_OWNER')]]) {
      const req = h.request(kind); h.page.emit('request', req); h.page.emit('response', h.response(req, data));
    }
    await readerTick();
    const deferred = readerDeferred();
    if (scenario === 'error') h.page.emit('request', h.request('viewer', { postDataJSON() { throw Error('CANARY'); } }));
    if (scenario === 'drop') for (let i = 0; i < 100; i++) h.page.emit('request', h.request('auth'));
    if (scenario === 'pending') h.page.emit('request', h.request('detail', { headerValue: () => deferred.promise }));
    await readerTick(); const result = o.stop();
    assert.equal(result.viewer.state, 'viewer'); assert.equal(result.creator.state, 'verified');
    assert.equal(result.viewer.ownerMatch, null, scenario);
    deferred.resolve(DETAIL_ACTION); await readerTick();
    assert.equal(result.viewer.ownerMatch, null);
  }
});
