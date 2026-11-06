'use strict';
// Publish data/stats/race-insight-report.json through the same single-file,
// rebuild-on-contention transport as the continuous performance ledger.
const fs = require('node:fs');
const { persist, writeReportCommit } = require('./persist-continuous-performance-ledger.cjs');

const OUTPUT = 'data/stats/race-insight-report.json';
const BUILDER = 'scripts/build-race-insight-report.cjs';

function isInsightReport(report) {
  return report.schemaVersion === 1 && report.analysisId === 'race-insight-report-v1' &&
    report.usableForPrediction === false && report.productionChanged === false &&
    Number.isInteger(report.sourceCohort?.analyzedRaces) && report.sourceCohort.analyzedRaces > 0 &&
    Boolean(report.roughness?.holdoutWindow) && Array.isArray(report.tilt?.byCourse) && Array.isArray(report.venue?.byVenue);
}

function persistInsight(options = {}) {
  return persist({ ...options, output: OUTPUT, builder: BUILDER, nodeArgs: ['--max-old-space-size=8192'],
    isValid: isInsightReport, message: 'Update race insight report' });
}

if (require.main === module) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/main') {
      throw new Error('insight-publication-main-only');
    }
    const result = persistInsight();
    writeReportCommit(result, process.env.GITHUB_OUTPUT);
    console.log(JSON.stringify({ status: result.status, attempts: result.attempts, publishedCommit: result.publishedCommit }));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { OUTPUT, BUILDER, isInsightReport, persistInsight };
