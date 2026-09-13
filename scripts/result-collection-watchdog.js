"use strict";
const { createHash } = require("node:crypto");
const ISSUE_TITLE = "[自動監視] 結果収集workflow異常";
const HOUR = 3600000;
function dateKey(date) { return date.toISOString().slice(0, 10).replaceAll("-", ""); }
// By 06:00 JST yesterday's nightly collection is due, including scheduler grace.
// Before that deadline, today's unrun races and yesterday's retry are not late.
function dueDates(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * HOUR);
  jst.setUTCDate(jst.getUTCDate() - (jst.getUTCHours() < 6 ? 2 : 1));
  const dates = [dateKey(jst)];
  jst.setUTCDate(jst.getUTCDate() - 1);
  return [...dates, dateKey(jst)];
}
function scheduledAfter(date) {
  return Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T14:30:00Z`);
}
function inspectResults(date, data) {
  if (!data) return { date, healthy: false, detail: "公式結果ファイルなし・読取不可" };
  const races = Array.isArray(data.races) ? data.races : [];
  const keys = new Set();
  let completed = 0, voided = 0, failed = 0, pending = 0, invalid = 0;
  for (const race of races) {
    const jcd = Number(race?.jcd), raceNo = Number(race?.raceNo);
    const key = `${jcd}-${raceNo}`;
    if (!Number.isInteger(jcd) || jcd < 1 || jcd > 24 ||
        !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 || keys.has(key)) invalid++;
    keys.add(key);
    if (race?.void === true || race?.status === "void") {
      voided++;
      if (race?.resultAvailable === true) invalid++;
    } else if (race?.resultAvailable === true) {
      completed++;
      const ticket = String(race?.trifecta?.combination || "").split("-");
      if (ticket.length !== 3 || !ticket.every(x => /^[1-6]$/.test(x)) ||
          new Set(ticket).size !== 3 || !(Number(race?.trifecta?.payout) > 0)) invalid++;
    } else if (race?.error) failed++;
    else pending++;
  }
  const count = races.length;
  const healthy = data.source === "boatrace-official" && data.date === date &&
    count > 0 && data.raceCount === count && data.complete === true &&
    data.completedRaces === completed && Number(data.voidRaces || 0) === voided &&
    Number(data.pendingRaces) === pending && Number(data.failedRaces) === failed &&
    completed + voided === count && failed === 0 && pending === 0 && invalid === 0;
  return { date, healthy, count, completed, voided, failed, pending, invalid,
    detail: `${completed + voided}/${count}R保存（不成立${voided}・未確定${pending}・取得失敗${failed}・不正${invalid}）` +
      (healthy ? "" : "／公式結果の完成条件を満たしていません") };
}
function stepState(jobs, name) {
  // Failed-job reruns keep successful jobs from earlier attempts. Select each
  // job's latest execution, rather than discarding those successful checkpoints.
  const latest = new Map();
  for (const [index, job] of jobs.entries()) {
    const key = job.name || `job-${index}`;
    if (!latest.has(key) || Number(job.id || 0) > Number(latest.get(key).id || 0)) latest.set(key, job);
  }
  const steps = [...latest.values()].flatMap(job => job.steps || []).filter(step => step.name === name);
  return steps.at(-1)?.conclusion || steps.at(-1)?.status || "未実行";
}
function evaluate({ now = new Date(), run, jobs = [], results }) {
  const dates = dueDates(now);
  const data = dates.map(date => inspectResults(date, results[date]));
  const problems = data.filter(x => !x.healthy).map(x => `${x.date}: ${x.detail}`);
  const stages = {
    resultSave: stepState(jobs, "Save official results before calibration"),
    calibration: stepState(jobs, "Build prediction calibration"),
    calibrationSave: stepState(jobs, "Save calibration and derived data")
  };
  const active = run && run.status !== "completed";
  if (!run || !(Date.parse(run.created_at) >= scheduledAfter(dates[0])))
    problems.push(`${dates[0]}の夜間収集が期限までに起動していません`);
  if (active) {
    const started = run.status === "in_progress" ? run.run_started_at : run.created_at;
    const limit = run.status === "in_progress" ? 90 * 60000 : 3 * HOUR;
    if (!(Date.parse(started) > now.getTime() - limit)) problems.push("結果収集が長時間実行中・待機中です");
  } else if (run) {
    if (run.conclusion !== "success") problems.push(`結果収集workflow: ${run.conclusion || "不明"}`);
    if (stages.resultSave !== "success") problems.push(`結果保存: ${stages.resultSave}`);
    if (stages.calibration !== "success") problems.push(`校正処理: ${stages.calibration}`);
    if (stages.calibrationSave !== "success") problems.push(`校正・派生データ保存: ${stages.calibrationSave}`);
  }
  // Never close a previous incident while the replacement run is unfinished.
  const healthy = problems.length === 0 && !active;
  const status = problems.length ? "error" : active ? "watching" : "ok";
  const fingerprint = createHash("sha256").update(JSON.stringify({
    runId: run?.id || null, status, problems, stages, data
  })).digest("hex");
  return { healthy, status, problems, stages, data, fingerprint, run };
}
function render(report) {
  return [
    report.healthy ? "✅ 結果保存・校正・派生データ保存の正常完了を確認しました。" : "🚨 結果収集の監視で異常を検知しました。",
    "", `<!-- chappy-result-watchdog:${report.fingerprint} -->`, "",
    `- Run: ${report.run?.html_url || "未起動"}`,
    `- 結果保存: ${report.stages.resultSave}`,
    `- 校正処理: ${report.stages.calibration}`,
    `- 校正・派生データ保存: ${report.stages.calibrationSave}`,
    "", ...report.data.map(x => `- ${x.date}: ${x.detail}`),
    ...(report.problems.length ? ["", "検知内容:", ...report.problems.map(x => `- ${x}`)] : []),
    "", "GitHub Actionsで監視しています。同じ状態の通知は繰り返さず、正常復帰時に自動で閉じます。"
  ].join("\n");
}
async function syncIssue({ github, owner, repo, report }) {
  const open = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: "open", per_page: 100 });
  const issue = open.find(x => !x.pull_request && x.title === ISSUE_TITLE);
  if (report.status === "watching") return "waiting";
  const body = render(report);
  if (report.healthy) {
    if (!issue) return "healthy";
    await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
    await github.rest.issues.update({ owner, repo, issue_number: issue.number, state: "closed", state_reason: "completed" });
    return "closed";
  }
  if (!issue) {
    await github.rest.issues.create({ owner, repo, title: ISSUE_TITLE, body });
    return "created";
  }
  const marker = `<!-- chappy-result-watchdog:${report.fingerprint} -->`;
  let previous = issue.body || "";
  if (issue.comments) {
    const { data: comments } = await github.rest.issues.listComments({ owner, repo,
      issue_number: issue.number, per_page: 100, page: Math.ceil(issue.comments / 100) });
    previous = comments.at(-1)?.body || previous;
  }
  if (previous.includes(marker)) return "unchanged";
  await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body });
  return "commented";
}
async function runWatchdog({ github, context, core, now = new Date() }) {
  const { owner, repo } = context.repo;
  // Read current main/run state: delayed workflow_run events cannot reopen old incidents.
  const { data: runs } = await github.rest.actions.listWorkflowRuns({
    owner, repo, workflow_id: "collect-results.yml", branch: "main", per_page: 20 });
  const run = runs.workflow_runs.filter(x => x.head_branch === "main")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
  const jobs = run ? await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    owner, repo, run_id: run.id, filter: "all", per_page: 100 }) : [];
  const { data: branch } = await github.rest.repos.getBranch({ owner, repo, branch: "main" });
  const ref = branch.commit.sha;
  const results = {};
  for (const date of dueDates(now)) {
    try {
      const { data } = await github.rest.repos.getContent({ owner, repo, ref, path: `data/results/${date}.json` });
      if (!data.content || data.encoding !== "base64") throw new Error(`公式結果を読み取れません: ${date}`);
      try { results[date] = JSON.parse(Buffer.from(data.content, "base64").toString("utf8")); }
      catch { results[date] = null; }
    } catch (error) {
      if (error.status !== 404) throw error; // API failure must never close an incident.
      results[date] = null;
    }
  }
  const report = evaluate({ now, run, jobs, results });
  const action = await syncIssue({ github, owner, repo, report });
  core.info(JSON.stringify({ status: report.status, action, stages: report.stages, data: report.data }));
  await core.summary.addHeading("結果収集監視").addRaw(report.status === "watching"
    ? "結果収集は実行中です。既存の異常Issueは完了確認まで保持します。" : render(report)).write();
  if (report.status === "error") core.setFailed(report.problems.join(" / "));
  return report;
}
module.exports = { ISSUE_TITLE, dueDates, inspectResults, evaluate, render, syncIssue, runWatchdog };
