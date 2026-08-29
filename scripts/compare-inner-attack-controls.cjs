'use strict';

const path = require('node:path');
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');
const inputContract = require('./analysis-input-contract');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'data', 'results');
const COMPONENTS = ['st','exhibition','raceFlow','roleAttack','local','motor','national','turn'];
const ATTACK_METHODS = new Set(['まくり','まくり差し']);

function pct(n, d) { return d ? Number(((n / d) * 100).toFixed(1)) : 0; }
function rounded(n, digits = 3) { return Number(Number(n).toFixed(digits)); }

function buildInnerAttackControlComparison(options = {}) {
  const { analysisConfig, weightConfig, settled } = missReport.loadDiscovery(options);
  const baseline = scoreAb.baselineProfile(weightConfig);
  const targetKeys = new Set(settled.rows.map(row => row.raceKey));
  const officialResults = inputContract.collectOfficialResults(options.resultsDir || RESULTS_DIR, targetKeys);
  const positives = [];
  const controls = [];

  for (const row of settled.rows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const top = ranked[0];
    if (top.boatNo !== 1) continue;
    const official = officialResults.get(row.raceKey);
    const method = inputContract.winningMethod(official) || 'unknown';

    for (const challengerNo of [3, 4]) {
      const challenger = ranked.find(item => item.boatNo === challengerNo);
      if (!challenger) continue;
      const contributions = scoreAb.COMPONENT_ORDER.map(key => ({
        key,
        weightedGap: (challenger.components[key] - top.components[key]) * baseline.weights[key],
      }));
      const strongestTop = [...contributions].sort((a, b) => a.weightedGap - b.weightedGap)[0];
      if (strongestTop.key !== 'courseIndex') continue;

      const gaps = Object.fromEntries(COMPONENTS.map(key => [key,
        rounded((challenger.components[key] - top.components[key]) * baseline.weights[key], 9)
      ]));
      const signal = {
        stPositive: gaps.st > 1e-12,
        roleAttackPositive: gaps.roleAttack > 1e-12,
        exhibitionPositive: gaps.exhibition > 1e-12,
        raceFlowSuppressed: gaps.raceFlow <= 1e-12,
        stAndRoleAttack: gaps.st > 1e-12 && gaps.roleAttack > 1e-12,
        attackWhileFlowSuppressed: (gaps.st > 1e-12 || gaps.roleAttack > 1e-12) && gaps.raceFlow <= 1e-12,
        stAndExhibition: gaps.st > 1e-12 && gaps.exhibition > 1e-12,
        tripleAttack: gaps.st > 1e-12 && gaps.roleAttack > 1e-12 && gaps.exhibition > 1e-12,
      };
      const record = { raceKey: row.raceKey, venueCode: String(row.venueCode || row.jcd || '').padStart(2,'0'), challengerBoat: challengerNo, winnerBoat: row.winnerBoatNo, winningMethod: method, gaps, signal };
      if (row.winnerBoatNo === challengerNo && ATTACK_METHODS.has(method)) positives.push(record);
      else if (row.winnerBoatNo === 1) controls.push(record);
    }
  }

  const signalKeys = Object.keys(positives[0]?.signal || {});
  const signals = signalKeys.map(key => {
    const positiveCount = positives.filter(row => row.signal[key]).length;
    const controlCount = controls.filter(row => row.signal[key]).length;
    const positiveRate = positives.length ? positiveCount / positives.length : 0;
    const controlRate = controls.length ? controlCount / controls.length : 0;
    return {
      key,
      positiveCount,
      positiveRatePct: pct(positiveCount, positives.length),
      controlCount,
      controlRatePct: pct(controlCount, controls.length),
      lift: controlRate > 0 ? rounded(positiveRate / controlRate, 3) : null,
      percentagePointGap: rounded((positiveRate - controlRate) * 100, 1),
    };
  }).sort((a,b) => (b.lift ?? Infinity) - (a.lift ?? Infinity) || b.percentagePointGap - a.percentagePointGap);

  const componentMeans = COMPONENTS.map(key => ({
    key,
    positiveMean: rounded(positives.reduce((s,r)=>s+r.gaps[key],0) / positives.length, 9),
    controlMean: rounded(controls.reduce((s,r)=>s+r.gaps[key],0) / controls.length, 9),
  })).map(row => ({...row, meanGapDifference: rounded(row.positiveMean - row.controlMean, 9)}));

  return {
    schemaVersion: 1,
    analysisId: 'inner-attack-control-comparison-v1',
    generatedAt: analysisConfig.createdAt,
    scope: {
      dataset: 'discovery-only', holdoutUsed: false, productionChanged: false,
      unit: 'boat-level challenger (3 or 4) against baseline-predicted boat 1',
      eligibility: 'courseIndex is boat 1 strongest weighted advantage over challenger',
      positive: 'challenger wins by official makuri or makuri-sashi',
      control: 'boat 1 actually wins',
      outcomeLeakageRule: 'winning method and actual winner are labels only; signals use frozen pre-race components only',
    },
    counts: { positives: positives.length, controls: controls.length },
    signals,
    componentMeans,
    positives,
  };
}

function main() { process.stdout.write(`${JSON.stringify(buildInnerAttackControlComparison(), null, 2)}\n`); }
if (require.main === module) main();
module.exports = { buildInnerAttackControlComparison };
