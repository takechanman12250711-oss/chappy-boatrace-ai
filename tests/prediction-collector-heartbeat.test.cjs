"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { decide, run } = require("../scripts/check-prediction-collector-heartbeat.cjs");
const NOW = Date.parse("2030-09-25T12:00:00Z");
const env = { GITHUB_REPOSITORY: "owner/repo", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule", GH_TOKEN: "test-only" };
const old = { head_branch: "main", event: "schedule", status: "completed", created_at: "2030-09-25T10:00:00Z" };
function reply(rows) { return { ok: true, status: 200, json: async () => ({ workflow_runs: rows }) }; }
test("stale collector qualifies without changing predictions", () => assert.equal(decide([old], NOW).dispatch, true));
test("a recent run is not duplicated", () => assert.equal(decide([{ ...old, created_at: "2030-09-25T11:15:00Z" }], NOW).dispatch, false));
for (const status of ["queued", "in_progress", "waiting", "requested", "pending"]) test(`does not duplicate ${status}`, () => {
  assert.equal(decide([{ ...old, status }], NOW).dispatch, false);
});
test("outside collection hours makes no request", async () => {
  const out = await run({ env, now: () => Date.parse("2030-09-25T14:00:00Z"), request: () => assert.fail("network") });
  assert.equal(out.reason, "outside-collection-hours");
});
test("rejects non-main and untrusted event contexts", async () => {
  for (const override of [{ GITHUB_REF: "refs/heads/other" }, { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REPOSITORY: "../bad" }])
    await assert.rejects(run({ env: { ...env, ...override }, now: () => NOW }), /context-invalid/);
});
test("invalid timestamps fail closed", () => {
  for (const created_at of ["invalid", "2040-01-01T00:00:00Z"]) assert.throws(() => decide([{ ...old, created_at }], NOW), /timestamp/);
});
test("double check prevents duplication if collector starts", async () => {
  let reads = 0;
  const out = await run({ env, now: () => NOW, request: async (_, options) => {
    assert.equal(options.method, undefined); return reply([++reads === 1 ? old : { ...old, status: "queued" }]);
  } });
  assert.equal(reads, 2); assert.equal(out.requested, false);
});
test("single dispatch is accepted, not claimed completed", async () => {
  let reads = 0, posts = 0;
  const out = await run({ env, now: () => NOW, request: async (url, options) => {
    if (options.method === "POST") { posts++; assert.ok(url.endsWith("/dispatches")); assert.deepEqual(JSON.parse(options.body), { ref: "main" }); return { status: 204 }; }
    reads++; return reply([old]);
  } });
  assert.equal(reads, 2); assert.equal(posts, 1); assert.equal(out.requested, true); assert.equal(out.executionConfirmed, false);
});
test("check-only never dispatches", async () => {
  const out = await run({ env, now: () => NOW, checkOnly: true, request: async (_, options) => { assert.equal(options.method, undefined); return reply([old]); } });
  assert.equal(out.requested, false); assert.equal(out.dispatch, true);
});
test("API failure is not converted to successful recovery", async () => {
  await assert.rejects(run({ env, now: () => NOW, request: async () => ({ ok: false, status: 403 }) }), /read-403/);
});

test("current API 200 receipt identifies the requested run", async () => {
  const out = await run({ env, now: () => NOW, request: async (_, options) => options.method === "POST"
    ? { status: 200, json: async () => ({ workflow_run_id: 12345 }) } : reply([old]) });
  assert.equal(out.workflowRunId, 12345); assert.equal(out.executionConfirmed, false);
});
