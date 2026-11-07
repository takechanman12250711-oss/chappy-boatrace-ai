'use strict';
// ボートデータ帳のデータを main に1ファイルずつ保存する（ledger と同じ再構築・競合時再試行の仕組み）。
//   node scripts/data-site/persist.cjs day     … 今日の出走表・見どころ・モーター順位
//   node scripts/data-site/persist.cjs venues  … 24場の特徴（過去3年）
//   node scripts/data-site/persist.cjs checks  … 朝の見立ての答え合わせ（毎晩）
const fs = require('node:fs');
const path = require('node:path');
const { persist, writeReportCommit } = require('../persist-continuous-performance-ledger.cjs');
const day = require('./collect-day.cjs');
const venues = require('./build-venues.cjs');
const checks = require('./build-checks.cjs');

function target(kind, date) {
  if (kind === 'day') {
    return { output: day.outputPath(date), builder: 'scripts/data-site/collect-day.cjs',
      isValid: report => day.isDayFile(report) && report.date === date, message: `Update boat data day ${date}` };
  }
  if (kind === 'venues') {
    return { output: venues.OUTPUT, builder: 'scripts/data-site/build-venues.cjs',
      isValid: venues.isVenuesFile, message: 'Update boat data venues' };
  }
  if (kind === 'checks') {
    return { output: checks.OUTPUT, builder: 'scripts/data-site/build-checks.cjs',
      isValid: checks.isChecksFile, message: 'Update boat data checks' };
  }
  throw new Error('usage: persist.cjs day|venues|checks');
}

if (require.main === module) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('main-only');
    const date = process.env.BOAT_DATA_DATE || day.jstDate();
    process.env.BOAT_DATA_DATE = date; // the builder child process reads the same date
    const t = target(process.argv[2], date);
    const result = persist({ ...t, nodeArgs: ['--max-old-space-size=4096'] });
    writeReportCommit(result, process.env.GITHUB_OUTPUT);
    console.log(JSON.stringify({ kind: process.argv[2], date, status: result.status, publishedCommit: result.publishedCommit }));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { target };
