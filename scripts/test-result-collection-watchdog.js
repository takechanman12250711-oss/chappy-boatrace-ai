"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { ISSUE_TITLE, dueDates, inspectResults, evaluate, render, syncIssue, runWatchdog } = require("./result-collection-watchdog");
const now = new Date("2026-09-14T00:00:00Z");
function official(date) {
  return { source: "boatrace-official", date, raceCount: 1, completedRaces: 1,
    pendingRaces: 0, failedRaces: 0, complete: true,
    races: [{ jcd: "01", raceNo: 1, resultAvailable: true, trifecta: { combination: "1-2-3", payout: 1000 } }] };
}
const results = Object.fromEntries(dueDates(now).map(date => [date, official(date)]));
const successRun = { id: 100, head_branch: "main", status: "completed", conclusion: "success",
  created_at: "2026-09-13T17:30:00Z", html_url: "https://github.com/example/repo/actions/runs/100" };
const jobs = [{ steps: ["Save official results before calibration", "Build prediction calibration", "Save calibration and derived data"]
  .map(name => ({ name, conclusion: "success" })) }];
const healthy = evaluate({ now, run: successRun, jobs, results });
assert.equal(healthy.healthy, true);
const rerunJobs = [
  { id: 1, name: "collect", steps: [jobs[0].steps[0]] },
  { id: 2, name: "calibrate", steps: [{ ...jobs[0].steps[1], conclusion: "cancelled" }, { ...jobs[0].steps[2], conclusion: "skipped" }] },
  { id: 3, name: "calibrate", steps: jobs[0].steps.slice(1) }
];
assert.equal(evaluate({ now, run: successRun, jobs: rerunJobs, results }).healthy, true);
assert.deepEqual(dueDates(new Date("2026-09-13T20:59:59Z")), ["20260912", "20260911"]);
assert.deepEqual(dueDates(new Date("2026-09-13T21:00:00Z")), ["20260913", "20260912"]);
assert.deepEqual(dueDates(new Date("2026-01-01T00:00:00Z")), ["20251231", "20251230"]);
assert.deepEqual(dueDates(new Date("2024-03-01T00:00:00Z")), ["20240229", "20240228"]);
const voidResult = official("20260913");
voidResult.completedRaces = 0; voidResult.voidRaces = 1;
voidResult.races = [{ jcd: "01", raceNo: 1, status: "void", void: true, resultAvailable: false }];
assert.equal(inspectResults("20260913", voidResult).healthy, true);
for (const change of [
  d => { d.raceCount = 2; },
  d => { d.date = "20260912"; },
  d => { d.complete = false; },
  d => { d.races[0].resultAvailable = false; },
  d => { d.races[0].resultAvailable = false; d.races[0].error = "HTTP failure"; },
  d => { d.races[0].trifecta.payout = 0; },
  d => { d.races[0].trifecta.combination = "1-1-2"; },
  d => { d.races.push(d.races[0]); d.raceCount = 2; d.completedRaces = 2; },
  d => { d.races[0].jcd = "99"; }
]) {
  const d = official("20260913"); change(d);
  assert.equal(inspectResults("20260913", d).healthy, false);
  assert.equal(evaluate({ now, run: successRun, jobs, results: { ...results, "20260913": d } }).status, "error");
}
assert.equal(inspectResults("20260913", null).healthy, false);
const cancelledJobs = structuredClone(jobs);
cancelledJobs[0].steps[1].conclusion = "cancelled";
cancelledJobs[0].steps[2].conclusion = "skipped";
const failed = evaluate({ now, run: { ...successRun, conclusion: "cancelled" }, jobs: cancelledJobs, results });
assert.equal(failed.status, "error");
assert.equal(failed.stages.resultSave, "success");
assert.equal(failed.stages.calibration, "cancelled");
assert.ok(render(failed).includes("結果保存: success\n"));
assert.ok(!render(failed).includes("\\n"));
const missing = evaluate({ now, run: null, results });
assert.ok(missing.problems.some(x => x.includes("起動していません")));
const stale = evaluate({ now, run: { ...successRun, created_at: "2026-09-12T17:00:00Z" }, jobs, results });
assert.equal(stale.status, "error");
const active = evaluate({ now, run: { ...successRun, status: "in_progress", run_started_at: "2026-09-13T23:40:00Z" }, jobs, results });
assert.equal(active.status, "watching");
assert.equal(active.healthy, false);
const stuck = evaluate({ now, run: { ...successRun, status: "in_progress", run_started_at: "2026-09-13T21:00:00Z" }, jobs, results });
assert.equal(stuck.status, "error");
const queue = evaluate({ now, run: { ...successRun, status: "queued", created_at: "2026-09-13T23:59:00Z" }, jobs: [], results });
assert.equal(queue.status, "watching");
assert.equal(evaluate({ now, run: successRun, jobs: [], results }).healthy, false);
const later = evaluate({ now: new Date(now.getTime() + 600000), run: failed.run, jobs: cancelledJobs, results });
assert.equal(later.fingerprint, failed.fingerprint, "unchanged conditions have a stable notification key");

function mockGithub(issue) {
  const calls = [];
  const github = { calls, paginate: async () => issue ? [issue] : [], rest: { issues: {
    listForRepo: () => {},
    create: async args => calls.push(["create", args]),
    createComment: async args => calls.push(["comment", args]),
    update: async args => calls.push(["update", args]),
    listComments: async args => { calls.push(["readComments", args]); return { data: [{ body: issue.lastComment || "old" }] }; }
  } } };
  return github;
}
async function main() {
  const runSync = (github, report) => syncIssue({ github, owner: "example", repo: "repo", report });
  let github = mockGithub();
  assert.equal(await runSync(github, failed), "created");
  assert.equal(github.calls[0][1].title, ISSUE_TITLE);
  github = mockGithub({ number: 932, title: ISSUE_TITLE, comments: 0, body: render(failed) });
  assert.equal(await runSync(github, failed), "unchanged");
  assert.deepEqual(github.calls, []);
  github = mockGithub({ number: 932, title: ISSUE_TITLE, comments: 101, lastComment: render(failed) });
  assert.equal(await runSync(github, failed), "unchanged");
  assert.equal(github.calls[0][1].page, 2);
  github = mockGithub({ number: 932, title: ISSUE_TITLE, comments: 0, body: "legacy alert" });
  assert.equal(await runSync(github, failed), "commented");
  assert.equal(github.calls[0][1].issue_number, 932);
  github = mockGithub({ number: 932, title: ISSUE_TITLE });
  assert.equal(await runSync(github, active), "waiting");
  assert.deepEqual(github.calls, []);
  assert.equal(await runSync(github, healthy), "closed");
  assert.deepEqual(github.calls.map(x => x[0]), ["comment", "update"]);
  assert.equal(github.calls[1][1].state, "closed");
  assert.equal(await runSync(mockGithub(), healthy), "healthy");

  // End-to-end adapter test: a delayed old event must use current run/main data.
  github = mockGithub();
  const core = { info: () => {}, setFailed: msg => { throw new Error(msg); },
    summary: { addHeading() { return this; }, addRaw() { return this; }, async write() {} } };
  github.rest.repos = {
    getBranch: async () => ({ data: { commit: { sha: "current-main" } } }),
    getContent: async args => {
      assert.equal(args.ref, "current-main");
      const date = args.path.match(/(\d{8})\.json$/)[1];
      return { data: { encoding: "base64", content: Buffer.from(JSON.stringify(results[date])).toString("base64") } };
    }
  };
  github.rest.actions = {
    listWorkflowRuns: async () => ({ data: { workflow_runs: [
      { ...successRun, id: 200, head_branch: "other-branch" }, successRun,
      { ...successRun, id: 99, created_at: "2026-09-12T17:00:00Z", conclusion: "cancelled" }
    ] } }),
    listJobsForWorkflowRun: () => {}
  };
  github.paginate = async (method, args) => {
    if (method === github.rest.actions.listJobsForWorkflowRun) { assert.equal(args.run_id, 100); return jobs; }
    return [];
  };
  const context = { repo: { owner: "example", repo: "repo" }, payload: { workflow_run: { id: 99 } } };
  assert.equal((await runWatchdog({ github, context, core, now })).healthy, true);
  github.rest.repos.getContent = async () => { throw Object.assign(new Error("API unavailable"), { status: 503 }); };
  await assert.rejects(runWatchdog({ github, context, core, now }), /API unavailable/);
  assert.deepEqual(github.calls, [], "an API error cannot close or create an issue");

  // Central workflow checkpoint: no parallel writers or dependence on a dirty workspace.
  const workflow = fs.readFileSync(".github/workflows/collect-results.yml", "utf8");
  assert.match(workflow, /group: chappy-main-data-writers\n\s+queue: max\n\s+cancel-in-progress: false/);
  assert.match(workflow, /calibrate:\n\s+needs: collect/);
  assert.match(workflow, /saved_sha: \$\{\{ steps\.save_results\.outputs\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ needs\.collect\.outputs\.saved_sha \}\}/);
  assert.ok(workflow.indexOf('echo "sha=$(git rev-parse HEAD)"') > workflow.indexOf("git push origin main"));
  assert.match(workflow, /run: git checkout -B main/);
  assert.equal((workflow.match(/node scripts\/test-load-performance\.js/g) || []).length, 2,
    "only the two changed artifact generations need the expensive consistency check");
  const watchdog = fs.readFileSync(".github/workflows/result-collection-watchdog.yml", "utf8");
  assert.match(watchdog, /schedule:/);
  assert.match(watchdog, /actions: read/);
  assert.match(watchdog, /issues: write/);
  assert.match(watchdog, /branches: \[main\]/);
  assert.match(watchdog, /cancel-in-progress: false/);
  assert.ok(!watchdog.includes("contents: write"));
  console.log("result collection watchdog: state, completeness, retry, issue lifecycle and checkpoint tests passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
