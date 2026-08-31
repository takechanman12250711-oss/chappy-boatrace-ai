'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const TARGET_HEADS = new Set([4,5,6]);
const SIGNAL_PATTERNS = [
  /attack/i, /wall/i, /collapse/i, /inside/i, /inPower/i,
  /start/i, /^st$/i, /slit/i, /exhibit/i, /tenji/i,
  /turn/i, /local/i, /motor/i, /course/i, /weather/i,
  /wind/i, /wave/i, /flow/i, /scenario/i, /pick/i, /remain/i
];

function walk(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.slice(0, 6).forEach((item, index) => walk(item, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (SIGNAL_PATTERNS.some(re => re.test(key))) out.push({ path: full, valueType: Array.isArray(child) ? 'array' : typeof child });
    if (child && typeof child === 'object') walk(child, full, out);
  }
  return out;
}

function main() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const pathCounts = new Map();
  const outerCandidatePathCounts = new Map();
  let recordsWithOuterCandidate = 0;
  let outerCandidateCount = 0;

  for (const record of cohort.records) {
    const signalPaths = walk(record);
    const unique = new Map(signalPaths.map(row => [row.path, row.valueType]));
    for (const [p, t] of unique) {
      const key = `${p}|${t}`;
      pathCounts.set(key, (pathCounts.get(key) || 0) + 1);
    }

    const pool = base.collectTicketPool(record).slice(7, 24);
    const outer = pool.filter(item => TARGET_HEADS.has(Number(item.head)));
    if (!outer.length) continue;
    recordsWithOuterCandidate += 1;
    outerCandidateCount += outer.length;
    for (const [p, t] of unique) {
      const key = `${p}|${t}`;
      outerCandidatePathCounts.set(key, (outerCandidatePathCounts.get(key) || 0) + 1);
    }
  }

  const top = map => [...map.entries()]
    .map(([key, count]) => {
      const split = key.lastIndexOf('|');
      return { path: key.slice(0, split), valueType: key.slice(split + 1), recordCount: count };
    })
    .sort((a, b) => b.recordCount - a.recordCount || a.path.localeCompare(b.path))
    .slice(0, 150);

  const report = {
    schemaVersion: 1,
    analysisId: 'outer-head-signal-availability-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    purpose: 'Identify which saved pre-race signals are actually available before defining a conditional 4/5/6-head restoration rule.',
    cohort: cohort.diagnostics,
    recordsWithOuterCandidate,
    outerCandidateCount,
    targetHeads: [4,5,6],
    matchingSignalPathsAllRecords: top(pathCounts),
    matchingSignalPathsOuterCandidateRecords: top(outerCandidatePathCounts),
    note: 'This is a schema/availability audit only. No threshold or prediction rule is selected here.'
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) main();
