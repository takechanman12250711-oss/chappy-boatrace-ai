#!/usr/bin/env node
'use strict';

// 週次集計（チャッピー成績・3割案の前向き比較・boatrace-ev 試運転成績）
// 以前は Claude の週次タスクで毎回計算していたものを、GitHub Actions で先に計算しておく。
// 読み取りと集計のみ。本番の予想・記事・設定は変えない。
// 結果は「📊 週次集計（自動）」Issue にコメントとして残し、Claude はそれを読んでまとめるだけにする。

const fs = require('node:fs');
const path = require('node:path');

const HOUR = 3600 * 1000;
const EV_START = '20261028';
const ISSUE_TITLE = '📊 週次集計（自動）';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 直前の月曜〜日曜（日本時間）。月曜に動けば「先週」になる。
function lastWeek(now) {
  const jst = new Date(now.getTime() + 9 * HOUR);
  const dow = (jst.getUTCDay() + 6) % 7; // 月曜=0
  const thisMonday = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - dow));
  const from = new Date(thisMonday.getTime() - 7 * 24 * HOUR);
  const to = new Date(thisMonday.getTime() - 24 * HOUR);
  return { from: ymd(from), to: ymd(to) };
}

function datesBetween(from, to) {
  const out = [];
  const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)));
  for (;;) {
    const s = ymd(d);
    if (s > to) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

// 再現できるよう、種を固定した乱数で 2000 回ブートストラップ
function bootstrapRoi(items, times = 2000, seed = 20261028) {
  if (items.length < 2) return null;
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rois = [];
  for (let k = 0; k < times; k += 1) {
    let st = 0;
    let rt = 0;
    for (let j = 0; j < items.length; j += 1) {
      const it = items[Math.floor(rand() * items.length)];
      st += it.stake;
      rt += it.ret;
    }
    rois.push(st ? (rt / st) * 100 : 0);
  }
  rois.sort((a, b) => a - b);
  const at = (q) => Math.round(rois[Math.floor(q * (rois.length - 1))] * 10) / 10;
  return [at(0.025), at(0.975)];
}

// ---- boatrace-ev ----

function evDay(dir, date) {
  const file = path.join(dir, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const races = Array.isArray(data.races) ? data.races : Object.values(data.races || {});
  return races.filter((r) => r && typeof r === 'object');
}

function evSummary(dir, dates) {
  const groups = { 本線: [], 中穴: [], 大穴: [] };
  let filesFound = 0;
  let predictedRaces = 0;
  let pendingRaces = 0;
  for (const date of dates) {
    const races = evDay(dir, date);
    if (!races) continue;
    filesFound += 1;
    for (const race of races) {
      const hasPick = (race.picks && race.picks.length) || (race.romans && Object.keys(race.romans).length);
      if (!hasPick) continue;
      predictedRaces += 1;
      const res = race.result;
      if (!res) { pendingRaces += 1; continue; }
      if (race.picks && race.picks.length && res.stake > 0) groups.本線.push({ stake: res.stake, ret: res.return || 0 });
      for (const name of ['中穴', '大穴']) {
        const r = res.romans && res.romans[name];
        if (r && r.stake > 0) groups[name].push({ stake: r.stake, ret: r.return || 0 });
      }
    }
  }
  const out = { days: dates.length, filesFound, predictedRaces, pendingRaces };
  for (const [name, items] of Object.entries(groups)) {
    const stake = items.reduce((a, b) => a + b.stake, 0);
    const ret = items.reduce((a, b) => a + b.ret, 0);
    const hits = items.filter((x) => x.ret > 0).length;
    out[name] = {
      races: items.length,
      stakeYen: stake,
      returnYen: ret,
      roi: pct(ret, stake),
      hits,
      avgPayoutYen: hits ? Math.round(ret / hits) : null,
    };
    if (name === '本線') out[name].roiCi95 = bootstrapRoi(items);
  }
  return out;
}

// ---- チャッピー（連続成績記録） ----

function ledgerSummary(ledger, from, to) {
  const rows = (ledger.rows || []).filter((r) => {
    const d = String(r.raceKey || '').slice(0, 8);
    return d >= from && d <= to;
  });
  const stake = rows.reduce((a, r) => a + (r.stakeYen || 0), 0);
  const ret = rows.reduce((a, r) => a + (r.returnYen || 0), 0);
  const hits = rows.filter((r) => r.hit).length;
  return {
    races: rows.length,
    hits,
    hitRate: pct(hits, rows.length),
    stakeYen: stake,
    returnYen: ret,
    profitYen: ret - stake,
    roi: pct(ret, stake),
  };
}

// ---- 報告 ----

const yen = (n) => (n === null || n === undefined ? '要確認' : `${Number(n).toLocaleString('ja-JP')}円`);
const per = (n) => (n === null || n === undefined ? '—' : `${n}%`);
const md = (d) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;

function buildMarkdown(r) {
  const L = [];
  L.push(`## 週次集計：${md(r.week.from)}〜${md(r.week.to)}（自動）`);
  L.push('');
  L.push('### チャッピーの成績（締切前に保存した予想・1点100円）');
  if (r.chappy.error) {
    L.push(`要確認：${r.chappy.error}`);
  } else {
    L.push('| 期間 | レース | 的中 | 的中率 | 購入 | 払戻 | 回収率 |');
    L.push('|---|---|---|---|---|---|---|');
    for (const [label, s] of [['先週', r.chappy.week], ['通算', r.chappy.cumulative]]) {
      L.push(`| ${label} | ${s.races} | ${s.hits} | ${per(s.hitRate)} | ${yen(s.stakeYen)} | ${yen(s.returnYen)} | ${per(s.roi)} |`);
    }
  }
  L.push('');
  L.push('### 2着・3着にデータを3割まぜる案（前向き比較・10/29開始・500レースで区切り）');
  const f = r.holdPickupForward;
  if (!f || f.error) {
    L.push(`要確認：${(f && f.error) || '集計できませんでした'}`);
  } else if (f.status === 'frozen-module-mismatch') {
    L.push('評価コードが変わったため集計停止（frozen-module-mismatch）');
  } else {
    L.push(`状態：${f.status === 'checkpoint-reached' ? '500レース到達' : `途中（${f.period.races}レース、あと${f.period.remainingToCheckpoint}レース）`}`);
    if (f.summary && f.summary.main) {
      L.push('');
      L.push('| 先頭3点 | レース | 的中 | 的中率 | 回収率 |');
      L.push('|---|---|---|---|---|');
      for (const [label, s] of [['現行', f.summary.main.baseline], ['3割案', f.summary.main.data]]) {
        L.push(`| ${label} | ${s.races} | ${s.hits} | ${per(s.hitRate)} | ${per(s.roi)} |`);
      }
      const ci = f.summary.main.roiDiffCi95;
      L.push('');
      L.push(`回収率の差（3割案−現行）：${f.summary.main.roiDiff ?? '—'}ポイント${Array.isArray(ci) ? `（95%区間 ${ci[0]}〜${ci[1]}）` : ''}`);
    }
    if (f.status !== 'checkpoint-reached') L.push('※ 500レース未満なので、まだ結論は出しません。');
  }
  L.push('');
  L.push('### boatrace-ev 試運転（お金は賭けず1点100円で記録）');
  const e = r.boatraceEv;
  if (e.error) {
    L.push(`要確認：${e.error}`);
  } else {
    for (const [label, s] of [['先週', e.week], ['通算（10/28〜）', e.cumulative]]) {
      L.push('');
      L.push(`**${label}**（予想したレース ${s.predictedRaces}、結果待ち ${s.pendingRaces}）`);
      L.push('');
      L.push('| 枠 | レース | 購入 | 払戻 | 回収率 | 的中 | 平均配当 |');
      L.push('|---|---|---|---|---|---|---|');
      for (const name of ['本線', '中穴', '大穴']) {
        const g = s[name];
        L.push(`| ${name} | ${g.races} | ${yen(g.stakeYen)} | ${yen(g.returnYen)} | ${per(g.roi)} | ${g.hits} | ${g.avgPayoutYen ? yen(g.avgPayoutYen) : '—'} |`);
      }
      const ci = s.本線.roiCi95;
      if (ci) L.push(`\n本線の回収率の95%区間：${ci[0]}〜${ci[1]}%`);
    }
    L.push('');
    L.push(`リレーの記録：対象${e.week.days}日のうち ${e.week.filesFound}日分のデータあり${e.week.filesFound < e.week.days ? '（欠けている日あり・要確認）' : '（毎日動いていました）'}`);
    L.push('');
    L.push('目安：バックテストでは本線119%（95%区間85〜155%）、中穴84%、大穴72%。的中が少ないうちは判断できません。');
  }
  L.push('');
  L.push('※ 集計のみの自動処理です。本番の予想・記事・設定は変えていません。予想は参考情報です。');
  return L.join('\n');
}

function main() {
  const now = new Date(arg('--now', new Date().toISOString()));
  const week = lastWeek(now);
  const report = { generatedAt: now.toISOString(), week };

  try {
    const ledger = JSON.parse(fs.readFileSync(arg('--ledger', 'data/stats/continuous-performance-ledger.json'), 'utf8'));
    report.chappy = {
      ledgerGeneratedAt: ledger.generatedAt,
      week: ledgerSummary(ledger, week.from, week.to),
      cumulative: ledgerSummary(ledger, '00000000', week.to),
    };
  } catch (err) {
    report.chappy = { error: String(err.message || err).slice(0, 200) };
  }

  try {
    const f = JSON.parse(fs.readFileSync(arg('--forward', 'data/analysis/hold-pickup-data-shadow-forward-v1.json'), 'utf8'));
    report.holdPickupForward = { status: f.status, period: f.period, summary: f.summary, generatedAt: f.generatedAt };
  } catch (err) {
    report.holdPickupForward = { error: String(err.message || err).slice(0, 200) };
  }

  try {
    const dir = arg('--ev-dir', 'boatrace-ev/docs/data');
    if (!fs.existsSync(dir)) throw new Error(`${dir} がありません`);
    report.boatraceEv = {
      week: evSummary(dir, datesBetween(week.from > EV_START ? week.from : EV_START, week.to)),
      cumulative: evSummary(dir, datesBetween(EV_START, week.to)),
    };
  } catch (err) {
    report.boatraceEv = { error: String(err.message || err).slice(0, 200) };
  }

  const markdown = buildMarkdown(report);
  const outDir = arg('--out-dir', 'weekly-stats-out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'weekly-stats.json'), `${JSON.stringify(report, null, 2)}\n`);
  // Issue コメントには表と、Claude が読むための JSON を折りたたんで入れる
  fs.writeFileSync(
    path.join(outDir, 'comment.md'),
    `${markdown}\n\n<details><summary>集計データ（JSON）</summary>\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n</details>\n`,
  );
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

if (require.main === module) main();

module.exports = { lastWeek, datesBetween, bootstrapRoi, evSummary, ledgerSummary, buildMarkdown, ISSUE_TITLE };
