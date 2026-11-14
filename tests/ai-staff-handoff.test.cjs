'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createHandoff, parseArgs, format, reservationFor, REPO, OWNER, LABEL, SCHEMA } = require('../scripts/ai-staff-handoff.cjs');

const HEAD = 'a'.repeat(40);
const NEXT = 'b'.repeat(40);
const ROOT = `repos/${REPO}`;
const AUTH = `https://github.com/${REPO}/issues/1337`;
const SESSION = 'https://claude.ai/code/session_test';
const REQUEST = { pr: '1462', 'task-id': 'work-1462', round: '1', action: 'review', scope: 'scripts/example.cjs,tests/example.test.cjs', 'authorization-url': AUTH };
const CLAIM = { pr: '1462', 'task-id': 'work-1462', round: '1', head: HEAD };
const RECEIPT = { ...CLAIM, 'result-head': HEAD, 'session-url': SESSION, status: 'returned', 'summary-file': '/tmp/summary.txt' };

function fixture() {
  const state = {
    pr: 1462, head: HEAD, labels: [], comments: [], reservations: new Map(), calls: [], nextId: 1,
    owner: OWNER, open: true, fork: false, missingComment: false, intercept: null,
  };
  function comment(body, login = state.owner) {
    const c = { id: state.nextId++, body, user: { login }, html_url: `https://github.com/${REPO}/issues/${state.pr}#issuecomment-${state.nextId - 1}` };
    state.comments.push(c);
    return c;
  }
  function api(method, path, body) {
    state.calls.push({ method, path, body });
    const override = state.intercept?.(method, path, body);
    if (override !== undefined) return override;
    const result = (status, data = null) => ({ status, data: data === null ? null : JSON.parse(JSON.stringify(data)) });
    if (method === 'GET' && path === `${ROOT}/labels/${LABEL}`) return result(200, { name: LABEL });
    if (method === 'GET' && path === `${ROOT}/compare/${HEAD}...${NEXT}`) return result(200, {
      status: 'ahead', merge_base_commit: { sha: HEAD }, total_commits: 1, commits: [{ sha: NEXT }],
      files: [{ filename: 'scripts/example.cjs', status: 'modified' }],
    });
    if (method === 'GET' && path === `${ROOT}/pulls/${state.pr}`) return result(200, {
      number: state.pr, state: state.open ? 'open' : 'closed', merged: false,
      base: { ref: 'main', repo: { full_name: REPO } },
      head: { sha: state.head, repo: { full_name: state.fork ? 'someone/fork' : REPO } },
      labels: state.labels.map(name => ({ name })),
    });
    if (method === 'GET' && path.startsWith(`${ROOT}/issues/${state.pr}/comments?`)) {
      const page = Number(new URL(`https://example.com/${path}`).searchParams.get('page'));
      return result(200, state.comments.slice((page - 1) * 100, page * 100));
    }
    if (method === 'GET' && path.startsWith(`${ROOT}/issues/comments/`)) {
      const c = state.comments.find(c => c.id === Number(path.split('/').at(-1)));
      return c && !state.missingComment ? result(200, c) : result(404, {});
    }
    if (method === 'POST' && path === `${ROOT}/issues/${state.pr}/comments`) return result(201, comment(body.body));
    if (method === 'GET' && path.startsWith(`${ROOT}/labels?`)) {
      const page = Number(new URL(`https://example.com/${path}`).searchParams.get('page'));
      return result(200, [...state.reservations.values()].slice((page - 1) * 100, page * 100));
    }
    if (method === 'GET' && path.startsWith(`${ROOT}/labels/`)) {
      const name = path.slice(`${ROOT}/labels/`.length);
      return state.reservations.has(name) ? result(200, state.reservations.get(name)) : result(404, {});
    }
    if (method === 'POST' && path === `${ROOT}/labels`) {
      if (state.reservations.has(body.name)) return result(422, {});
      state.reservations.set(body.name, { ...body });
      return result(201, body);
    }
    if (method === 'POST' && path === `${ROOT}/issues/${state.pr}/labels`) {
      state.labels = [...new Set([...state.labels, ...body.labels])];
      return result(200, state.labels.map(name => ({ name })));
    }
    if (method === 'DELETE' && path === `${ROOT}/issues/${state.pr}/labels/${LABEL}`) {
      state.labels = state.labels.filter(name => name !== LABEL);
      return result(200, state.labels.map(name => ({ name })));
    }
    throw new Error(`Unexpected fake API call: ${method} ${path}`);
  }
  const helper = createHandoff({ api, now: () => '2026-11-13T12:00:00.000Z', readFile: () => 'Read-only review completed. No changes.' });
  return { state, helper, comment, api };
}
function writes(state) { return state.calls.filter(c => c.method !== 'GET'); }
function commentWrites(state) { return writes(state).filter(c => c.path.endsWith('/comments')); }
function requestAndClaim(f) { f.helper.request(REQUEST); return f.helper.claim(CLAIM); }

test('inspect is read-only; request → atomic claim → receipt preserves actors and fixed head', () => {
  const f = fixture();
  assert.equal(f.helper.inspect({ pr: '1462' }).head, HEAD);
  assert.equal(writes(f.state).length, 0);
  assert.equal(f.helper.request(REQUEST).status, 'requested');
  assert.deepEqual(f.state.labels, [LABEL]);
  const claim = f.helper.claim(CLAIM);
  assert.equal(claim.status, 'claimed');
  assert.deepEqual(claim.scope, ['scripts/example.cjs', 'tests/example.test.cjs']);
  assert.deepEqual(f.state.labels, []);
  assert.equal(f.helper.receipt(RECEIPT).status, 'receipt_saved');
  const records = f.helper.inspect({ pr: '1462' }).records;
  assert.deepEqual(records.map(r => r.kind), ['request', 'claim', 'receipt']);
  assert.deepEqual(records.map(r => [r.sender, r.receiver]), [['chappy', 'claude'], ['claude', 'chappy'], ['claude', 'chappy']]);
  assert.equal(f.state.reservations.size, 3);
  assert.ok(f.state.calls.every(c => c.path.startsWith(`${ROOT}/`)));
  assert.ok(f.state.calls.every(c => !c.path.includes('/git/')));
  assert.ok(writes(f.state).every(c => c.method !== 'PATCH' && (c.method !== 'DELETE' || c.path === `${ROOT}/issues/1462/labels/${LABEL}`)));
  assert.ok(writes(f.state).filter(c => c.path === `${ROOT}/labels`).every(c => c.body.color === 'EDEDED'));
});

test('same request and receipt do not post or reapply a consumed label', () => {
  const f = fixture();
  requestAndClaim(f);
  f.helper.receipt(RECEIPT);
  f.state.calls = [];
  assert.equal(f.helper.request(REQUEST).status, 'already_requested');
  assert.equal(f.helper.request(REQUEST).labelApplied, false);
  assert.equal(f.helper.receipt(RECEIPT).status, 'already_returned');
  assert.equal(writes(f.state).length, 0);
});

test('closed PR and fork are rejected before mutations', () => {
  for (const change of [s => { s.open = false; }, s => { s.fork = true; }]) {
    const f = fixture(); change(f.state);
    assert.throws(() => f.helper.request(REQUEST), /pr_not_open|fork_or_wrong_base/);
    assert.equal(writes(f.state).length, 0);
  }
});

test('non-owner comment authors stop each send after reservation, without gate actions or automatic resend', () => {
  for (const phase of ['request', 'claim', 'receipt']) {
    const f = fixture();
    if (phase !== 'request') f.helper.request(REQUEST);
    if (phase === 'receipt') f.helper.claim(CLAIM);
    const gateBefore = [...f.state.labels];
    f.state.owner = 'other-login'; f.state.calls = [];
    const options = phase === 'request' ? REQUEST : phase === 'claim' ? CLAIM : RECEIPT;
    assert.throws(() => f.helper[phase](options), /comment_write_actor_mismatch_stop/);
    assert.deepEqual(f.state.labels, gateBefore);
    assert.equal(writes(f.state).filter(c => c.path === `${ROOT}/labels`).length, 1);
    assert.equal(commentWrites(f.state).length, 1);
    assert.equal(writes(f.state).filter(c => c.path.includes('/issues/1462/labels')).length, 0);
    f.state.owner = OWNER; f.state.calls = [];
    assert.throws(() => f.helper[phase](options), /request_reserved_result_unknown|claim_exists_stop|receipt_reserved_result_unknown/);
    assert.equal(writes(f.state).length, 0);
  }
});

test('owner in POST response is insufficient when comment readback author differs', () => {
  const f = fixture();
  f.state.intercept = (method, path) => {
    if (method === 'GET' && path.startsWith(`${ROOT}/issues/comments/`)) {
      const saved = f.state.comments.at(-1);
      return { status: 200, data: { ...saved, user: { login: 'other-login' } } };
    }
  };
  assert.throws(() => f.helper.request(REQUEST), /comment_readback_failed_do_not_resend/);
  assert.equal(f.state.reservations.size, 1);
  assert.deepEqual(f.state.labels, []);
  assert.equal(commentWrites(f.state).length, 1);
});

test('round 4, round 0, invalid paths and foreign authorization never reach GitHub', () => {
  for (const overrides of [
    { round: '4' }, { round: '0' }, { scope: '../secrets' }, { scope: '.env.local' },
    { scope: 'scripts/ok.js,scripts/ok.js' }, { 'task-id': 'x/../../y' },
    { 'authorization-url': 'https://github.com/other/repo/issues/1' },
    { 'authorization-url': `${AUTH}?token=secret` },
  ]) {
    const f = fixture();
    assert.throws(() => f.helper.request({ ...REQUEST, ...overrides }));
    assert.equal(f.state.calls.length, 0);
  }
});

test('next round needs the previous returned receipt and permits a subsequent Chappy commit', () => {
  const f = fixture();
  assert.throws(() => f.helper.request({ ...REQUEST, round: '2' }), /previous_round_not_returned/);
  assert.equal(writes(f.state).length, 0);
  requestAndClaim(f);
  assert.throws(() => f.helper.request({ ...REQUEST, round: '2' }), /other_request_pending/);
  f.helper.receipt(RECEIPT);
  f.state.head = NEXT;
  assert.equal(f.helper.request({ ...REQUEST, round: '2' }).status, 'requested');
  assert.ok(f.state.calls.some(c => c.path === `${ROOT}/compare/${HEAD}...${NEXT}`));
  f.helper.claim({ ...CLAIM, round: '2', head: NEXT });
  f.helper.receipt({ ...RECEIPT, round: '2', head: NEXT, 'result-head': NEXT, status: 'stopped' });
  f.state.head = 'c'.repeat(40);
  assert.throws(() => f.helper.request({ ...REQUEST, round: '3' }), /previous_round_not_returned/);
});

test('the same task cannot request another round at any previously requested head', () => {
  const f = fixture(); requestAndClaim(f); f.helper.receipt(RECEIPT); f.state.calls = [];
  assert.throws(() => f.helper.request({ ...REQUEST, round: '2' }), /request_head_already_used/);
  assert.equal(writes(f.state).length, 0);
  assert.equal(f.state.calls.some(c => c.path.includes('/compare/')), false);
});

test('subsequent Chappy head must be strictly ahead with the previous result as merge base', () => {
  for (const comparison of [
    { status: 'diverged', merge_base_commit: { sha: HEAD } },
    { status: 'behind', merge_base_commit: { sha: HEAD } },
    { status: 'identical', merge_base_commit: { sha: HEAD } },
    { status: 'ahead', merge_base_commit: { sha: 'c'.repeat(40) } },
    { status: 'ahead' }, null,
  ]) {
    const f = fixture(); requestAndClaim(f); f.helper.receipt(RECEIPT); f.state.head = NEXT; f.state.calls = [];
    f.state.intercept = (method, path) => path.includes('/compare/') ? { status: 200, data: comparison } : undefined;
    assert.throws(() => f.helper.request({ ...REQUEST, round: '2' }), /result_head_not_ancestor_of_request/);
    assert.equal(writes(f.state).length, 0);
  }
});

test('unknown comparison failure stops the next request without reserving or sending it', () => {
  const f = fixture(); requestAndClaim(f); f.helper.receipt(RECEIPT); f.state.head = NEXT; f.state.calls = [];
  f.state.intercept = (method, path) => path.includes('/compare/') ? { status: 503, data: {} } : undefined;
  assert.throws(() => f.helper.request({ ...REQUEST, round: '2' }), /github_read_failed_503/);
  assert.equal(writes(f.state).length, 0);
});

test('implement receipt allows a new current head; review receipt must stop on a changed head', () => {
  const implementation = fixture();
  implementation.helper.request({ ...REQUEST, action: 'implement' });
  implementation.helper.claim(CLAIM);
  implementation.state.head = NEXT;
  assert.equal(implementation.helper.receipt({ ...RECEIPT, 'result-head': NEXT }).status, 'receipt_saved');
  assert.deepEqual(implementation.helper.inspect({ pr: '1462' }).records.at(-1).verifiedChangedFiles, ['scripts/example.cjs']);
  assert.equal(implementation.helper.request({ ...REQUEST, round: '2' }).status, 'requested');

  const review = fixture(); requestAndClaim(review); review.state.head = NEXT;
  assert.throws(() => review.helper.receipt({ ...RECEIPT, 'result-head': NEXT }), /review_head_changed_use_stopped/);
  assert.equal(review.helper.receipt({ ...RECEIPT, 'result-head': NEXT, status: 'stopped' }).status, 'receipt_saved');
  assert.equal(review.helper.inspect({ pr: '1462' }).records.at(-1).headChanged, true);
});

test('implementation results outside exact scope, including either side of rename, cannot be returned', () => {
  for (const files of [
    [{ filename: 'scripts/unrequested.cjs', status: 'modified' }],
    [{ filename: 'scripts/example.cjs', previous_filename: 'private/old.cjs', status: 'renamed' }],
    [{ filename: 'private/new.cjs', previous_filename: 'scripts/example.cjs', status: 'renamed' }],
    [{ filename: 'scripts/example.cjs', status: 'renamed' }],
  ]) {
    const f = fixture(); f.helper.request({ ...REQUEST, action: 'implement' }); f.helper.claim(CLAIM); f.state.head = NEXT; f.state.calls = [];
    f.state.intercept = (method, path) => path.includes('/compare/') ? { status: 200, data: {
      status: 'ahead', merge_base_commit: { sha: HEAD }, total_commits: 1, commits: [{ sha: NEXT }], files,
    } } : undefined;
    assert.throws(() => f.helper.receipt({ ...RECEIPT, 'result-head': NEXT }), /implementation_(?:outside_scope|rename_outside_scope)/);
    assert.equal(writes(f.state).length, 0);
    assert.equal(f.helper.receipt({ ...RECEIPT, 'result-head': NEXT, status: 'stopped' }).status, 'receipt_saved');
  }
});

test('implementation compare must be forward, complete, below file cap and consistent in commit count', () => {
  const complete = { status: 'ahead', merge_base_commit: { sha: HEAD }, total_commits: 1, commits: [{ sha: NEXT }], files: [{ filename: 'scripts/example.cjs', status: 'modified' }] };
  for (const changes of [
    { status: 'diverged' }, { status: 'behind' }, { merge_base_commit: { sha: NEXT } },
    { files: undefined }, { files: Array(300).fill(complete.files[0]) },
    { total_commits: 2 }, { total_commits: 251 }, { commits: undefined },
  ]) {
    const f = fixture(); f.helper.request({ ...REQUEST, action: 'implement' }); f.helper.claim(CLAIM); f.state.head = NEXT; f.state.calls = [];
    f.state.intercept = (method, path) => path.includes('/compare/') ? { status: 200, data: { ...complete, ...changes } } : undefined;
    assert.throws(() => f.helper.receipt({ ...RECEIPT, 'result-head': NEXT }), /implementation_(?:head_not_forward|comparison_incomplete)/);
    assert.equal(writes(f.state).length, 0);
  }
  const renamed = fixture(); renamed.helper.request({ ...REQUEST, action: 'implement' }); renamed.helper.claim(CLAIM); renamed.state.head = NEXT;
  renamed.state.intercept = (method, path) => path.includes('/compare/') ? { status: 200, data: {
    ...complete, files: [{ filename: 'scripts/example.cjs', previous_filename: 'tests/example.test.cjs', status: 'renamed' }],
  } } : undefined;
  renamed.helper.receipt({ ...RECEIPT, 'result-head': NEXT });
  assert.deepEqual(renamed.helper.inspect({ pr: '1462' }).records.at(-1).verifiedChangedFiles, ['scripts/example.cjs', 'tests/example.test.cjs']);
});

test('reservation label name and description must both match; only the gate label is ever applied', () => {
  const target = { pr: 1462, taskId: 'work-1462', round: 1, head: HEAD };
  const reservation = reservationFor('request', target);
  assert.match(reservation.name, /^ai-staff-rq-[a-f0-9]{32}$/);
  assert.equal(reservation.description, `chappy-ai-handoff:v2 request 1462 1 ${HEAD}`);
  assert.equal(reservation.color, 'EDEDED');
  const conflict = fixture(); conflict.state.reservations.set(reservation.name, { ...reservation, description: `${SCHEMA} request ${NEXT}` });
  assert.throws(() => conflict.helper.request(REQUEST), /reservation_conflict/);
  assert.equal(writes(conflict.state).length, 0);
  const unknown = fixture();
  unknown.state.intercept = (method, path) => path === `${ROOT}/labels/${reservation.name}` && unknown.state.reservations.size ? { status: 503, data: {} } : undefined;
  assert.throws(() => unknown.helper.request(REQUEST), /reservation_read_unknown/);
  assert.equal(unknown.state.reservations.size, 1);
  assert.equal(commentWrites(unknown.state).length, 0);
  const f = fixture(); requestAndClaim(f); f.helper.receipt(RECEIPT);
  assert.deepEqual(writes(f.state).filter(c => c.path.endsWith('/issues/1462/labels')).map(c => c.body.labels), [[LABEL]]);
  assert.ok(f.state.calls.every(c => !c.path.includes('/git/')));
});

test('same task and round cannot replace a request head or action', () => {
  const f = fixture(); f.helper.request(REQUEST);
  assert.throws(() => f.helper.request({ ...REQUEST, action: 'implement' }), /request_conflict/);
  f.state.head = NEXT;
  assert.throws(() => f.helper.request(REQUEST), /request_conflict|reservation_conflict/);
  assert.equal(commentWrites(f.state).length, 1);
});

test('stale head fails claim before reserving execution', () => {
  const f = fixture(); f.helper.request(REQUEST); f.state.head = NEXT; f.state.calls = [];
  assert.throws(() => f.helper.claim(CLAIM), /head_changed_stop_without_editing/);
  assert.equal(writes(f.state).length, 0);
});

test('only one claimant wins; a pre-existing reservation is never reused or deleted', () => {
  const f = fixture(); requestAndClaim(f); f.state.calls = [];
  assert.throws(() => f.helper.claim(CLAIM), /handoff_label_not_applied|already_claimed_or_returned/);
  assert.equal(writes(f.state).length, 0);

  const interrupted = fixture(); interrupted.helper.request(REQUEST);
  const reservation = reservationFor('claim', { taskId: 'work-1462', round: 1, head: HEAD });
  interrupted.state.reservations.set(reservation.name, reservation);
  interrupted.state.calls = [];
  assert.throws(() => interrupted.helper.claim(CLAIM), /claim_exists_stop/);
  assert.equal(writes(interrupted.state).length, 0);
});

test('atomic create-label losing a claim race stops without acceptance or gate label removal', () => {
  const f = fixture(); f.helper.request(REQUEST); f.state.calls = [];
  f.state.intercept = (method, path, body) => {
    if (method === 'POST' && path === `${ROOT}/labels` && body.name.startsWith('ai-staff-clm-')) return { status: 422, data: {} };
  };
  assert.throws(() => f.helper.claim(CLAIM), /github_write_failed_do_not_resend_422/);
  assert.equal(commentWrites(f.state).length, 0);
  assert.deepEqual(f.state.labels, [LABEL]);
  assert.equal(writes(f.state).length, 1);
});

test('head changes after atomic claim: no acceptance, editing permission or label removal', () => {
  const f = fixture(); f.helper.request(REQUEST); f.state.calls = [];
  f.state.intercept = (method, path, body) => {
    if (method === 'POST' && path === `${ROOT}/labels` && body.name.startsWith('ai-staff-clm-')) f.state.head = NEXT;
  };
  assert.throws(() => f.helper.claim(CLAIM), /head_changed_stop_without_editing/);
  assert.equal(commentWrites(f.state).length, 0);
  assert.deepEqual(f.state.labels, [LABEL]);
});

test('request reserves intent before POST; unknown post result is not resent across reruns', () => {
  const f = fixture();
  f.state.intercept = (method, path) => {
    if (method === 'POST' && path === `${ROOT}/issues/1462/comments`) throw new Error('github_result_unknown_do_not_resend');
  };
  assert.throws(() => f.helper.request(REQUEST), /github_result_unknown_do_not_resend/);
  assert.equal(f.state.reservations.size, 1);
  assert.deepEqual(f.state.labels, []);
  f.state.intercept = null; f.state.calls = [];
  assert.throws(() => f.helper.request(REQUEST), /request_reserved_result_unknown_do_not_resend/);
  assert.equal(writes(f.state).length, 0);
});

test('request is not labeled until its comment is read back exactly', () => {
  const f = fixture(); f.state.missingComment = true;
  assert.throws(() => f.helper.request(REQUEST), /github_read_failed_404/);
  assert.deepEqual(f.state.labels, []);
  assert.equal(commentWrites(f.state).length, 1);
});

test('request race reserves only one send, without retrying a rejected creation', () => {
  const f = fixture();
  f.state.intercept = (method, path) => {
    if (method === 'POST' && path === `${ROOT}/labels`) return { status: 422, data: {} };
  };
  assert.throws(() => f.helper.request(REQUEST), /github_write_failed_do_not_resend_422/);
  assert.equal(commentWrites(f.state).length, 0);
  assert.equal(writes(f.state).length, 1);
});

test('receipt reserves intent; unknown receipt send is never retried', () => {
  const f = fixture(); requestAndClaim(f);
  f.state.intercept = (method, path) => {
    if (method === 'POST' && path === `${ROOT}/issues/1462/comments`) throw new Error('github_result_unknown_do_not_resend');
  };
  assert.throws(() => f.helper.receipt(RECEIPT), /github_result_unknown_do_not_resend/);
  f.state.intercept = null; f.state.calls = [];
  assert.throws(() => f.helper.receipt(RECEIPT), /receipt_reserved_result_unknown_do_not_resend/);
  assert.equal(writes(f.state).length, 0);
});

test('receipt needs a matching request and accepted claim, current result head and safe session URL', () => {
  const f = fixture(); f.helper.request(REQUEST); f.state.calls = [];
  assert.throws(() => f.helper.receipt(RECEIPT), /matching_claim_not_found/);
  assert.equal(writes(f.state).length, 0);
  f.helper.claim(CLAIM); f.state.calls = [];
  assert.throws(() => f.helper.receipt({ ...RECEIPT, 'result-head': NEXT }), /result_head_not_current/);
  assert.throws(() => f.helper.receipt({ ...RECEIPT, 'session-url': 'https://example.com/code/session_test' }), /invalid_session_url/);
  assert.equal(writes(f.state).length, 0);
});

test('untrusted author cannot supply a request; malformed owner record stops closed', () => {
  const f = fixture();
  f.comment(format({ schema: SCHEMA, kind: 'request' }), 'outsider');
  assert.equal(f.helper.inspect({ pr: '1462' }).records.length, 0);
  f.comment(`${format({ schema: SCHEMA })} unrelated text`);
  assert.throws(() => f.helper.request(REQUEST), /invalid_trusted_comment/);
  assert.equal(writes(f.state).length, 0);
});

test('all comment pages are read before deciding a request is new', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.comment('unrelated');
  f.helper.request(REQUEST); f.state.calls = [];
  assert.equal(f.helper.request(REQUEST).status, 'already_requested');
  assert.ok(f.state.calls.some(c => c.path.includes('page=2')));
  assert.equal(writes(f.state).length, 0);
});

test('a failed comment page never becomes an empty successful search', () => {
  const f = fixture();
  f.state.intercept = (method, path) => method === 'GET' && path.includes('/comments?') ? { status: 503, data: [] } : undefined;
  assert.throws(() => f.helper.request(REQUEST), /github_read_failed_503/);
  assert.equal(writes(f.state).length, 0);
});

test('a second task cannot start while another request has no receipt', () => {
  const f = fixture(); f.helper.request(REQUEST); f.state.calls = [];
  assert.throws(() => f.helper.request({ ...REQUEST, 'task-id': 'other-task' }), /other_request_pending/);
  assert.equal(writes(f.state).length, 0);
});

test('commentless request reservation is visible to inspect and blocks a replacement task without writes', () => {
  const f = fixture();
  f.state.intercept = (method, path) => {
    if (method === 'POST' && path === `${ROOT}/issues/1462/comments`) throw new Error('github_result_unknown_do_not_resend');
  };
  assert.throws(() => f.helper.request(REQUEST), /github_result_unknown_do_not_resend/);
  f.state.intercept = null; f.state.calls = [];
  const result = f.helper.inspect({ pr: REQUEST.pr });
  assert.equal(result.records.length, 0);
  assert.equal(result.labelApplied, false);
  assert.deepEqual(result.requestReservations, [{
    name: [...f.state.reservations.keys()][0], pr: 1462, taskId: null,
    requestKeyHash: [...f.state.reservations.keys()][0].slice('ai-staff-rq-'.length),
    round: 1, head: HEAD, status: 'unresolved', requestCommentId: null,
  }]);
  assert.equal(writes(f.state).length, 0);
  for (const changed of [{}, { action: 'implement' }, { scope: 'scripts/another.cjs' }]) {
    f.state.calls = [];
    assert.throws(() => f.helper.request({ ...REQUEST, ...changed, 'task-id': 'replacement-task' }), /other_request_reserved_result_unknown_do_not_resend/);
    assert.equal(writes(f.state).length, 0);
    assert.equal(f.state.reservations.size, 1);
  }
  f.state.head = NEXT; f.state.calls = [];
  assert.equal(f.helper.inspect({ pr: REQUEST.pr }).requestReservations[0].head, HEAD);
  assert.throws(() => f.helper.request({ ...REQUEST, 'task-id': 'replacement-task' }), /other_request_reserved_result_unknown_do_not_resend/);
  assert.equal(writes(f.state).length, 0);
});

test('all repository label pages are read before a new task can send', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) f.state.reservations.set(`unrelated-${i}`, { name: `unrelated-${i}`, description: null });
  const reserved = reservationFor('request', { pr: 1462, taskId: 'interrupted-task', round: 1, head: HEAD });
  f.state.reservations.set(reserved.name, reserved);
  assert.equal(f.helper.inspect({ pr: REQUEST.pr }).requestReservations[0].name, reserved.name);
  assert.ok(f.state.calls.some(c => c.path === `${ROOT}/labels?per_page=100&page=2`));
  f.state.calls = [];
  assert.throws(() => f.helper.request(REQUEST), /other_request_reserved_result_unknown_do_not_resend/);
  assert.equal(writes(f.state).length, 0);
});

test('failed, unknown or malformed label pages never become an empty reservation search', () => {
  for (const response of [{ status: 503, data: [] }, undefined, { status: 200, data: null },
    { status: 200, data: {} }, { status: 200, data: [{ description: null }] },
    { status: 200, data: Array.from({ length: 101 }, (_, i) => ({ name: `extra-${i}` })) }]) {
    const f = fixture();
    // Explicitly return undefined for the transport itself in that case.
    const transport = (method, path, body) => path.startsWith(`${ROOT}/labels?`) ? response : f.api(method, path, body);
    const helper = createHandoff({ api: transport });
    assert.throws(() => helper.inspect({ pr: REQUEST.pr }), /github_read_failed|reservation_pagination_unknown/);
    assert.throws(() => helper.request(REQUEST), /github_read_failed|reservation_pagination_unknown/);
    assert.equal(writes(f.state).length, 0);
  }
});

test('a failed second label page and repeated pages stop before a replacement send', () => {
  for (const second of [{ status: 503, data: [] }, { status: 200, data: [{ name: 'unrelated-0' }] }]) {
    const f = fixture();
    for (let i = 0; i < 100; i++) f.state.reservations.set(`unrelated-${i}`, { name: `unrelated-${i}` });
    f.state.intercept = (method, path) => path === `${ROOT}/labels?per_page=100&page=2` ? second : undefined;
    assert.throws(() => f.helper.inspect({ pr: REQUEST.pr }), /github_read_failed_503|reservation_pagination_unknown/);
    assert.throws(() => f.helper.request(REQUEST), /github_read_failed_503|reservation_pagination_unknown/);
    assert.equal(writes(f.state).length, 0);
  }
});

test('exhausting the repository label pagination limit stops without writes', () => {
  const f = fixture();
  f.state.intercept = (method, path) => {
    if (method === 'GET' && path.startsWith(`${ROOT}/labels?`)) {
      const page = Number(new URL(`https://example.com/${path}`).searchParams.get('page'));
      return { status: 200, data: Array.from({ length: 100 }, (_, i) => ({ name: `unrelated-${page}-${i}` })) };
    }
  };
  assert.throws(() => f.helper.inspect({ pr: REQUEST.pr }), /reservation_pagination_incomplete/);
  assert.throws(() => f.helper.request(REQUEST), /reservation_pagination_incomplete/);
  assert.equal(writes(f.state).length, 0);
});

test('an unbound legacy request is exposed as unknown and stops new IDs on every PR', () => {
  for (const number of [1462, 1463]) {
    const f = fixture(); f.state.pr = number;
    const reserved = reservationFor('request', { pr: 1462, taskId: 'legacy-task', round: 1, head: HEAD });
    reserved.description = `${SCHEMA} request ${HEAD}`;
    f.state.reservations.set(reserved.name, reserved);
    const inspected = f.helper.inspect({ pr: String(number) }).requestReservations;
    assert.equal(inspected.length, 1);
    assert.equal(inspected[0].pr, null);
    assert.equal(inspected[0].taskId, null);
    assert.equal(inspected[0].status, 'unknown');
    assert.equal(inspected[0].head, HEAD);
    assert.throws(() => f.helper.request({ ...REQUEST, pr: String(number), 'task-id': 'new-task' }), /other_request_reserved_result_unknown_do_not_resend/);
    assert.equal(writes(f.state).length, 0);
    assert.deepEqual([...f.state.reservations.values()], [reserved]);
  }
});

test('legacy request names and exact descriptions remain usable without updating the old reservation', () => {
  const f = fixture(); f.helper.request(REQUEST);
  const reserved = [...f.state.reservations.values()][0];
  reserved.description = `${SCHEMA} request ${HEAD}`;
  f.state.calls = [];
  assert.equal(f.helper.request(REQUEST).status, 'already_requested');
  const recovered = f.helper.inspect({ pr: REQUEST.pr }).requestReservations[0];
  assert.equal(recovered.taskId, REQUEST['task-id']);
  assert.equal(recovered.status, 'recorded');
  assert.equal(writes(f.state).length, 0);
  f.helper.claim(CLAIM); f.helper.receipt(RECEIPT);
  f.state.calls = [];
  assert.equal(f.helper.request(REQUEST).status, 'already_requested');
  assert.equal(f.helper.receipt(RECEIPT).status, 'already_returned');
  assert.equal(writes(f.state).length, 0);
  assert.equal(f.state.reservations.get(reserved.name).description, `${SCHEMA} request ${HEAD}`);
});

test('conflicting and malformed reservation metadata is unknown rather than ignored', () => {
  const normal = reservationFor('request', { pr: 1462, taskId: 'interrupted-task', round: 1, head: HEAD });
  for (const reserved of [
    { ...normal, description: null }, { ...normal, description: 'unrecognized metadata' },
    { ...normal, description: `chappy-ai-handoff:v2 request 1462 4 ${HEAD}` },
    { ...normal, description: `chappy-ai-handoff:v2 request 1463 1 ${HEAD}\n` },
    { ...normal, name: 'ai-staff-rq-incomplete' },
    { ...normal, name: normal.name.toUpperCase() },
    { ...normal, name: `${normal.name}\n` },
  ]) {
    const f = fixture(); f.state.reservations.set(reserved.name, reserved);
    assert.equal(f.helper.inspect({ pr: REQUEST.pr }).requestReservations[0].status, 'unknown');
    assert.throws(() => f.helper.request(REQUEST), /other_request_reserved_result_unknown_do_not_resend/);
    assert.equal(writes(f.state).length, 0);
  }
  const f = fixture(); f.helper.request(REQUEST);
  const reserved = [...f.state.reservations.values()][0];
  reserved.description = `chappy-ai-handoff:v2 request 1463 1 ${HEAD}`;
  f.state.calls = [];
  assert.equal(f.helper.inspect({ pr: REQUEST.pr }).requestReservations[0].status, 'unknown');
  assert.throws(() => f.helper.request(REQUEST), /reservation_conflict/);
  assert.throws(() => f.helper.request({ ...REQUEST, 'task-id': 'new-task' }), /other_request_reserved_result_unknown_do_not_resend/);
  assert.equal(writes(f.state).length, 0);
});

test('a new-format reservation on a different PR does not block an unrelated request', () => {
  const f = fixture();
  const reserved = reservationFor('request', { pr: 1463, taskId: 'other-pr-task', round: 1, head: HEAD });
  f.state.reservations.set(reserved.name, reserved);
  assert.deepEqual(f.helper.inspect({ pr: REQUEST.pr }).requestReservations, []);
  assert.equal(f.helper.request(REQUEST).status, 'requested');
  assert.deepEqual(f.state.reservations.get(reserved.name), reserved);
  assert.equal(commentWrites(f.state).length, 1);
});

test('a separate task after a completed exchange remains allowed by the existing contract', () => {
  const f = fixture(); requestAndClaim(f); f.helper.receipt(RECEIPT);
  f.state.calls = [];
  assert.equal(f.helper.request({ ...REQUEST, 'task-id': 'separate-task', scope: 'scripts/another.cjs',
    'authorization-url': `https://github.com/${REPO}/issues/1338#issuecomment-2` }).status, 'requested');
  assert.equal(commentWrites(f.state).length, 1);
});

test('reservation metadata fits label limits at maximum PR and task lengths without truncating an ID', () => {
  const taskId = 'a'.repeat(80);
  const target = { pr: 999999999, taskId, round: 3, head: HEAD };
  const reserved = reservationFor('request', target);
  assert.ok(reserved.name.length <= 50);
  assert.ok(reserved.description.length <= 100);
  assert.equal(reserved.description, `chappy-ai-handoff:v2 request 999999999 3 ${HEAD}`);
  const f = fixture(); f.state.pr = target.pr;
  f.state.reservations.set(reserved.name, reserved);
  const unknown = f.helper.inspect({ pr: String(target.pr) }).requestReservations[0];
  assert.equal(unknown.taskId, null);
  assert.equal(unknown.pr, target.pr);
  assert.equal(unknown.round, 3);
  assert.equal(unknown.head, HEAD);
  assert.equal(unknown.requestKeyHash, reserved.name.slice('ai-staff-rq-'.length));
  f.comment(format({ schema: SCHEMA, kind: 'request', sender: 'chappy', receiver: 'claude', ...target,
    action: 'review', scope: ['scripts/example.cjs'], authorizationUrl: AUTH }));
  assert.equal(f.helper.inspect({ pr: String(target.pr) }).requestReservations[0].taskId, taskId);
  const invalid = fixture();
  assert.throws(() => invalid.helper.request({ ...REQUEST, 'task-id': 'a'.repeat(81) }), /invalid_task_id/);
  assert.throws(() => reservationFor('request', { ...target, pr: 1000000000 }), /invalid_pr/);
  assert.equal(invalid.state.calls.length, 0);
  assert.equal(writes(f.state).length, 0);
});

test('CLI rejects unknown, duplicate, missing and extra flags', () => {
  assert.deepEqual(parseArgs(['inspect', '--pr', '1462']), { command: 'inspect', options: { pr: '1462' } });
  for (const args of [[], ['merge', '--pr', '1462'], ['inspect', '--pr', '1462', '--force', 'true'],
    ['inspect'], ['inspect', '--pr', '1', '--pr', '2'], ['inspect', '--pr']]) assert.throws(() => parseArgs(args));
});

test('missing dedicated label stops before reserving or posting a request', () => {
  const f = fixture();
  f.state.intercept = (method, path) => path === `${ROOT}/labels/${LABEL}` ? { status: 404, data: {} } : undefined;
  assert.throws(() => f.helper.request(REQUEST), /github_read_failed_404/);
  assert.equal(writes(f.state).length, 0);
});

test('gh CLI uses argument array and JSON stdin, parses included status, and hides unknown output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chappy-handoff-gh-'));
  const modulePath = resolve(__dirname, '../scripts/ai-staff-handoff.cjs');
  try {
    writeFileSync(join(dir, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8');\nif (process.argv.includes('unknown')) { process.stdout.write('SENSITIVE_REMOTE_BODY'); process.stderr.write('SECRET_TOKEN'); process.exit(1); }\nconst status = process.argv.includes('missing') ? 404 : 201;\nprocess.stdout.write('HTTP/2.0 ' + status + ' Status\\r\\ncontent-type: application/json\\r\\n\\r\\n' + JSON.stringify({args:process.argv.slice(2),input}));\nprocess.exitCode = status === 404 ? 1 : 0;\n`, { mode: 0o700 });
    const program = `const {ghApi}=require(${JSON.stringify(modulePath)}); try { process.stdout.write(JSON.stringify(ghApi(process.argv[1],process.argv[2],process.argv[3]?JSON.parse(process.argv[3]):undefined))); } catch(e) {process.stderr.write(e.message);process.exitCode=1;}`;
    const run = (method, endpoint, body) => spawnSync(process.execPath, ['-e', program, method, endpoint, ...(body === undefined ? [] : [JSON.stringify(body)])], {
      encoding: 'utf8', env: { PATH: dir }, timeout: 5000,
    });
    const payload = { body: '$(do-not-run) `literal` "quoted"\nnext line' };
    const sent = run('POST', 'some/endpoint', payload);
    assert.equal(sent.status, 0, sent.stderr);
    const result = JSON.parse(sent.stdout);
    assert.equal(result.status, 201);
    assert.deepEqual(JSON.parse(result.data.input), payload);
    assert.deepEqual(result.data.args, ['api', '--include', '--method', 'POST', 'some/endpoint', '-H', 'Accept: application/vnd.github+json', '--input', '-']);
    const missing = run('GET', 'missing');
    assert.equal(missing.status, 0);
    assert.equal(JSON.parse(missing.stdout).status, 404);
    const unknown = run('POST', 'unknown', payload);
    assert.equal(unknown.status, 1);
    assert.equal(unknown.stdout, '');
    assert.equal(unknown.stderr, 'github_result_unknown_do_not_resend');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
