"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { decide, run, MAX_AGE_MS } = require("../scripts/check-live-note-heartbeat.cjs");
const NOW = Date.parse("2030-09-25T12:00:00Z");
const env = { GITHUB_REPOSITORY: "owner/repo", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule", GH_TOKEN: "test-only" };
const old = { head_branch: "main", event: "schedule", status: "completed", created_at: "2030-09-25T10:00:00Z" };
const source = { action: "completed", repository: { full_name: "owner/repo" }, workflow_run: {
  name: "Update note marketing", path: ".github/workflows/update-note-marketing.yml", status: "completed", conclusion: "success",
  head_repository: { full_name: "owner/repo" }, head_branch: "main", event: "schedule"
} };
const workflowEnv = { ...env, GITHUB_EVENT_NAME: "workflow_run", GITHUB_EVENT_PATH: "event.json" };
const reply = rows => ({ ok: true, status: 200, json: async () => ({ workflow_runs: rows }) });
const forbiddenRequest = () => assert.fail("untrusted context must not call GitHub");

test("live-note stale threshold stays exactly 30 minutes", () => {
  assert.equal(MAX_AGE_MS, 30 * 60000);
  assert.equal(decide([{ ...old, created_at: new Date(NOW - MAX_AGE_MS + 1).toISOString() }], NOW).dispatch, false);
  assert.equal(decide([{ ...old, created_at: new Date(NOW - MAX_AGE_MS).toISOString() }], NOW).dispatch, true);
});
for (const status of ["queued", "in_progress", "waiting", "requested", "pending"]) test(`does not duplicate ${status}`, () => {
  assert.equal(decide([{ ...old, status }], NOW).dispatch, false);
});
test("outside collection hours makes no request", async () => {
  assert.equal((await run({ env, now: () => Date.parse("2030-09-25T14:00:00Z"), request: forbiddenRequest })).reason, "outside-collection-hours");
});
for (const event of ["schedule", "workflow_dispatch", "push"]) test(`retains existing ${event} context`, async () => {
  const out = await run({ env: { ...env, GITHUB_EVENT_NAME: event }, now: () => NOW, checkOnly: true,
    request: async () => reply([old]), readEvent: () => assert.fail("non-workflow event does not read payload") });
  assert.equal(out.dispatch, true); assert.equal(out.requested, false);
});
for (const override of [
  { GITHUB_REF: "refs/heads/other" }, { GITHUB_REF: "refs/pull/1/merge" },
  { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_EVENT_NAME: "pull_request_target" }, { GITHUB_REPOSITORY: "../bad" }
]) test(`rejects outer context ${JSON.stringify(override)}`, async () => {
  await assert.rejects(run({ env: { ...workflowEnv, ...override }, now: () => NOW, request: forbiddenRequest,
    readEvent: () => source }), /heartbeat-context-invalid/);
});
const invalidSources = [
  ["non-main source", { workflow_run: { head_branch: "feature" } }],
  ["foreign source", { workflow_run: { head_repository: { full_name: "other/repo" } } }],
  ["failed source", { workflow_run: { conclusion: "failure" } }],
  ["cancelled source", { workflow_run: { conclusion: "cancelled" } }],
  ["unfinished source", { workflow_run: { status: "in_progress" } }],
  ["pull-request source", { workflow_run: { event: "pull_request" } }],
  ["pull-request-target source", { workflow_run: { event: "pull_request_target" } }],
  ["unknown source event", { workflow_run: { event: "repository_dispatch" } }],
  ["wrong source workflow", { workflow_run: { name: "Collect automatic race predictions" } }],
  ["same-name wrong workflow file", { workflow_run: { path: ".github/workflows/other.yml" } }],
  ["missing source workflow file", { workflow_run: { path: undefined } }],
  ["incomplete action", { action: "requested" }],
  ["foreign event repository", { repository: { full_name: "other/repo" } }]
];
for (const [name, override] of invalidSources) test(`rejects ${name} before any API call`, async () => {
  const event = { ...source, ...override, workflow_run: { ...source.workflow_run, ...override.workflow_run } };
  await assert.rejects(run({ env: workflowEnv, now: () => NOW, request: forbiddenRequest, readEvent: () => event }), /heartbeat-source-event-invalid/);
});
test("missing or malformed event payload fails closed", async () => {
  for (const readEvent of [() => null, () => { throw Error("missing or invalid JSON"); }]) {
    await assert.rejects(run({ env: workflowEnv, now: () => NOW, request: forbiddenRequest, readEvent }), /heartbeat-source-event-invalid/);
  }
});
test("reads actual GitHub event JSON from GITHUB_EVENT_PATH", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-note-heartbeat-"));
  try {
    const file = path.join(dir, "event.json"); fs.writeFileSync(file, JSON.stringify(source));
    const out = await run({ env: { ...workflowEnv, GITHUB_EVENT_PATH: file }, now: () => NOW, checkOnly: true, request: async () => reply([old]) });
    assert.equal(out.dispatch, true); assert.equal(out.requested, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
for (const event of ["schedule", "workflow_dispatch", "push", "workflow_run"]) test(`verified marketing ${event} completion requests one current-main run`, async () => {
  let reads = 0, posts = 0;
  const out = await run({ env: workflowEnv, now: () => NOW,
    readEvent: () => ({ ...source, workflow_run: { ...source.workflow_run, event } }),
    request: async (url, options) => {
      assert.ok(url.startsWith("https://api.github.com/repos/owner/repo/actions/workflows/live-note.yml/"));
      if (options.method === "POST") {
        posts++; assert.ok(url.endsWith("/dispatches")); assert.deepEqual(JSON.parse(options.body), { ref: "main" });
        return { status: 200, json: async () => ({ workflow_run_id: 12345 }) };
      }
      reads++; return reply([old]);
    } });
  assert.equal(reads, 2); assert.equal(posts, 1); assert.equal(out.requested, true);
  assert.equal(out.workflowRunId, 12345); assert.equal(out.executionConfirmed, false);
});
test("verified marketing trigger still rechecks before dispatch", async () => {
  let reads = 0;
  const out = await run({ env: workflowEnv, now: () => NOW, readEvent: () => source,
    request: async (_, options) => {
      assert.equal(options.method, undefined); return reply([++reads === 1 ? old : { ...old, status: "queued" }]);
    } });
  assert.equal(reads, 2); assert.equal(out.requested, false);
});
test("uncertain dispatch is never retried", async () => {
  let posts = 0;
  await assert.rejects(run({ env: workflowEnv, now: () => NOW, readEvent: () => source,
    request: async (_, options) => {
      if (options.method === "POST") { posts++; throw Error("transport interrupted"); }
      return reply([old]);
    } }), /transport interrupted/);
  assert.equal(posts, 1);
});
test("API failures remain errors", async () => {
  await assert.rejects(run({ env: workflowEnv, now: () => NOW, readEvent: () => source,
    request: async () => ({ ok: false, status: 403 }) }), /heartbeat-read-403/);
});
test("workflow keeps existing schedule, main checkout, source guard, serialization and both checks", () => {
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/collection-health-watchdog.yml"), "utf8");
  assert.match(workflow, /cron: "17,47 0-13,22-23 \* \* \*"/);
  assert.match(workflow, /github\.event\.workflow_run\.path == '\.github\/workflows\/update-note-marketing\.yml'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /group: chappy-prediction-collector-heartbeat\s+cancel-in-progress: false/);
  assert.match(workflow, /ref: main\s+persist-credentials: false/);
  assert.match(workflow, /node scripts\/check-prediction-collector-heartbeat\.cjs\s+node scripts\/check-live-note-heartbeat\.cjs/);
  assert.doesNotMatch(workflow, /HEARTBEAT_TRIGGER/);
});
