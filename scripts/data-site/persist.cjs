'use strict';
// ボートデータ帳のデータを main に1ファイルずつ保存する（ledger と同じ再構築・競合時再試行の仕組み）。
//   node scripts/data-site/persist.cjs day     … 今日の出走表・見どころ・モーター順位
//   node scripts/data-site/persist.cjs venues  … 24場の特徴（過去3年）
//   node scripts/data-site/persist.cjs before  … 締切が近いレースの直前情報（日中20分ごと）
//   node scripts/data-site/persist.cjs checks  … 朝の見立ての答え合わせ（毎晩）
const fs = require('node:fs');
const path = require('node:path');
const { persist, writeReportCommit } = require('../persist-continuous-performance-ledger.cjs');
const day = require('./collect-day.cjs');
const venues = require('./build-venues.cjs');
const checks = require('./build-checks.cjs');
const before = require('./collect-before.cjs');

function target(kind, date) {
  if (kind === 'day') {
    return { output: day.outputPath(date), builder: 'scripts/data-site/collect-day.cjs',
      isValid: report => day.isDayFile(report) && report.date === date, message: `Update boat data day ${date}` };
  }
  if (kind === 'venues') {
    return { output: venues.OUTPUT, builder: 'scripts/data-site/build-venues.cjs',
      isValid: venues.isVenuesFile, message: 'Update boat data venues' };
  }
  if (kind === 'before') {
    return { output: before.outputPath(date), builder: 'scripts/data-site/collect-before.cjs',
      isValid: report => before.isBeforeFile(report) && report.date === date, message: `Update boat data pre-race ${date}` };
  }
  if (kind === 'checks') {
    return { output: checks.OUTPUT, builder: 'scripts/data-site/build-checks.cjs',
      isValid: checks.isChecksFile, message: 'Update boat data checks' };
  }
  throw new Error('usage: persist.cjs day|venues|before|checks');
}

if (require.main === module) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('main-only');
    const date = process.env.BOAT_DATA_DATE || day.jstDate();
    process.env.BOAT_DATA_DATE = date; // the builder child process reads the same date
    const t = target(process.argv[2], date);
    let result;
    try {
      result = persist({ ...t, nodeArgs: ['--max-old-space-size=4096'] });
    } catch (error) {
      // 直前情報は「まだ展示前」「新しい分なし」のとき何も書かない。失敗ではなく見送り。
      if (process.argv[2] === 'before' && error.message === 'invalid-ledger-output') {
        console.log(JSON.stringify({ kind: 'before', date, status: 'nothing-new' }));
        return;
      }
      throw error;
    }
    writeReportCommit(result, process.env.GITHUB_OUTPUT);
    console.log(JSON.stringify({ kind: process.argv[2], date, status: result.status, publishedCommit: result.publishedCommit }));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { target };
