'use strict';

const fs = require('node:fs');
const path = require('node:path');
const input = require('./analysis-input-contract.js');

const root = path.resolve(__dirname, '..');
const predictionsDir = path.join(root, 'data', 'predictions');
const statsDir = path.join(root, 'data', 'stats');
const settlementFile = path.join(statsDir, 'outer-attack-ticket-central-settlements-v1.json');

function loadJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; }
}

function countReasons(rows) {
  const counts = {};
  for (const row of rows) {
    const reason = input.preDeadlineReason(row) || 'eligible';
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function predictionRows() {
  if (!fs.existsSync(predictionsDir)) return [];
  const rows = [];
  for (const name of fs.readdirSync(predictionsDir).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    const data = loadJson(path.join(predictionsDir, name), {});
    for (const key of ['predictions', 'verificationPredictions']) {
      for (const record of Array.isArray(data?.[key]) ? data[key] : []) {
        rows.push({ ...record, __sourceFile: name, __sourceKind: key });
      }
    }
  }
  return rows;
}

function main() {
  const rows = predictionRows();
  const settlement = loadJson(settlementFile, {});
  const exclusions = Object.values(settlement?.exclusions || {});
  const output = {
    version: 'outer-attack-validation-pipeline-audit-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    predictionRecordCount: rows.length,
    preDeadlineReasons: countReasons(rows),
    centralSettlementCount: Number(settlement?.settlementCount || Object.keys(settlement?.settlements || {}).length || 0),
    centralExclusionCount: Number(settlement?.exclusionCount || exclusions.length || 0),
    centralExclusionReasons: exclusions.reduce((counts, row) => {
      const reason = String(row?.status || 'unknown');
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {}),
    note: 'This audit diagnoses validation flow only. It does not change prediction logic, tickets, theory weights, UI, or historical evidence.'
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();
