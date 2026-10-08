"use strict";
// Recover missed triggers, not predictions. Never fabricate historical snapshots.
const fs = require("node:fs");
const WORKFLOW = "live-note.yml";
const MAX_AGE_MS = 30 * 60 * 1000;
function validSourceEvent(event, repo) {
  const source = event?.workflow_run;
  return event?.action === "completed" && event?.repository?.full_name === repo &&
    ((source?.name === "Update note marketing" && source?.path === ".github/workflows/update-note-marketing.yml") ||
     (source?.name === "Note GitHub UI Transport" && source?.path === ".github/workflows/note-github-ui-transport.yml")) &&
    source?.status === "completed" && source?.conclusion === "success" &&
    source?.head_repository?.full_name === repo && source?.head_branch === "main" &&
    ["schedule", "workflow_dispatch", "push", "workflow_run"].includes(source?.event);
}
function inWindow(now) {
  const date = new Date(now + 9 * 60 * 60 * 1000);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return minute >= 7 * 60 && minute < 22 * 60 + 30;
}
function decide(runs, now = Date.now()) {
  if (!Number.isFinite(now) || !Array.isArray(runs)) throw Error("invalid-heartbeat-input");
  if (!inWindow(now)) return { dispatch: false, reason: "outside-collection-hours" };
  const main = runs.filter(r => r.head_branch === "main" && r.event !== "pull_request");
  if (main.some(r => r.status !== "completed")) return { dispatch: false, reason: "live-note-already-active" };
  const times = main.map(r => Date.parse(r.created_at));
  if (times.some(t => !Number.isFinite(t) || t > now)) throw Error("invalid-run-timestamp");
  const latest = times.length ? Math.max(...times) : null;
  const ageMinutes = latest === null ? null : Math.floor((now - latest) / 60000);
  return { dispatch: latest === null || now - latest >= MAX_AGE_MS,
    reason: latest === null ? "no-main-run" : now - latest >= MAX_AGE_MS ? "live-note-trigger-stale" : "recent-live-note-run",
    latestRunCreatedAt: latest === null ? null : new Date(latest).toISOString(), ageMinutes };
}
async function run({ env = process.env, now = Date.now, request = fetch, checkOnly = false,
  readEvent = file => JSON.parse(fs.readFileSync(file, "utf8")) } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || "") || env.GITHUB_REF !== "refs/heads/main" ||
      !["schedule", "workflow_dispatch", "push", "workflow_run"].includes(env.GITHUB_EVENT_NAME)) throw Error("heartbeat-context-invalid");
  if (env.GITHUB_EVENT_NAME === "workflow_run") {
    let event;
    try { event = readEvent(env.GITHUB_EVENT_PATH); } catch { throw Error("heartbeat-source-event-invalid"); }
    if (!validSourceEvent(event, repo)) throw Error("heartbeat-source-event-invalid");
  }
  if (!inWindow(now())) return { dispatch: false, reason: "outside-collection-hours" };
  if (!env.GH_TOKEN) throw Error("heartbeat-token-missing");
  const base = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}`;
  const headers = { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
  async function read() {
    const response = await request(base + "/runs?branch=main&per_page=100", { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`heartbeat-read-${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.workflow_runs)) throw Error("heartbeat-response-invalid");
    return decide(data.workflow_runs, now());
  }
  let decision = await read();
  if (!decision.dispatch || checkOnly) return { ...decision, requested: false };
  // Recheck immediately before the single request; do not retry an uncertain POST.
  decision = await read();
  if (!decision.dispatch) return { ...decision, requested: false };
  const response = await request(base + "/dispatches", { method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }), signal: AbortSignal.timeout(20000) });
  if (![200, 204].includes(response.status)) throw Error(`heartbeat-dispatch-${response.status}`);
  const receipt = response.status === 200 ? await response.json() : {};
  return { ...decision, requested: true, executionConfirmed: false,
    workflowRunId: Number.isSafeInteger(receipt.workflow_run_id) ? receipt.workflow_run_id : null };
}
if (require.main === module) run({ checkOnly: process.argv.includes("--check-only") })
  .then(out => console.log(JSON.stringify(out)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { WORKFLOW, MAX_AGE_MS, inWindow, decide, run, validSourceEvent };
