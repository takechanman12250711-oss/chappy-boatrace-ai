'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const scoreAb = require('../js/effective-score-weight-ab');
const miss = require('./build-effective-score-miss-attribution-report');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_REPORT = path.join(ROOT, 'data', 'stats', 'flow-suppression-report.json');
const OUTPUT = path.join(ROOT, 'data', 'stats', 'st-role-attack-exhibition-holdout-report.json');
const EXPECTED_SOURCE_NEXT_STEP = 'validate-st-role-attack-exhibition-on-untouched-holdout';

const FIXED_RULES = Object.freeze({
  minimumHoldoutRaceCount: 100,
  minimumEligibleCount: 15,
  minimumEligiblePerHalf: 5,
  minimumCandidateWinnerCount: 3,
  minimumNetCorrectGain: 2,
  minimumEligibleAccuracyGainPt: 5,
  maximumOneSidedPValue: 0.2,
  maximumSwitchRate: 20,
  requireBothHalvesNonNegative: true,
  requireZeroDiscoveryOverlap: true
});

const arr = (value) => Array.isArray(value) ? value : [];
const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const rate = (count, total) => total > 0 ? round1(Number(count || 0) / total * 100) : null;
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function raceKey(row = {}) {
  if (row.raceKey) return String(row.raceKey);
  return `${String(row.date || '')}-${String(row.jcd || '').padStart(2, '0')}-${Number(row.raceNo || row.rno || 0)}`;
}

function findRows(node, depth = 0) {
  if (depth > 6 || node == null) return null;
  if (Array.isArray(node)) {
    const usable = node.filter((row) => row && Array.isArray(row.analyses) && numeric(row.winnerBoatNo));
    if (usable.length > 0) return usable;
    for (const value of node) {
      const nested = findRows(value, depth + 1);
      if (nested?.length) return nested;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const preferred = ['settled', 'holdout', 'sealedHoldout', 'validation', 'dataset', 'data', 'rows'];
  for (const key of preferred) {
    if (!(key in node)) continue;
    const nested = findRows(node[key], depth + 1);
    if (nested?.length) return nested;
  }
  for (const value of Object.values(node)) {
    const nested = findRows(value, depth + 1);
    if (nested?.length) return nested;
  }
  return null;
}

function normalizeLoaded(value, fallbackWeightConfig) {
  const rows = findRows(value) || [];
  const weightConfig = value?.weightConfig || value?.weightsConfig || value?.config || fallbackWeightConfig || null;
  return { rows, weightConfig };
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of arr(rows)) {
    const key = raceKey(row);
    if (!key || key === '--0' || !Array.isArray(row?.analyses) || !numeric(row?.winnerBoatNo)) continue;
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()].sort((left, right) => raceKey(left).localeCompare(raceKey(right)));
}

function exportedHoldoutProviders() {
  const modules = [
    ['miss', miss],
    ['scoreAb', scoreAb]
  ];
  const preferredNames = [
    'loadHoldout',
    'loadUntouchedHoldout',
    'loadSealedHoldout',
    'loadValidationHoldout',
    'loadHoldoutDataset',
    'loadValidation'
  ];
  const providers = [];
  for (const [moduleName, moduleValue] of modules) {
    const names = [...new Set([
      ...preferredNames,
      ...Object.keys(moduleValue || {}).filter((name) => /holdout|sealed.*validation|validation.*sealed/i.test(name))
    ])];
    for (const name of names) {
      if (typeof moduleValue?.[name] === 'function') {
        providers.push({ id: `${moduleName}.${name}`, load: () => moduleValue[name]() });
      }
    }
  }
  return providers;
}

function jsonHoldoutProviders() {
  const roots = [path.join(ROOT, 'data'), path.join(ROOT, 'tests', 'fixtures')];
  const files = [];
  function walk(dir, depth = 0) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (
        entry.isFile() &&
        /\.(json)$/i.test(entry.name) &&
        /holdout|sealed|validation/i.test(entry.name) &&
        full !== OUTPUT
      ) {
        const size = fs.statSync(full).size;
        if (size <= 50 * 1024 * 1024) files.push(full);
      }
    }
  }
  roots.forEach((dir) => walk(dir));
  return files.map((file) => ({
    id: `json:${path.relative(ROOT, file)}`,
    load: () => readJson(file)
  }));
}

function fingerprint(rows) {
  return crypto.createHash('sha256').update(rows.map(raceKey).join('\n')).digest('hex');
}

function loadUntouchedHoldout() {
  if (typeof miss.loadDiscovery !== 'function') {
    throw new Error('loadDiscovery is unavailable; fail closed');
  }
  const discoveryLoaded = miss.loadDiscovery();
  const discovery = normalizeLoaded(discoveryLoaded, null);
  const discoveryRows = dedupeRows(discovery.rows);
  const discoveryKeys = new Set(discoveryRows.map(raceKey));
  const providers = [...exportedHoldoutProviders(), ...jsonHoldoutProviders()];
  const attempts = [];
  const candidates = [];

  for (const provider of providers) {
    try {
      const loaded = provider.load();
      const normalized = normalizeLoaded(loaded, discovery.weightConfig);
      const rows = dedupeRows(normalized.rows);
      const overlapCount = rows.filter((row) => discoveryKeys.has(raceKey(row))).length;
      attempts.push({ provider: provider.id, rowCount: rows.length, discoveryOverlapCount: overlapCount });
      if (rows.length > 0 && overlapCount === 0 && normalized.weightConfig) {
        candidates.push({ provider: provider.id, rows, weightConfig: normalized.weightConfig, overlapCount });
      }
    } catch (error) {
      attempts.push({ provider: provider.id, error: String(error?.message || error) });
    }
  }

  candidates.sort((left, right) => right.rows.length - left.rows.length || left.provider.localeCompare(right.provider));
  const selected = candidates[0];
  if (!selected) {
    const error = new Error('No zero-overlap untouched holdout dataset could be resolved');
    error.attempts = attempts;
    throw error;
  }
  return {
    provider: selected.provider,
    rows: selected.rows,
    weightConfig: selected.weightConfig,
    discoveryRaceCount: discoveryRows.length,
    discoveryOverlapCount: selected.overlapCount,
    fingerprint: fingerprint(selected.rows),
    attempts
  };
}

function componentGap(candidate, one, key, baseline) {
  const candidateValue = numeric(candidate?.components?.[key]);
  const oneValue = numeric(one?.components?.[key]);
  const weight = numeric(baseline?.weights?.[key]);
  if (candidateValue == null || oneValue == null || weight == null) return null;
  return (candidateValue - oneValue) * weight;
}

function chooseCandidate(ranked, baseline) {
  const one = arr(ranked).find((row) => Number(row?.boatNo) === 1) || null;
  if (!one || Number(ranked?.[0]?.boatNo) !== 1) return null;
  for (const row of arr(ranked)) {
    if (![3, 4].includes(Number(row?.boatNo))) continue;
    const gaps = {
      st: componentGap(row, one, 'st', baseline),
      roleAttack: componentGap(row, one, 'roleAttack', baseline),
      exhibition: componentGap(row, one, 'exhibition', baseline),
      raceFlow: componentGap(row, one, 'raceFlow', baseline),
      courseIndex: componentGap(row, one, 'courseIndex', baseline)
    };
    if (gaps.st > 0 && gaps.roleAttack > 0 && gaps.exhibition > 0) {
      return {
        boatNo: Number(row.boatNo),
        baselineRank: ranked.indexOf(row) + 1,
        gaps,
        evidenceMargin: round1(gaps.st + gaps.roleAttack + gaps.exhibition)
      };
    }
  }
  return null;
}

function prepareRows(rows, weightConfig) {
  const baseline = scoreAb.baselineProfile(weightConfig);
  const prepared = [];
  for (const row of dedupeRows(rows)) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const currentHead = Number(ranked?.[0]?.boatNo) || null;
    const actualHead = Number(row.winnerBoatNo) || null;
    if (!currentHead || !actualHead) continue;
    const candidate = chooseCandidate(ranked, baseline);
    prepared.push({
      raceKey: raceKey(row),
      currentHead,
      shadowHead: candidate?.boatNo || currentHead,
      actualHead,
      eligible: Boolean(candidate),
      candidate
    });
  }
  return prepared;
}

function oneSidedBinomialPValue(successes, trials) {
  if (!Number.isInteger(trials) || trials <= 0) return null;
  if (!Number.isInteger(successes) || successes < 0 || successes > trials) return null;
  let probability = 0;
  let combination = 1;
  for (let k = 0; k <= trials; k += 1) {
    if (k >= successes) probability += combination * Math.pow(0.5, trials);
    combination = combination * (trials - k) / (k + 1 || 1);
  }
  return Math.min(1, Number(probability.toFixed(6)));
}

function summarize(prepared) {
  const rows = arr(prepared);
  const eligible = rows.filter((row) => row.eligible);
  let currentCorrectCount = 0;
  let shadowCorrectCount = 0;
  let wrongToCorrectCount = 0;
  let correctToWrongCount = 0;
  let wrongToWrongCount = 0;
  let unchangedCorrectCount = 0;
  let candidateWinnerCount = 0;
  let innerWinnerCount = 0;
  let otherWinnerCount = 0;
  const candidateDistribution = {};

  for (const row of rows) {
    const currentCorrect = row.currentHead === row.actualHead;
    const shadowCorrect = row.shadowHead === row.actualHead;
    if (currentCorrect) currentCorrectCount += 1;
    if (shadowCorrect) shadowCorrectCount += 1;
    if (!row.eligible) {
      if (currentCorrect) unchangedCorrectCount += 1;
      continue;
    }
    candidateDistribution[row.shadowHead] = (candidateDistribution[row.shadowHead] || 0) + 1;
    if (row.actualHead === row.shadowHead) candidateWinnerCount += 1;
    else if (row.actualHead === 1) innerWinnerCount += 1;
    else otherWinnerCount += 1;
    if (!currentCorrect && shadowCorrect) wrongToCorrectCount += 1;
    else if (currentCorrect && !shadowCorrect) correctToWrongCount += 1;
    else if (!currentCorrect && !shadowCorrect) wrongToWrongCount += 1;
  }

  const netCorrectGain = shadowCorrectCount - currentCorrectCount;
  const eligibleCurrentAccuracy = rate(innerWinnerCount, eligible.length);
  const eligibleShadowAccuracy = rate(candidateWinnerCount, eligible.length);
  return {
    raceCount: rows.length,
    eligibleCount: eligible.length,
    switchRate: rate(eligible.length, rows.length),
    currentCorrectCount,
    shadowCorrectCount,
    currentAccuracy: rate(currentCorrectCount, rows.length),
    shadowAccuracy: rate(shadowCorrectCount, rows.length),
    accuracyChangePt: round1((rate(shadowCorrectCount, rows.length) || 0) - (rate(currentCorrectCount, rows.length) || 0)),
    eligibleCurrentAccuracy,
    eligibleShadowAccuracy,
    eligibleAccuracyChangePt: round1((eligibleShadowAccuracy || 0) - (eligibleCurrentAccuracy || 0)),
    wrongToCorrectCount,
    correctToWrongCount,
    wrongToWrongCount,
    unchangedCorrectCount,
    netCorrectGain,
    candidateWinnerCount,
    innerWinnerCount,
    otherWinnerCount,
    candidateDistribution,
    discordantCount: wrongToCorrectCount + correctToWrongCount,
    oneSidedPValue: oneSidedBinomialPValue(wrongToCorrectCount, wrongToCorrectCount + correctToWrongCount)
  };
}

function decide({ sourceReady, discoveryOverlapCount, overall, firstHalf, secondHalf }) {
  if (!sourceReady) {
    return { nextStep: 'blocked-source-closeout-not-ready', status: 'blocked', reason: '上流Discoveryの固定nextStepが一致しない。' };
  }
  if (FIXED_RULES.requireZeroDiscoveryOverlap && discoveryOverlapCount !== 0) {
    return { nextStep: 'blocked-discovery-holdout-overlap', status: 'blocked', reason: `Discoveryとの重複${discoveryOverlapCount}Rを検出。` };
  }
  if (overall.raceCount < FIXED_RULES.minimumHoldoutRaceCount) {
    return { nextStep: 'reject-insufficient-untouched-holdout', status: 'rejected', reason: `未使用holdout ${overall.raceCount}Rで最低${FIXED_RULES.minimumHoldoutRaceCount}Rに未達。閾値探索せず終了。` };
  }
  if (
    overall.eligibleCount < FIXED_RULES.minimumEligibleCount ||
    overall.candidateWinnerCount < FIXED_RULES.minimumCandidateWinnerCount ||
    firstHalf.eligibleCount < FIXED_RULES.minimumEligiblePerHalf ||
    secondHalf.eligibleCount < FIXED_RULES.minimumEligiblePerHalf
  ) {
    return { nextStep: 'reject-insufficient-fixed-composite-cases', status: 'rejected', reason: '固定複合条件の件数または半期別件数が不足。holdoutを再利用せず終了。' };
  }
  const checks = {
    netCorrectGain: overall.netCorrectGain >= FIXED_RULES.minimumNetCorrectGain,
    eligibleAccuracyGain: overall.eligibleAccuracyChangePt >= FIXED_RULES.minimumEligibleAccuracyGainPt,
    pairedEvidence: overall.oneSidedPValue != null && overall.oneSidedPValue <= FIXED_RULES.maximumOneSidedPValue,
    switchWidth: overall.switchRate <= FIXED_RULES.maximumSwitchRate,
    firstHalfNonNegative: firstHalf.netCorrectGain >= 0,
    secondHalfNonNegative: secondHalf.netCorrectGain >= 0,
    rescuesExceedLosses: overall.wrongToCorrectCount >= overall.correctToWrongCount + FIXED_RULES.minimumNetCorrectGain
  };
  const passed = Object.values(checks).every(Boolean);
  if (passed) {
    return {
      nextStep: 'prepare-prospective-shadow-st-attack-exhibition',
      status: 'holdout-passed-prospective-only',
      reason: '固定複合条件が未使用holdoutの全安全条件を通過。自動本番反映せずprospective shadowへ送る。',
      checks
    };
  }
  return {
    nextStep: 'reject-st-role-attack-exhibition-composite',
    status: 'rejected-by-untouched-holdout',
    reason: `固定複合条件が安全条件を通過しない（${Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key).join(', ')}）。閾値を調整せず終了。`,
    checks
  };
}

function build() {
  const source = readJson(SOURCE_REPORT, {});
  const sourceReady = source?.nextStep === EXPECTED_SOURCE_NEXT_STEP;
  const holdout = loadUntouchedHoldout();
  const prepared = prepareRows(holdout.rows, holdout.weightConfig);
  const midpoint = Math.floor(prepared.length / 2);
  const firstRows = prepared.slice(0, midpoint);
  const secondRows = prepared.slice(midpoint);
  const overall = summarize(prepared);
  const firstHalf = summarize(firstRows);
  const secondHalf = summarize(secondRows);
  const decision = decide({
    sourceReady,
    discoveryOverlapCount: holdout.discoveryOverlapCount,
    overall,
    firstHalf,
    secondHalf
  });

  return {
    schemaVersion: 1,
    analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    humanApprovalRequiredForProduction: true,
    holdoutConsumed: true,
    thresholdSearchPerformed: false,
    source: {
      report: path.relative(ROOT, SOURCE_REPORT),
      analysisId: source?.analysisId || null,
      generatedAt: source?.generatedAt || null,
      expectedNextStep: EXPECTED_SOURCE_NEXT_STEP,
      actualNextStep: source?.nextStep || null,
      ready: sourceReady
    },
    hypothesis: {
      currentHeadMustBe: 1,
      candidateBoats: [3, 4],
      requiredWeightedGaps: {
        st: '> 0',
        roleAttack: '> 0',
        exhibition: '> 0'
      },
      candidateSelection: '現行baseline順位が最上位の適格3・4号艇',
      resultUsedForEligibilityOrSelection: false,
      oddsOrPayoutUsed: false
    },
    holdout: {
      provider: holdout.provider,
      raceCount: prepared.length,
      fingerprint: holdout.fingerprint,
      discoveryRaceCount: holdout.discoveryRaceCount,
      discoveryOverlapCount: holdout.discoveryOverlapCount,
      providerAttempts: holdout.attempts
    },
    fixedRules: FIXED_RULES,
    overall,
    firstHalf,
    secondHalf,
    decision,
    nextStep: decision.nextStep,
    eligibleRaces: prepared.filter((row) => row.eligible)
  };
}

function main() {
  let report;
  try {
    report = build();
  } catch (error) {
    report = {
      schemaVersion: 1,
      analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
      generatedAt: new Date().toISOString(),
      productionChanged: false,
      automaticApplication: false,
      usableForPrediction: false,
      holdoutConsumed: false,
      thresholdSearchPerformed: false,
      status: 'blocked-holdout-loader',
      nextStep: 'blocked-resolve-untouched-holdout-source',
      error: String(error?.message || error),
      attempts: error?.attempts || []
    };
    if (!process.argv.includes('--write')) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exitCode = 1;
      return;
    }
  }
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${path.relative(ROOT, OUTPUT)}: ${report.nextStep}`);
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}

if (require.main === module) main();
module.exports = {
  FIXED_RULES,
  raceKey,
  componentGap,
  chooseCandidate,
  oneSidedBinomialPValue,
  summarize,
  decide,
  prepareRows,
  build
};
