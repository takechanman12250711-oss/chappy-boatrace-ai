#!/usr/bin/env node
'use strict';

// Usage (fixed repository, no model API or merge operation):
//   node scripts/ai-staff-handoff.cjs inspect --pr 123
//   node scripts/ai-staff-handoff.cjs request --pr 123 --task-id work-123 --round 1 \
//     --action review --scope scripts/example.cjs --authorization-url https://github.com/takechanman12250711-oss/chappy-boatrace-ai/issues/123
//   node scripts/ai-staff-handoff.cjs claim --pr 123 --task-id work-123 --round 1 --head <40-character SHA>
//   node scripts/ai-staff-handoff.cjs receipt --pr 123 --task-id work-123 --round 1 \
//     --head <request SHA> --result-head <current SHA> --session-url https://claude.ai/code/session_example \
//     --status returned --summary-file <plain-text file>
// Create-only repository labels reserve sends and one claim. Reservation labels
// are never attached to PRs, updated or deleted; only LABEL is attached/removed.
// An interrupted send stays reserved and is never automatically resent. These
// reservations do not lock edits made through other tools. Actor names are declarations, not
// cryptographic proof of a model's identity; both actors use the owner's login.

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');

const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const OWNER = 'takechanman12250711-oss';
const LABEL = 'chappy-claude-handoff';
const SCHEMA = 'chappy-ai-handoff:v1';
const REQUEST_RESERVATION_SCHEMA = 'chappy-ai-handoff:v2';
const MARKER = `<!-- ${SCHEMA} -->`;
const ROOT = `repos/${REPO}`;

function fail(code) { throw new Error(code); }
function requireThat(condition, code) { if (!condition) fail(code); }
function sha(value) { requireThat(typeof value === 'string' && /^[a-f0-9]{40}$/.test(value), 'invalid_sha'); return value; }
function task(value) { requireThat(typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value), 'invalid_task_id'); return value; }
function round(value) { requireThat(/^[1-3]$/.test(String(value)), 'round_limit_1_to_3'); return Number(value); }
function prNumber(value) { requireThat(/^[1-9]\d{0,8}$/.test(String(value)), 'invalid_pr'); return Number(value); }
function scope(value) {
  const paths = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  requireThat(paths.length > 0 && paths.length <= 25, 'invalid_scope');
  for (const path of paths) {
    requireThat(typeof path === 'string' && /^[a-zA-Z0-9_.\/-]+$/.test(path) && !path.startsWith('/') &&
      !path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git' || /^\.env(?:\.|$)/.test(part)) &&
      !/(?:^|\/)(?:credentials|secrets?)(?:\.|\/|$)/i.test(path), 'invalid_scope_path');
  }
  requireThat(new Set(paths).size === paths.length, 'duplicate_scope_path');
  return paths;
}
function safeUrl(value, type) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_url'); }
  requireThat(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.port, 'invalid_url');
  if (type === 'authorization') {
    requireThat(url.hostname === 'github.com' && new RegExp(`^/${REPO}/(?:issues|pull)/[1-9]\\d*$`).test(url.pathname) &&
      (!url.hash || /^#(?:issuecomment-|pullrequestreview-|discussion_r)\d+$/.test(url.hash)), 'invalid_authorization_url');
  } else {
    requireThat(url.hostname === 'claude.ai' && /^\/code\/[a-zA-Z0-9_-]+$/.test(url.pathname) && !url.hash, 'invalid_session_url');
  }
  return url.href;
}
function key(record) { return `${record.taskId}/r${record.round}`; }
function reservationFor(kind, record) {
  const prefixes = { request: 'rq', claim: 'clm', receipt: 'rcpt' };
  requireThat(Object.hasOwn(prefixes, kind), 'invalid_reservation_kind');
  const head = sha(record.head);
  const key = `${task(record.taskId)}/r${round(record.round)}${kind === 'claim' ? `/${head}` : ''}`;
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
  // Keep the existing task/round name, including its create-only collision guard.
  // PR + round + full head fit GitHub's 100-character description limit even
  // for a 9-digit PR. The name is a hash, never a recovered/truncated taskId.
  const description = kind === 'request'
    ? `${REQUEST_RESERVATION_SCHEMA} request ${prNumber(record.pr)} ${round(record.round)} ${head}`
    : `${SCHEMA} ${kind} ${head}`;
  return { name: `ai-staff-${prefixes[kind]}-${digest}`, color: 'EDEDED', description };
}
function format(record) { return `${MARKER}\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``; }

// --include exposes HTTP status even when gh exits nonzero (e.g. a real 404).
// Never echo stderr, stdout, environment variables or request bodies on errors.
function ghApi(method, endpoint, body) {
  const args = ['api', '--include', '--method', method, endpoint, '-H', 'Accept: application/vnd.github+json'];
  if (body !== undefined) args.push('--input', '-');
  const result = spawnSync('gh', args, {
    shell: false, encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body),
    timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || typeof result.stdout !== 'string') fail('github_result_unknown_do_not_resend');
  const match = /^HTTP\/\S+\s+(\d{3})[^\r\n]*\r?\n/.exec(result.stdout);
  requireThat(match, 'github_result_unknown_do_not_resend');
  const split = result.stdout.search(/\r?\n\r?\n/);
  requireThat(split >= 0, 'github_result_unknown_do_not_resend');
  const status = Number(match[1]);
  const payload = result.stdout.slice(split).trim();
  let data = null;
  if (payload) { try { data = JSON.parse(payload); } catch { fail('github_result_unknown_do_not_resend'); } }
  if (result.status !== 0 && status < 400) fail('github_result_unknown_do_not_resend');
  return { status, data };
}

function createHandoff({ api = ghApi, now = () => new Date().toISOString(), readFile = readFileSync } = {}) {
  function call(method, path, body, statuses = [200]) {
    const response = api(method, path, body);
    requireThat(response && statuses.includes(response.status), `${method === 'GET' ? 'github_read_failed' : 'github_write_failed_do_not_resend'}_${response?.status ?? 'unknown'}`);
    return response.data;
  }
  function currentPr(number) {
    const p = call('GET', `${ROOT}/pulls/${number}`);
    requireThat(p && p.number === number && p.state === 'open' && !p.merged, 'pr_not_open');
    requireThat(p.head?.repo?.full_name === REPO && p.base?.repo?.full_name === REPO && p.base?.ref === 'main', 'fork_or_wrong_base');
    sha(p.head.sha);
    requireThat(Array.isArray(p.labels) && p.labels.every(label => typeof label.name === 'string'), 'labels_unknown');
    return p;
  }
  function ensureHead(number, head) {
    const p = currentPr(number);
    requireThat(p.head.sha === head, 'head_changed_stop_without_editing');
    return p;
  }
  function validateRecord(r, number) {
    requireThat(r && r.schema === SCHEMA && ['request', 'claim', 'receipt'].includes(r.kind) && r.pr === number, 'invalid_trusted_record');
    task(r.taskId); round(r.round); sha(r.head);
    requireThat(r.sender === (r.kind === 'request' ? 'chappy' : 'claude') && r.receiver === (r.kind === 'request' ? 'claude' : 'chappy'), 'invalid_trusted_actor');
    if (r.kind === 'request') {
      requireThat(['review', 'implement'].includes(r.action), 'invalid_trusted_action');
      scope(r.scope); safeUrl(r.authorizationUrl, 'authorization');
    } else {
      requireThat(r.claimLabel === reservationFor('claim', r).name, 'invalid_claim_label');
      if (r.kind === 'receipt') {
        sha(r.resultHead); safeUrl(r.sessionUrl, 'session');
        requireThat(['returned', 'stopped'].includes(r.status) && typeof r.summary === 'string' && r.summary.trim() && r.summary.length <= 4000, 'invalid_trusted_receipt');
      }
    }
    return r;
  }
  function records(number) {
    const all = [];
    for (let page = 1; page <= 1000; page++) {
      const rows = call('GET', `${ROOT}/issues/${number}/comments?per_page=100&page=${page}`);
      requireThat(Array.isArray(rows), 'comment_pagination_unknown');
      for (const comment of rows) {
        if (comment.user?.login !== OWNER || typeof comment.body !== 'string' || !comment.body.includes(MARKER)) continue;
        const m = new RegExp(`^${MARKER}\\n\x60\x60\x60json\\n([\\s\\S]+)\\n\x60\x60\x60\\s*$`).exec(comment.body);
        requireThat(m && Number.isSafeInteger(comment.id), 'invalid_trusted_comment');
        let record;
        try { record = JSON.parse(m[1]); } catch { fail('invalid_trusted_json'); }
        all.push({ ...validateRecord(record, number), commentId: comment.id, commentUrl: comment.html_url });
      }
      if (rows.length < 100) return all;
    }
    fail('comment_pagination_incomplete');
  }
  function one(rows, kind, target) {
    const found = rows.filter(r => r.kind === kind && key(r) === key(target));
    requireThat(found.length <= 1, 'duplicate_trusted_records');
    return found[0];
  }
  function reservationExists(reservation, legacyDescription) {
    const result = api('GET', `${ROOT}/labels/${reservation.name}`);
    if (result?.status === 404) return null;
    requireThat(result?.status === 200, 'reservation_read_unknown');
    requireThat(result.data?.name === reservation.name &&
      (result.data.description === reservation.description ||
        (legacyDescription !== undefined && result.data.description === legacyDescription)), 'reservation_conflict');
    return true;
  }
  function requestReservationExists(record) {
    return reservationExists(reservationFor('request', record), `${SCHEMA} request ${sha(record.head)}`);
  }
  function requestReservations(number, rows) {
    const labels = [];
    const names = new Set();
    let complete = false;
    for (let page = 1; page <= 1000; page++) {
      const found = call('GET', `${ROOT}/labels?per_page=100&page=${page}`);
      requireThat(Array.isArray(found) && found.length <= 100, 'reservation_pagination_unknown');
      for (const label of found) {
        requireThat(label && typeof label.name === 'string' && !names.has(label.name.toLowerCase()), 'reservation_pagination_unknown');
        names.add(label.name.toLowerCase());
        if (label.name.toLowerCase().startsWith('ai-staff-rq-')) labels.push(label);
      }
      if (found.length < 100) { complete = true; break; }
    }
    requireThat(complete, 'reservation_pagination_incomplete');
    function exact(pattern, value) {
      const match = typeof value === 'string' ? pattern.exec(value) : null;
      return match?.[0] === value ? match : null;
    }
    return labels.flatMap(label => {
      const match = exact(/^ai-staff-rq-([a-f0-9]{32})$/, label.name);
      const metadata = exact(/^chappy-ai-handoff:v2 request ([1-9]\d{0,8}) ([1-3]) ([a-f0-9]{40})$/, label.description);
      const legacy = exact(/^chappy-ai-handoff:v1 request ([a-f0-9]{40})$/, label.description);
      const matching = rows.filter(r => r.kind === 'request' && reservationFor('request', r).name === label.name);
      requireThat(matching.length <= 1, 'duplicate_trusted_records');
      const request = matching[0];
      if (request && (label.description === reservationFor('request', request).description ||
        label.description === `${SCHEMA} request ${request.head}`)) {
        return [{ name: label.name, pr: number, taskId: request.taskId, requestKeyHash: match[1],
          round: request.round, head: request.head, status: 'recorded', requestCommentId: request.commentId }];
      }
      // A legacy label without its request comment cannot be assigned to a PR.
      // Expose that uncertainty for every PR; never silently treat it as absent.
      if (match && metadata && !request) {
        if (Number(metadata[1]) !== number) return [];
        return [{ name: label.name, pr: number, taskId: null, requestKeyHash: match[1],
          round: Number(metadata[2]), head: metadata[3], status: 'unresolved', requestCommentId: null }];
      }
      return [{ name: label.name, pr: null, taskId: null, requestKeyHash: match?.[1] ?? null,
        round: null, head: legacy?.[1] ?? null, status: 'unknown', requestCommentId: null }];
    });
  }
  function createReservation(reservation) {
    const result = call('POST', `${ROOT}/labels`, reservation, [201]);
    requireThat(result?.name === reservation.name && result.description === reservation.description, 'reservation_write_unknown_do_not_resend');
    requireThat(reservationExists(reservation), 'reservation_readback_failed_do_not_resend');
  }
  function post(number, record) {
    const body = format(record);
    const result = call('POST', `${ROOT}/issues/${number}/comments`, { body }, [201]);
    requireThat(Number.isSafeInteger(result?.id), 'comment_write_unknown_do_not_resend');
    requireThat(result.user?.login === OWNER && result.body === body, 'comment_write_actor_mismatch_stop');
    const saved = call('GET', `${ROOT}/issues/comments/${result.id}`);
    requireThat(saved?.id === result.id && saved.user?.login === OWNER && saved.body === body, 'comment_readback_failed_do_not_resend');
    return { commentId: saved.id, commentUrl: saved.html_url };
  }
  function base(options) { return { pr: prNumber(options.pr), taskId: task(options['task-id']), round: round(options.round) }; }
  function inspect(options) {
    const number = prNumber(options.pr);
    const p = currentPr(number);
    const rows = records(number);
    return { repo: REPO, pr: number, head: p.head.sha, labelApplied: p.labels.some(l => l.name === LABEL),
      records: rows, requestReservations: requestReservations(number, rows) };
  }
  function request(options) {
    const b = base(options);
    requireThat(['review', 'implement'].includes(options.action), 'invalid_action');
    const paths = scope(options.scope);
    const authorizationUrl = safeUrl(options['authorization-url'], 'authorization');
    const p = currentPr(b.pr);
    requireThat(call('GET', `${ROOT}/labels/${LABEL}`)?.name === LABEL, 'handoff_label_missing');
    const target = { ...b, head: p.head.sha };
    const rows = records(b.pr);
    const reservations = requestReservations(b.pr, rows);
    const existing = one(rows, 'request', target);
    const intent = reservationFor('request', target);
    const reserved = requestReservationExists(target);
    if (existing) {
      requireThat(reserved && existing.head === target.head && existing.action === options.action &&
        JSON.stringify(existing.scope) === JSON.stringify(paths) && existing.authorizationUrl === authorizationUrl, 'request_conflict');
      return { status: 'already_requested', ...target, commentId: existing.commentId, labelApplied: p.labels.some(l => l.name === LABEL) };
    }
    requireThat(!reserved, 'request_reserved_result_unknown_do_not_resend');
    requireThat(reservations.every(r => r.status === 'recorded'), 'other_request_reserved_result_unknown_do_not_resend');
    requireThat(!one(rows, 'claim', target) && !one(rows, 'receipt', target), 'orphan_record_stop');
    for (const r of rows.filter(r => r.kind === 'request')) {
      requireThat(one(rows, 'receipt', r), 'other_request_pending');
    }
    requireThat(!rows.some(r => r.kind === 'request' && r.taskId === b.taskId && r.head === target.head), 'request_head_already_used');
    if (b.round > 1) {
      const previous = { ...b, round: b.round - 1 };
      const result = one(rows, 'receipt', previous);
      requireThat(result && result.status === 'returned', 'previous_round_not_returned');
      if (result.resultHead !== target.head) {
        const comparison = call('GET', `${ROOT}/compare/${result.resultHead}...${target.head}`);
        requireThat(comparison?.status === 'ahead' && comparison.merge_base_commit?.sha === result.resultHead, 'result_head_not_ancestor_of_request');
      }
    } else {
      requireThat(!rows.some(r => r.taskId === b.taskId), 'task_round_restart_forbidden');
    }
    const record = { schema: SCHEMA, kind: 'request', sender: 'chappy', receiver: 'claude', ...target,
      action: options.action, scope: paths, authorizationUrl, createdAt: now() };
    ensureHead(b.pr, target.head);
    createReservation(intent);
    ensureHead(b.pr, target.head);
    const saved = post(b.pr, record);
    ensureHead(b.pr, target.head);
    call('POST', `${ROOT}/issues/${b.pr}/labels`, { labels: [LABEL] });
    const verified = ensureHead(b.pr, target.head);
    requireThat(verified.labels.some(l => l.name === LABEL), 'label_readback_failed_do_not_resend');
    return { status: 'requested', ...target, ...saved, labelApplied: true };
  }
  function claim(options) {
    const b = { ...base(options), head: sha(options.head) };
    const p = ensureHead(b.pr, b.head);
    const rows = records(b.pr);
    const req = one(rows, 'request', b);
    requireThat(req && req.head === b.head && requestReservationExists(b), 'matching_request_not_found');
    requireThat(p.labels.some(l => l.name === LABEL), 'handoff_label_not_applied');
    requireThat(!one(rows, 'claim', b) && !one(rows, 'receipt', b), 'already_claimed_or_returned');
    const reservation = reservationFor('claim', b);
    requireThat(!reservationExists(reservation), 'claim_exists_stop');
    ensureHead(b.pr, b.head);
    createReservation(reservation); // Same-name POST is atomic: 422/unknown stops.
    ensureHead(b.pr, b.head);
    const record = { schema: SCHEMA, kind: 'claim', sender: 'claude', receiver: 'chappy', ...b,
      claimLabel: reservation.name, requestCommentId: req.commentId, createdAt: now() };
    const saved = post(b.pr, record);
    ensureHead(b.pr, b.head);
    call('DELETE', `${ROOT}/issues/${b.pr}/labels/${LABEL}`);
    const verified = ensureHead(b.pr, b.head);
    requireThat(!verified.labels.some(l => l.name === LABEL), 'label_removal_unknown_stop');
    return { status: 'claimed', ...b, claimLabel: record.claimLabel, action: req.action, scope: req.scope, authorizationUrl: req.authorizationUrl, ...saved };
  }
  function receipt(options) {
    const b = { ...base(options), head: sha(options.head) };
    const resultHead = sha(options['result-head']);
    requireThat(['returned', 'stopped'].includes(options.status), 'invalid_receipt_status');
    const sessionUrl = safeUrl(options['session-url'], 'session');
    requireThat(typeof options['summary-file'] === 'string' && options['summary-file'] && !/(?:^|\/)\.env(?:\.|$)/.test(options['summary-file']), 'invalid_summary_file');
    const summary = readFile(options['summary-file'], 'utf8').trim();
    requireThat(summary.length > 0 && summary.length <= 4000 && !/(?:gh[pousr]_|github_pat_|sk-(?:ant-)?[A-Za-z0-9]{12})/.test(summary), 'invalid_or_sensitive_summary');
    const p = currentPr(b.pr);
    requireThat(p.head.sha === resultHead, 'result_head_not_current');
    const rows = records(b.pr);
    const req = one(rows, 'request', b);
    const claimed = one(rows, 'claim', b);
    const claimReservation = reservationFor('claim', b);
    requireThat(req?.head === b.head && claimed?.head === b.head && reservationExists(claimReservation) &&
      requestReservationExists(b), 'matching_claim_not_found');
    const reservation = reservationFor('receipt', { ...b, head: resultHead });
    const reserved = reservationExists(reservation);
    const existing = one(rows, 'receipt', b);
    if (existing) {
      requireThat(reserved && existing.head === b.head && existing.resultHead === resultHead && existing.status === options.status &&
        existing.summary === summary && existing.sessionUrl === sessionUrl, 'receipt_conflict');
      return { status: 'already_returned', ...b, resultHead, commentId: existing.commentId };
    }
    requireThat(!reserved, 'receipt_reserved_result_unknown_do_not_resend');
    // A review cannot silently turn into an implementation or adopt another push.
    requireThat(options.status === 'stopped' || req.action === 'implement' || resultHead === b.head, 'review_head_changed_use_stopped');
    let verifiedChangedFiles = [];
    if (options.status === 'returned' && req.action === 'implement' && resultHead !== b.head) {
      const comparison = call('GET', `${ROOT}/compare/${b.head}...${resultHead}`);
      requireThat(comparison?.status === 'ahead' && comparison.merge_base_commit?.sha === b.head, 'implementation_head_not_forward');
      // GitHub caps this unpaginated response at 250 commits / 300 files. At the
      // file cap completeness is unknown; GitHub does not expose a total-files field.
      requireThat(Number.isSafeInteger(comparison.total_commits) && comparison.total_commits > 0 && comparison.total_commits <= 250 &&
        Array.isArray(comparison.commits) && comparison.commits.length === comparison.total_commits &&
        Array.isArray(comparison.files) && comparison.files.length > 0 && comparison.files.length < 300, 'implementation_comparison_incomplete');
      const names = new Set();
      for (const file of comparison.files) {
        requireThat(file && typeof file.filename === 'string' && !names.has(file.filename) &&
          ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(file.status), 'implementation_files_unknown');
        requireThat(req.scope.includes(file.filename), 'implementation_outside_scope');
        names.add(file.filename);
        if (file.status === 'renamed' || file.previous_filename !== undefined) {
          requireThat(typeof file.previous_filename === 'string' && req.scope.includes(file.previous_filename), 'implementation_rename_outside_scope');
          names.add(file.previous_filename);
        }
      }
      verifiedChangedFiles = [...names].sort();
    }
    const record = { schema: SCHEMA, kind: 'receipt', sender: 'claude', receiver: 'chappy', ...b,
      claimLabel: claimReservation.name, resultHead, sessionUrl, status: options.status, verifiedChangedFiles,
      summary, headChanged: resultHead !== b.head, createdAt: now() };
    ensureHead(b.pr, resultHead);
    createReservation(reservation);
    ensureHead(b.pr, resultHead);
    const saved = post(b.pr, record);
    ensureHead(b.pr, resultHead);
    return { status: 'receipt_saved', ...b, resultHead, ...saved };
  }
  return { inspect, request, claim, receipt };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const allowed = {
    inspect: ['pr'], request: ['pr', 'task-id', 'round', 'action', 'scope', 'authorization-url'],
    claim: ['pr', 'task-id', 'round', 'head'],
    receipt: ['pr', 'task-id', 'round', 'head', 'result-head', 'session-url', 'status', 'summary-file'],
  };
  requireThat(Object.hasOwn(allowed, command), 'usage_inspect_request_claim_receipt');
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]?.startsWith('--') ? rest[i].slice(2) : '';
    requireThat(allowed[command].includes(name) && !Object.hasOwn(options, name) && rest[i + 1] && !rest[i + 1].startsWith('--'), 'invalid_arguments');
    options[name] = rest[i + 1];
  }
  requireThat(allowed[command].every(name => Object.hasOwn(options, name)), 'missing_arguments');
  return { command, options };
}

if (require.main === module) {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(createHandoff()[command](options), null, 2)}\n`);
  } catch (error) {
    // Fixed error codes only; never include remote bodies or local file contents.
    const code = /^[a-z0-9_]+$/.test(error.message) ? error.message : 'handoff_failed_stop_without_retry';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createHandoff, parseArgs, format, reservationFor, REPO, OWNER, LABEL, MARKER, SCHEMA, ghApi };
