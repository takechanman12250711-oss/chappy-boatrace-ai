'use strict';

const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');
const inputContract = require('./analysis-input-contract');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'data', 'results');
const ATTACK_METHODS = new Set(['まくり', 'まくり差し']);
const SIGNALS = ['st', 'exhibition', 'raceFlow', 'roleAttack', 'local', 'motor', 'national', 'turn'];

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function actualStart(result, boatNo) {
  const start = (Array.isArray(result?.starts) ? result.starts : [])
    .find(item => Number(item?.boat) === Number(boatNo));
  const st = Number(start?.st);
  return Number.isFinite(st) ? st : null;
}

function buildReport(options = {}) {
  const { analysisConfig, weightConfig, settled } = missReport.loadDiscovery(options);
  const baseline = scoreAb.baselineProfile(weightConfig);
  const results = inputContract.collectOfficialResults(
    options.resultsDir || RESULTS_DIR,
    new Set(settled.rows.map(row => row.raceKey))
  );
  const rows = [];

  for (const row of settled.rows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const top = ranked[0];
    const winner = ranked.find(item => item.boatNo === row.winnerBoatNo);
    if (!winner || top.boatNo !== 1 || ![3, 4].includes(winner.boatNo)) continue;

    const diffs = Object.fromEntries(scoreAb.COMPONENT_ORDER.map(key => [
      key,
      Number(((winner.components[key] - top.components[key]) * baseline.weights[key]).toFixed(9)),
    ]));
    const strongestTopKey = Object.entries(diffs)
      .sort((left, right) => left[1] - right[1])[0]?.[0];
    if (strongestTopKey !== 'courseIndex') continue;

    const officialResult = results.get(row.raceKey);
    const winningMethod = inputContract.winningMethod(officialResult);
    if (!ATTACK_METHODS.has(winningMethod)) continue;

    const predictedActualSt = actualStart(officialResult, 1);
    const winnerActualSt = actualStart(officialResult, winner.boatNo);
    const actualStDelta = predictedActualSt !== null && winnerActualSt !== null
      ? Number((winnerActualSt - predictedActualSt).toFixed(3))
      : null;

    rows.push({
      raceKey: row.raceKey,
      winnerBoat: winner.boatNo,
      path: `1->${winner.boatNo}`,
      winningMethod,
      actualStDelta,
      winnerActuallyFasterStart: actualStDelta !== null ? actualStDelta < 0 : null,
      preRaceWeightedAdvantages: Object.fromEntries(
        SIGNALS.map(key => [key, Number((diffs[key] || 0).toFixed(9))])
      ),
      courseWeightedDisadvantage: Number((-(diffs.courseIndex || 0)).toFixed(9)),
    });
  }

  const signalSummary = Object.fromEntries(SIGNALS.map(key => {
    const values = rows.map(row => row.preRaceWeightedAdvantages[key]);
    const positive = values.filter(value => value > 1e-12);
    return [key, {
      positiveCount: positive.length,
      positiveRate: rows.length ? Number((positive.length / rows.length).toFixed(4)) : 0,
      meanWeightedAdvantage: Number((mean(values) || 0).toFixed(6)),
      medianWeightedAdvantage: Number((median(values) || 0).toFixed(6)),
    }];
  }));

  const fasterStartRows = rows.filter(row => row.winnerActuallyFasterStart === true);
  const pathMethod = {};
  for (const row of rows) {
    const key = `${row.path}|${row.winningMethod}`;
    pathMethod[key] = (pathMethod[key] || 0) + 1;
  }

  return {
    schemaVersion: 1,
    analysisId: 'inner-upset-prerace-signals-v1',
    sourceAnalysisId: analysisConfig.analysisId,
    scope: {
      dataset: 'discovery-only',
      holdoutUsed: false,
      productionChanged: false,
      outcomeLabelsOnly: ['winnerBoat', 'winningMethod', 'actualStDelta'],
      runtimeCandidateInputs: SIGNALS,
      target: 'courseIndex-attributed misses where predicted boat=1, winner=3/4, official method=makuri/makuri-sashi',
    },
    total: rows.length,
    byPathMethod: Object.entries(pathMethod)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'ja')),
    actualSt: {
      winnerFasterCount: fasterStartRows.length,
      winnerFasterRate: rows.length ? Number((fasterStartRows.length / rows.length).toFixed(4)) : 0,
      meanDelta: Number((mean(rows.map(row => row.actualStDelta)) || 0).toFixed(4)),
      medianDelta: Number((median(rows.map(row => row.actualStDelta)) || 0).toFixed(4)),
    },
    signalSummary,
    rows,
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(buildReport(), null, 2)}\n`);
}

module.exports = { ATTACK_METHODS, SIGNALS, actualStart, buildReport, mean, median };
