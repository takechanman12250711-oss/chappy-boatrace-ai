'use strict';
// Local synthetic fixtures only. No browser, network, workflow or publication is used.
// Load production source unchanged: no private proof collections or mint helpers
// are exported, replaced or reached by the test harness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const source = require('./note-publication-source');
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const REPOSITORY = 'takechanman12250711-oss/chappy-boatrace-ai';
const SHA = 'a'.repeat(40);
const START = Date.parse('2026-09-28T17:26:00+09:00');
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

function loadIsolated(file, context, overrides) {
  const absolute = path.join(__dirname, file), module = { exports: {} };
  const fallback = createRequire(absolute);
  const requireMock = id => Object.hasOwn(overrides, id) ? overrides[id] : fallback(id);
  const execute = new vm.Script(`(function(require, module, exports, __filename, __dirname) {\n${fs.readFileSync(absolute, 'utf8')}\n})`, { filename: absolute });
  execute.runInContext(context)(requireMock, module, module.exports, absolute, __dirname);
  return module.exports;
}

function harness(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'note-queue-expiry-test-'));
  fs.mkdirSync(path.join(directory, 'config'));
  fs.copyFileSync(path.join(__dirname, '../config/note-marketing.json'), path.join(directory, 'config/note-marketing.json'));
  const payloads = [6, 7].map(raceNo => {
    let bundle = fixture();
    if (raceNo === 7) {
      bundle = JSON.parse(JSON.stringify(bundle).replaceAll('20260928-15-6', '20260928-15-7')
        .replaceAll('6R', '7R').replaceAll('rno=6', 'rno=7').replaceAll('17:29', '17:49'));
      bundle.record.raceNo = 7; bundle.article.meta.raceNo = 7; bundle.monitor.article.meta.raceNo = 7;
    }
    const bytes = JSON.stringify(bundle);
    const sourcePath = `data/note-drafts/${bundle.record.date}/${bundle.record.raceKey}-${hash(bytes)}.json`;
    fs.mkdirSync(path.dirname(path.join(directory, sourcePath)), { recursive: true });
    fs.writeFileSync(path.join(directory, sourcePath), bytes);
    return source.publicationPayload(sourcePath, directory, START);
  });
  const state = { now: START, active: null, events: [], logs: [], claims: new Map(), receipts: new Map(),
    attempts: [], clicks: [], closed: [], stopped: [], errors: [], auditErrors: [], requests: [], preparing: [], afterCleanup: false };
  const env = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_SHA: SHA, NOTE_CLAIM_TOKEN: 'synthetic-test-token',
    NOTE_UI_MODE: 'publish', BROWSER_USE_API_KEY: 'synthetic-key', BROWSER_USE_PROFILE_ID: 'synthetic-profile' };
  let transport;
  const event = (name, payload = state.active) => state.events.push({ name, key: payload?.publicationKey, now: state.now });
  const first = () => state.active?.publicationKey === payloads[0].publicationKey;
  const expires = () => {
    state.now = Date.parse(payloads[0].deadlineAt) - 120000; event('clock-expired');
    if (options.mutateVerifiedPayload) options.mutateVerifiedPayload(state.lastVerifiedPayload);
  };
  const request = async (address, init = {}) => {
    const url = new URL(address), method = init.method || 'GET';
    state.requests.push({ url: address, method });
    assert.notEqual(method, 'DELETE', 'permanent claims and drafts must never be deleted');
    if (url.origin === 'https://api.browser-use.com') {
      if (method === 'POST' && url.pathname === '/api/v4/browsers') {
        event('session-start'); return response({ id: `synthetic-${state.attempts.length}`, cdpUrl: 'mock://cdp' });
      }
      assert.equal(method, 'PATCH');
      assert.deepEqual(JSON.parse(init.body), { action: 'stop' });
      event('session-stop'); state.stopped.push(state.active.publicationKey); state.afterCleanup = true;
      if (options.afterCleanup) options.afterCleanup({ state, payloads, transport, event });
      if (first() && options.cleanup === 'stop-throw') throw Error('synthetic_stop_failure');
      return response(null, first() && options.cleanup === 'stop' ? 500 : 200);
    }
    assert.equal(url.origin, 'https://api.github.com', 'no real or unexpected service may be contacted');
    const base = `/repos/${REPOSITORY}/git/`;
    assert.ok(url.pathname.startsWith(base), `unexpected mock request: ${method} ${address}`);
    const endpoint = url.pathname.slice(base.length);
    if (method === 'GET' && endpoint.startsWith('ref/')) {
      const ref = `refs/${endpoint.slice(4)}`;
      event(ref.includes('/note-published/') ? 'receipt-check' : 'claim-check');
      if (state.afterCleanup && first() && options.confirmRequest) {
        const overridden = options.confirmRequest(ref, { state, payloads, transport });
        if (overridden) return overridden;
      }
      return (state.claims.has(ref) || state.receipts.has(ref))
        ? response({ ref, object: { type: 'commit', sha: state.claims.get(ref) || state.receipts.get(ref) } }) : response(null, 404);
    }
    assert.equal(method, 'POST');
    const body = JSON.parse(init.body);
    if (endpoint === 'refs') {
      if (body.ref.includes('/note-draft-claim/')) {
        assert.equal(state.claims.has(body.ref), false, 'an existing claim must never be retried');
        state.claims.set(body.ref, body.sha); event('claim-create');
      } else {
        assert.ok(body.ref.includes('/note-published/')); state.receipts.set(body.ref, body.sha); event('receipt-save');
      }
      return response({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    if (endpoint === 'trees') return response({ sha: 'b'.repeat(40) }, 201);
    if (endpoint === 'commits') return response({ sha: 'c'.repeat(40) }, 201);
    throw Error(`unexpected mock write ${endpoint}`);
  };
  const locator = (onClick = async () => {}) => {
    const result = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
      isEditable: async () => true, isChecked: async () => true, waitFor: async () => {}, click: onClick };
    result.nth = () => result; result.first = () => result;
    return result;
  };
  let currentUrl, boundaryReads = 0, price = '';
  const blocks = () => [{ text: state.active.freeText, widget: false, buttons: 0, pressed: false },
    { text: 'ラインをこの場所に変更', widget: true, buttons: 1, pressed: true },
    { text: state.active.paidText, widget: false, buttons: 0, pressed: false }];
  const editor = { evaluate: async () => {
    boundaryReads++;
    if (first() && options.expire !== false && options.phase !== 'last-guard' && boundaryReads === 2) expires();
    return blocks();
  } };
  const submit = locator(async () => {
    event('publish-click'); state.clicks.push(state.active.publicationKey);
    if (first() && options.postClick === 'deadline') {
      expires(); transport.requirePublicationGate(state.active);
    }
    if (first() && options.postClick === 'unknown') throw Error('publication_result_unknown_review_required');
    if (first() && options.postClick === 'forged') throw Object.assign(Error('publication_content_audit_blocked'), { issueCodes: ['DEADLINE_TOO_CLOSE'] });
    currentUrl = `https://note.com/synthetic/n/n0000000${state.active.raceKey.endsWith('-6') ? '6' : '7'}`;
  });
  submit.isEnabled = async () => {
    if (first() && options.expire !== false && options.phase === 'last-guard') expires();
    return true;
  };
  const publicPage = { goto: async url => { publicPage.address = url; return { ok: () => true }; }, url: () => publicPage.address,
    getByRole: () => locator(), locator: () => ({ evaluateAll: async () => [new Date(state.now).toISOString()] }) };
  const verification = { newPage: async () => publicPage, close: async () => event('verification-close') };
  const browser = { contexts: () => [context], newContext: async () => verification, close: async () => {
    event('browser-close'); state.closed.push(state.active.publicationKey);
    if (first() && options.cleanup === 'browser') throw Error('synthetic_browser_close_failure');
  } };
  const context = { pages: () => [page], browser: () => browser, newPage: async () => page };
  const page = { goto: async url => { currentUrl = url; return response(null); }, url: () => currentUrl,
    waitForTimeout: async () => {}, context: () => context,
    getByRole: (role, query) => role === 'button' && query.name === '投稿する' ? submit : locator(),
    getByText: () => locator(), locator: selector => {
      assert.equal(selector, '.ProseMirror.paywall-setting[role="textbox"]'); return editor;
    } };
  const priceInput = { ...locator(), fill: async value => { price = value; }, inputValue: async () => price };
  const draftDependency = { waitForVisibleAcrossFrames: async (unused, selectors) => selectors.includes('input#price') ? priceInput : locator(),
    fillDraft: async (unused, draft) => {
      event('fill-draft');
      if (first() && options.fillError) throw options.fillError;
      assert.equal(draft.title, state.active.title);
      assert.equal(draft.body, `${state.active.freeText}\n\n${state.active.paidText}`);
      currentUrl = `https://editor.note.com/notes/n0000000${first() ? '6' : '7'}/publish`;
      return { url: currentUrl };
    } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const sandbox = vm.createContext({ Date: ClockDate, Buffer, URL, AbortSignal, fetch: request,
    process: { env, cwd: () => directory }, console: { log: text => state.logs.push(text), error: text => state.logs.push(text) } });
  const sourceDependency = { ...source,
    publicationPayload: (file, root, now = state.now, opts) => {
      event('source-read', payloads.find(payload => payload.sourcePath === file));
      return source.publicationPayload(file, root, now, opts);
    },
    verifyPublicationSource: (payload, root, now) => {
      event('source-verify', payload);
      try {
        // Inject only negative non-expiry auditor outcomes. The success/expiry
        // paths always use the real immutable-source verifier and real audit.
        if (first() && state.now !== START && options.auditError) throw options.auditError;
        const verified = source.verifyPublicationSource(payload, root, now);
        state.lastVerifiedPayload = payload;
        return verified;
      } catch (error) { state.auditErrors.push(error); throw error; }
    } };
  transport = loadIsolated('note-github-ui-transport.js', sandbox, {
    './note-publication-source': sourceDependency,
    './note-cover': { loadCoverTemplate: () => null, attachCover: async () => event('cover-attach') },
    './note-cover-template': { renderCover: async () => { throw Error('unexpected_cover_render'); } },
    './note-browserbase-draft-save': draftDependency,
    playwright: { chromium: { connectOverCDP: async address => { assert.equal(address, 'mock://cdp'); return browser; },
      launch: async () => { throw Error('real_browser_launch_forbidden'); } } }
  });
  const handoff = () => ({ candidates: payloads.map(({ raceKey, articleSeries, sourcePath }) => ({ raceKey, articleSeries, sourcePath })) });
  const queue = loadIsolated('publish-note-queue.js', sandbox, { './note-github-ui-transport': transport,
    './build-note-publish-handoff': { buildLatestHandoff: () => ({ payload: handoff() }) } });
  const publish = async ({ env: runEnv }) => {
    state.active = JSON.parse(fs.readFileSync(runEnv.NOTE_IPHONE_HANDOFF, 'utf8'));
    boundaryReads = 0; state.afterCleanup = false;
    state.attempts.push(state.active.publicationKey); event('run-start');
    try { return await transport.run({ env: runEnv }); }
    catch (error) { state.errors.push(error); throw error; }
  };
  const prepare = async args => {
    state.preparing.push({ keys: args.handoff.candidates.map(candidate => candidate.raceKey), now: state.now });
    return transport.preparePublication(args);
  };
  return { directory, payloads, state, env, transport, request,
    queue: () => queue.publishQueue({ env, request, publish, prepare }),
    runFirst: async () => {
      const file = path.join(directory, 'single.json'); fs.writeFileSync(file, JSON.stringify(payloads[0]));
      return publish({ env: { ...env, NOTE_IPHONE_HANDOFF: file } });
    },
    close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

async function withHarness(options, action) {
  const h = harness(options);
  try { await action(h); } finally { h.close(); }
}
async function expectStopped(options, pattern, clicks = 0) {
  await withHarness(options, async h => {
    await assert.rejects(h.queue(), pattern);
    assert.equal(h.state.attempts.length, 1, 'uncertain failures must stop before the next candidate');
    assert.equal(h.state.clicks.length, clicks);
    assert.equal(h.state.claims.size, 1, 'the permanent first claim remains');
    assert.equal(h.state.receipts.size, 0);
    assert.equal(h.state.logs.some(line => line.startsWith('NOTE_QUEUE_EXPIRED=')), false);
    assert.equal(h.state.preparing.length, 1);
  });
}

test('actual run: expiry at either pre-click gate retains claim, confirms cleanup, and freshly publishes only the next item', async () => {
  for (const phase of ['first-guard', 'last-guard']) await withHarness({ phase }, async h => {
    const result = await h.queue(), [first, next] = h.payloads;
    assert.deepEqual(clone(result), { published: 1, continued: false });
    assert.deepEqual(h.state.attempts, [first.publicationKey, next.publicationKey]);
    assert.deepEqual(h.state.clicks, [next.publicationKey]);
    assert.deepEqual(h.state.closed, h.state.attempts); assert.deepEqual(h.state.stopped, h.state.attempts);
    assert.equal(h.state.claims.get(h.transport.draftClaimRef(first)), SHA);
    assert.equal(h.state.claims.size, 2); assert.equal(h.state.receipts.size, 1);
    assert.ok(!h.state.receipts.has(h.transport.recoveryReference(first)));
    const record = JSON.parse(h.state.logs.find(line => line.startsWith('NOTE_QUEUE_EXPIRED=')).split('=')[1]);
    assert.equal(record.reason, 'DEADLINE_TOO_CLOSE'); assert.equal(record.publishClickAttempted, false);
    assert.equal(record.browserCleanupVerified, true); assert.equal(record.draftState, 'may_remain');
    assert.equal(record.sourceSha256, first.sourceSha256); assert.equal(record.claimRef, h.transport.draftClaimRef(first));
    const audit = h.state.errors[0];
    assert.equal(audit.message, 'publication_content_audit_blocked'); assert.deepEqual(audit.issueCodes, ['DEADLINE_TOO_CLOSE']);
    assert.ok(h.state.auditErrors.includes(audit), 'the exact real source-audit error reaches run cleanup');
    const events = h.state.events;
    const stopped = events.findIndex(event => event.name === 'session-stop' && event.key === first.publicationKey);
    const receiptCheck = events.findIndex((event, index) => index > stopped && event.name === 'receipt-check');
    const nextSource = events.findIndex((event, index) => index > receiptCheck && event.name === 'source-read' && event.key === next.publicationKey);
    const nextClaim = events.findIndex((event, index) => index > nextSource && event.name === 'claim-check');
    const nextRun = events.findIndex(event => event.name === 'run-start' && event.key === next.publicationKey);
    assert.ok(stopped >= 0 && receiptCheck > stopped && nextSource > receiptCheck && nextClaim > nextSource && nextRun > nextClaim);
    assert.ok(events[nextSource].now > START, 'next source/day/deadline check uses the advanced clock');
    assert.deepEqual(h.state.preparing.map(item => item.keys), [[first.raceKey, next.raceKey], [next.raceKey], []]);
    assert.ok(h.state.requests.every(item => item.method !== 'DELETE' && !item.url.includes('/dispatches')));
  });
});

test('plain and forged issueCodes, unrelated auditor failures, and mixed audit issues stop the queue', async () => {
  for (const error of [Error('synthetic_unknown_failure'),
    Object.assign(Error('publication_content_audit_blocked'), { issueCodes: ['DEADLINE_TOO_CLOSE'] })]) {
    await expectStopped({ fillError: error }, error);
  }
  for (const codes of [['DEADLINE_TOO_CLOSE', 'SOURCE_MISMATCH'], ['SOURCE_MISMATCH']]) {
    const error = Object.assign(Error('publication_content_audit_blocked'), { issueCodes: codes });
    await expectStopped({ auditError: error }, error);
  }
  await expectStopped({ auditError: Error('synthetic_unknown_auditor_failure') }, /synthetic_unknown_auditor_failure/);
});

test('post-click unknown, forged expiry and genuine late audit errors cannot advance the queue', async () => {
  for (const postClick of ['unknown', 'forged', 'deadline']) {
    await expectStopped({ expire: false, postClick }, /publication_result_unknown|publication_content_audit_blocked/, 1);
  }
});

test('browser-close, session-stop HTTP failure and thrown stop failure block expiry continuation', async () => {
  for (const cleanup of ['browser', 'stop', 'stop-throw']) {
    await expectStopped({ cleanup }, /expired_publication_cleanup_unverified/);
  }
});

test('missing/mismatched claim and any non-404 receipt response stop the queue', async () => {
  const variants = [
    { claim: () => response(null, 404), reason: /expired_publication_claim_unverified/ },
    { claim: () => response(null, 500), reason: /expired_publication_claim_unverified/ },
    { claim: ref => response({ ref, object: { sha: 'd'.repeat(40) } }), reason: /expired_publication_claim_mismatch/ },
    { claim: () => response({ ref: 'refs/tags/wrong', object: { sha: SHA } }), reason: /expired_publication_claim_mismatch/ },
    { receipt: () => response({}), reason: /expired_publication_receipt_review_required/ },
    { receipt: () => response(null, 403), reason: /expired_publication_receipt_review_required/ },
    { receipt: () => { throw Error('synthetic_receipt_request_failed'); }, reason: /synthetic_receipt_request_failed/ }
  ];
  for (const variant of variants) await expectStopped({ confirmRequest: ref => ref.includes('/note-published/')
    ? variant.receipt?.(ref) : variant.claim?.(ref) }, variant.reason);
});

test('private proof cannot be forged, serialized, transferred to another module or rebound to a changed identity', async () => {
  await withHarness({}, async h => {
    await assert.rejects(h.runFirst(), /publication_content_audit_blocked/);
    const error = h.state.errors[0], payload = h.payloads[0];
    const requests = h.state.requests.length;
    for (const forged of [undefined, {}, { ...error }, JSON.parse(JSON.stringify(error)),
      Object.assign(Error(error.message), { issueCodes: ['DEADLINE_TOO_CLOSE'] })]) {
      assert.equal(await h.transport.confirmedExpiredPublication(forged, payload, h.env, h.request), null);
    }
    for (const [key, value] of Object.entries({ publicationKey: h.payloads[1].publicationKey,
      sourcePath: h.payloads[1].sourcePath, sourceSha256: 'e'.repeat(64), deadlineAt: '2026-09-28T17:30:00+09:00', presentationVersion: 'readable-v3', title: 'changed title', freeText: 'changed free body', paidText: 'changed paid body' })) {
      assert.equal(await h.transport.confirmedExpiredPublication(error, { ...payload, [key]: value }, h.env, h.request), null);
    }
    await withHarness({}, async other => {
      assert.equal(await other.transport.confirmedExpiredPublication(error, payload, h.env, h.request), null);
    });
    assert.equal(h.state.requests.length, requests, 'untrusted proofs fail before any claim lookup');
    const confirmed = await h.transport.confirmedExpiredPublication(error, payload, h.env, h.request);
    assert.ok(confirmed); assert.ok(Object.isFrozen(confirmed));
    const afterConfirmed = h.state.requests.length;
    assert.equal(await h.transport.confirmedExpiredPublication(error, payload, h.env, h.request), null, 'proof is consumed once');
    assert.equal(h.state.requests.length, afterConfirmed);
  });
});

test('real gate errors require both the pre-click phase and actual run cleanup', async () => {
  await withHarness({}, async h => {
    h.state.now = Date.parse(h.payloads[0].deadlineAt) - 120000;
    let bareError;
    try { h.transport.requirePublicationGate(h.payloads[0]); } catch (error) { bareError = error; }
    assert.deepEqual(bareError.issueCodes, ['DEADLINE_TOO_CLOSE']);
    assert.equal(await h.transport.confirmedExpiredPublication(bareError, h.payloads[0], h.env, h.request), null);
    let preClickError;
    try { await h.transport.publishConfiguredArticle({}, h.payloads[0], { price: 200 }); } catch (error) { preClickError = error; }
    assert.deepEqual(preClickError.issueCodes, ['DEADLINE_TOO_CLOSE']);
    assert.equal(await h.transport.confirmedExpiredPublication(preClickError, h.payloads[0], h.env, h.request), null);
    assert.equal(h.state.requests.length, 0);
  });
});

test('next candidate permanent claim is freshly checked and blocks a second run', async () => {
  await withHarness({ afterCleanup: ({ state, payloads, transport }) => {
    state.claims.set(transport.draftClaimRef(payloads[1]), SHA);
  } }, async h => {
    assert.deepEqual(clone(await h.queue()), { published: 0, continued: false });
    assert.equal(h.state.attempts.length, 1); assert.equal(h.state.clicks.length, 0);
    assert.equal(h.state.claims.size, 2); assert.equal(h.state.receipts.size, 0);
  });
});


test('changing a previously verified payload before expiry never becomes a safe queue skip', async () => {
  for (const phase of ['first-guard', 'last-guard']) {
    await expectStopped({ phase, mutateVerifiedPayload: payload => { payload.freeText += '\nchanged after source verification'; } },
      /publication_content_audit_blocked/);
  }
});

test('an already-expired handoff with no successful source gate stops before claims and browser setup', async () => {
  await withHarness({}, async h => {
    h.state.now = Date.parse(h.payloads[0].deadlineAt) - 120000;
    await assert.rejects(h.runFirst(), /publication_content_audit_blocked/);
    assert.equal(h.state.claims.size, 0); assert.equal(h.state.closed.length, 0); assert.equal(h.state.stopped.length, 0);
    assert.equal(h.state.requests.length, 0);
    assert.equal(await h.transport.confirmedExpiredPublication(h.state.errors[0], h.payloads[0], h.env, h.request), null);
  });
});

test('concurrent confirmation calls consume the same proof only once before awaiting I/O', async () => {
  await withHarness({}, async h => {
    await assert.rejects(h.runFirst(), /publication_content_audit_blocked/);
    const error = h.state.errors[0], payload = h.payloads[0], before = h.state.requests.length;
    const results = await Promise.all([
      h.transport.confirmedExpiredPublication(error, payload, h.env, h.request),
      h.transport.confirmedExpiredPublication(error, payload, h.env, h.request)
    ]);
    assert.ok(results[0]); assert.equal(results[1], null);
    assert.equal(h.state.requests.length - before, 2, 'only one claim and one receipt verification may run');
    assert.equal(h.state.claims.get(h.transport.draftClaimRef(payload)), SHA);
  });
});

test('failed claim or receipt verification still consumes the proof and cannot be retried as a skip', async () => {
  for (const failAt of ['claim', 'receipt']) await withHarness({}, async h => {
    await assert.rejects(h.runFirst(), /publication_content_audit_blocked/);
    const error = h.state.errors[0], payload = h.payloads[0];
    let calls = 0;
    const failingRequest = async (url, init) => {
      calls++;
      if ((failAt === 'claim' && url.includes('/note-draft-claim/')) ||
          (failAt === 'receipt' && url.includes('/note-published/'))) return response(null, 503);
      return h.request(url, init);
    };
    await assert.rejects(h.transport.confirmedExpiredPublication(error, payload, h.env, failingRequest),
      failAt === 'claim' ? /expired_publication_claim_unverified/ : /expired_publication_receipt_review_required/);
    assert.equal(calls, failAt === 'claim' ? 1 : 2);
    const before = h.state.requests.length;
    assert.equal(await h.transport.confirmedExpiredPublication(error, payload, h.env, h.request), null);
    assert.equal(h.state.requests.length, before, 'a failed verification must not reopen its proof');
    assert.equal(h.state.claims.get(h.transport.draftClaimRef(payload)), SHA);
  });
});
