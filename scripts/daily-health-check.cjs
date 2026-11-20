#!/usr/bin/env node
'use strict';

// 毎日の健康チェック（チャッピー・boatrace-ev）
// 以前は Claude の予約タスクで行っていた確認を、GitHub Actions だけで行う。
// 読み取りのみ。異常があれば専用の Issue を 1 つだけ開いて（または追記して）知らせる。

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const CHAPPY = process.env.CHAPPY_REPO || 'takechanman12250711-oss/chappy-boatrace-ai';
const EV = process.env.EV_REPO || 'takechanman12250711-oss/boatrace-ev';
const ISSUE_TITLE = '🩺 毎日の健康チェック：異常あり';
const HOUR = 3600 * 1000;

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function ghJson(path) {
  return JSON.parse(gh(['api', path]));
}

function jstDate(now) {
  const d = new Date(now.getTime() + 9 * HOUR);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
// 確認する「レースの日」。GitHub の予約実行は数時間遅れることがあり、
// 日付が変わった深夜（日本時間 0〜7 時台）に動くと、まだ作られるはずのない翌日の
// ファイルを「無い」と誤って知らせてしまう。朝 8 時より前は前日を確認する。
const RACE_DAY_START_HOUR_JST = 8;
function raceDayJst(now) {
  const jstHour = new Date(now.getTime() + 9 * HOUR).getUTCHours();
  return jstHour < RACE_DAY_START_HOUR_JST ? jstDate(new Date(now.getTime() - 24 * HOUR)) : jstDate(now);
}
function jstTime(iso) {
  if (!iso) return '不明';
  const d = new Date(new Date(iso).getTime() + 9 * HOUR);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ---- 判定（テストしやすいよう純粋関数にしている） ----

// 「直近 hours 時間に1回以上成功」かつ「最後に終わった実行が失敗でない」なら正常。
// 取り消し（cancelled）は新しい実行に置き換わっただけのことが多いので失敗扱いしない。
function judgeRegular(label, runs, now, hours, impact) {
  const since = now.getTime() - hours * HOUR;
  const recent = runs.filter((r) => new Date(r.created_at).getTime() >= since);
  const done = recent.filter((r) => r.status === 'completed' && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const successes = done.filter((r) => r.conclusion === 'success');
  const latest = done[0];
  const lastSuccess = runs.find((r) => r.conclusion === 'success');
  if (recent.length === 0) {
    return { label, ok: false, text: `直近${hours}時間に1回も動いていません（最後の成功：${jstTime(lastSuccess && lastSuccess.created_at)}）。${impact}` };
  }
  if (successes.length === 0) {
    const inProgress = recent.some((r) => r.status !== 'completed');
    if (inProgress && done.length === 0) return { label, ok: true, text: '実行中' };
    return { label, ok: false, text: `直近${hours}時間に成功が0回です（最後の成功：${jstTime(lastSuccess && lastSuccess.created_at)}）。${impact}` };
  }
  if (latest && latest.conclusion !== 'success') {
    let streak = 0;
    for (const r of done) { if (r.conclusion === 'success') break; streak += 1; }
    if (streak >= 2) {
      return { label, ok: false, text: `最新の実行が${streak}回続けて失敗しています（${jstTime(latest.created_at)}〜）。${impact}`, runUrl: latest.html_url };
    }
    return { label, ok: true, text: `正常（最新の1回だけ失敗：${jstTime(latest.created_at)}。次の実行で様子を見ます）` };
  }
  return { label, ok: true, text: `正常（成功${successes.length}回、最新 ${jstTime(successes[0].created_at)}）` };
}

// 手動で動かすもの：直近 hours 時間に失敗で終わったものがあれば異常
function judgeManual(label, runs, now, hours) {
  const since = now.getTime() - hours * HOUR;
  const failed = runs.filter((r) => new Date(r.created_at).getTime() >= since && r.status === 'completed' && r.conclusion === 'failure');
  if (failed.length === 0) return { label, ok: true, text: '失敗なし' };
  return { label, ok: false, text: `${failed.length}回失敗しています（最新 ${jstTime(failed[0].created_at)}）`, runUrl: failed[0].html_url };
}

// 試運転リレー：実行中、または hours 時間以内に動いていれば正常
function judgeRelay(label, runs, now, hours) {
  if (runs.some((r) => r.status !== 'completed')) return { label, ok: true, text: '実行中' };
  const last = runs[0];
  if (last && now.getTime() - new Date(last.created_at).getTime() <= hours * HOUR) {
    return { label, ok: true, text: `正常（最新 ${jstTime(last.created_at)}）` };
  }
  return {
    label,
    ok: false,
    text: `${hours}時間以上止まっています（最後：${jstTime(last && last.created_at)}）。GitHub の boatrace-ev の Actions タブで「live predict」を選び「Run workflow」を押すと再開できます。`,
  };
}

// note公開（NOTE_UI_TRANSPORT_FAILED=）と note記事の更新（NOTE_MARKETING_FAILED=）の
// 両方のエラー名を拾う。複数あれば最後（いちばん新しい）ものを使う。
function findNoteError(log) {
  const all = [...String(log || '').matchAll(/NOTE_(?:UI_TRANSPORT|MARKETING)_FAILED=([^\s"'`]+)/g)];
  return all.length ? all[all.length - 1][1] : '';
}

// よく出るエラー名に、本人向けのやさしい説明を添える（分かるものだけ。推測は推測と書く）。
function explainNoteError(code) {
  const c = String(code || '');
  if (/^browser_use_create_failed_402/.test(c)) {
    return 'ブラウザ操作サービス（Browser Use）の利用枠や残高が足りない可能性があります（推測）。サービスの管理画面で残りを確認してください';
  }
  if (/^browser_use_create_failed_(401|403)/.test(c)) {
    return 'ブラウザ操作サービス（Browser Use）の鍵（APIキー）が使えなくなっている可能性があります（推測）';
  }
  if (/^browser_use_create_failed_429/.test(c)) {
    return 'ブラウザ操作サービス（Browser Use）の回数制限にかかった可能性があります（推測）。時間をおけば戻ることがあります';
  }
  return '';
}

function buildReport(results, now) {
  const bad = results.filter((r) => !r.ok);
  const lines = [];
  lines.push(`## 毎日の健康チェック（${jstTime(now.toISOString())} 日本時間）`);
  lines.push('');
  lines.push(bad.length === 0 ? '**異常なし** ✅' : `**異常 ${bad.length}件** ⚠️`);
  lines.push('');
  lines.push('| 確認したもの | 結果 |');
  lines.push('|---|---|');
  for (const r of results) {
    const mark = r.ok ? '✅' : '⚠️';
    const link = r.runUrl ? ` [記録](${r.runUrl})` : '';
    lines.push(`| ${r.label} | ${mark} ${String(r.text).replace(/\|/g, '｜')}${link} |`);
  }
  lines.push('');
  lines.push('※ 読み取りのみの確認です。自動で直したり、作業を動かし直したりはしません。');
  return { ok: bad.length === 0, markdown: lines.join('\n') };
}

// ---- 実際の確認 ----

function runsOf(repo, workflowName, perPage = 100) {
  const data = ghJson(`repos/${repo}/actions/runs?per_page=${perPage}`);
  return data.workflow_runs.filter((r) => r.name === workflowName);
}

function safe(label, fn) {
  try {
    return fn();
  } catch (e) {
    return { label, ok: false, text: `要確認（確認できませんでした：${String(e.message || e).split('\n')[0].slice(0, 120)}）` };
  }
}

function collect(now) {
  const results = [];
  // チャッピーは実行数が多いので、名前ごとに workflow ファイルを指定して取る
  const chappyRuns = (file) => ghJson(`repos/${CHAPPY}/actions/workflows/${file}/runs?per_page=50`).workflow_runs;

  results.push(safe('チャッピー：予想の収集', () =>
    judgeRegular('チャッピー：予想の収集', chappyRuns('collect-predictions.yml'), now, 24, '予想が更新されていない可能性があります。')));
  results.push(safe('チャッピー：結果の収集', () =>
    judgeRegular('チャッピー：結果の収集', chappyRuns('collect-results.yml'), now, 24, '的中・回収率の記録が止まっている可能性があります。')));
  results.push(safe('チャッピー：公開ページの反映', () => {
    // 公開の仕組みは Pages の Source で決まる。「GitHub Actions」なら deploy-pages.yml、
    // それ以外（ブランチ公開）なら pages build and deployment を見る。
    let source = '';
    try { source = String(gh(['api', `repos/${CHAPPY}/pages`, '--jq', '.build_type'])).trim(); } catch (_) { source = ''; }
    const runs = source === 'workflow'
      ? chappyRuns('deploy-pages.yml').filter((r) => r.event !== 'pull_request')
      : ghJson(`repos/${CHAPPY}/actions/runs?per_page=100&event=dynamic`).workflow_runs
        .filter((r) => r.name === 'pages build and deployment');
    return judgeRegular('チャッピー：公開ページの反映', runs, now, 24, '予想がアプリに出ていない可能性があります。');
  }));
  for (const [file, label] of [
    ['note-github-ui-transport.yml', 'チャッピー：note公開'],
    ['update-note-marketing.yml', 'チャッピー：note記事の更新'],
  ]) {
    results.push(safe(label, () => {
      const runs = chappyRuns(file);
      const r = judgeRegular(label, runs, now, 24, '今日のnote記事が出ていない可能性があります。');
      if (!r.ok) {
        const failed = runs.find((x) => x.conclusion === 'failure');
        if (failed) {
          try {
            const code = findNoteError(gh(['run', 'view', String(failed.id), '--repo', CHAPPY, '--log-failed']));
            if (code) {
              const hint = explainNoteError(code);
              r.text += `（エラー名：${code}${hint ? `。${hint}` : ''}）`;
            }
          } catch (_) { /* ログが読めなくても判定は続ける */ }
        }
      }
      return r;
    }));
  }
  results.push(safe('チャッピー：見張り役のIssue', () => {
    const issues = ghJson(`repos/${CHAPPY}/issues?state=open&per_page=50`)
      .filter((i) => !i.pull_request && i.title !== ISSUE_TITLE && i.user && i.user.login === 'github-actions[bot]');
    if (issues.length === 0) return { label: 'チャッピー：見張り役のIssue', ok: true, text: '開いているものなし' };
    return {
      label: 'チャッピー：見張り役のIssue',
      ok: false,
      text: `開いたままのものが${issues.length}件：` + issues.slice(0, 3).map((i) => `#${i.number} ${i.title}`).join('、'),
    };
  }));

  const evRuns = (file) => ghJson(`repos/${EV}/actions/workflows/${file}/runs?per_page=30`).workflow_runs;
  results.push(safe('boatrace-ev：試運転リレー（live predict）', () =>
    judgeRelay('boatrace-ev：試運転リレー（live predict）', evRuns('live.yml'), now, 6)));
  results.push(safe('boatrace-ev：夜の処理（nightly）', () =>
    judgeRegular('boatrace-ev：夜の処理（nightly）', evRuns('nightly.yml'), now, 26, '成績の集計が止まっている可能性があります。')));
  results.push(safe('boatrace-ev：今日のデータ', () => {
    const day = raceDayJst(now);
    const isToday = day === jstDate(now);
    const commits = ghJson(`repos/${EV}/commits?path=docs/data/${day}.json&per_page=1`);
    if (commits.length === 0) {
      const when = isToday ? '今日' : 'その日（前日分）';
      return { label: 'boatrace-ev：今日のデータ', ok: false, text: `docs/data/${day}.json が${when}まだ作られていません。表示画面に予想が出ていない可能性があります。` };
    }
    return { label: 'boatrace-ev：今日のデータ', ok: true, text: `更新あり（${jstTime(commits[0].commit.committer.date)}）` };
  }));
  for (const [file, label] of [
    ['export-picks.yml', 'boatrace-ev：手動の書き出し（export）'],
    ['setup.yml', 'boatrace-ev：手動の準備（setup）'],
    ['backfill-odds.yml', 'boatrace-ev：手動のオッズ補完'],
  ]) {
    results.push(safe(label, () => judgeManual(label, evRuns(file), now, 24)));
  }
  return results;
}

function notify(report) {
  const found = ghJson(`repos/${CHAPPY}/issues?state=open&per_page=100`)
    .filter((i) => !i.pull_request && i.title === ISSUE_TITLE);
  const bodyFile = 'health-report.md';
  fs.writeFileSync(bodyFile, report.markdown);
  if (!report.ok) {
    if (found.length > 0) {
      gh(['issue', 'comment', String(found[0].number), '--repo', CHAPPY, '--body-file', bodyFile]);
      console.log(`既存の Issue #${found[0].number} に追記しました`);
    } else {
      gh(['issue', 'create', '--repo', CHAPPY, '--title', ISSUE_TITLE, '--body-file', bodyFile]);
      console.log('Issue を作成しました');
    }
  } else if (found.length > 0) {
    fs.writeFileSync(bodyFile, `${report.markdown}\n\nすべて元に戻ったので、この Issue を閉じます。`);
    gh(['issue', 'comment', String(found[0].number), '--repo', CHAPPY, '--body-file', bodyFile]);
    gh(['issue', 'close', String(found[0].number), '--repo', CHAPPY]);
    console.log(`回復したので Issue #${found[0].number} を閉じました`);
  }
}

function main() {
  const now = new Date();
  const results = collect(now);
  const report = buildReport(results, now);
  console.log(report.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.markdown + '\n');
  if (process.env.HEALTH_CHECK_NOTIFY === '1') notify(report);
}

if (require.main === module) main();

module.exports = { judgeRegular, judgeManual, judgeRelay, findNoteError, explainNoteError, buildReport, jstDate, raceDayJst, ISSUE_TITLE };
