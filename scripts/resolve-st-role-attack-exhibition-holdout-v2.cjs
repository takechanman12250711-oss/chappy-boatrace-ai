'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const scoreAb = require('../js/effective-score-weight-ab');
const miss = require('./build-effective-score-miss-attribution-report');
const v1 = require('./validate-st-role-attack-exhibition-holdout.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'stats', 'st-role-attack-exhibition-holdout-report.json');
const SOURCE_REPORT = path.join(ROOT, 'data', 'stats', 'flow-suppression-report.json');
const EXPECTED_SOURCE_NEXT_STEP = 'validate-st-role-attack-exhibition-on-untouched-holdout';

const arr = (value) => Array.isArray(value) ? value : [];
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function isBlockedStep(step) {
  return String(step || '').startsWith('blocked-');
}

function isFinalReport(report) {
  return Boolean(
    report &&
    report.analysisId === 'st-role-attack-exhibition-untouched-holdout-v1' &&
    report.holdoutConsumed === true &&
    report.thresholdSearchPerformed === false &&
    report.productionChanged === false &&
    report.automaticApplication === false &&
    report.nextStep &&
    !isBlockedStep(report.nextStep)
  );
}

function raceKey(row = {}) {
  return v1.raceKey(row);
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

function collectRowArrays(node, label = 'root', depth = 0, seen = new Set()) {
  if (node == null || depth > 8) return [];
  if (typeof node === 'object') {
    if (seen.has(node)) return [];
    seen.add(node);
  }
  if (Array.isArray(node)) {
    const rows = dedupeRows(node);
    const out = rows.length > 0 ? [{ label, rows }] : [];
    node.slice(0, 50).forEach((value, index) => {
      out.push(...collectRowArrays(value, `${label}[${index}]`, depth + 1, seen));
    });
    return out;
  }
  if (typeof node !== 'object') return [];
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    out.push(...collectRowArrays(value, `${label}.${key}`, depth + 1, seen));
  }
  return out;
}

function semanticScore(label) {
  const text = String(label || '').toLowerCase();
  let score = 0;
  if (/holdout/.test(text)) score += 120;
  if (/sealed/.test(text)) score += 90;
  if (/untouched|unseen|unused/.test(text)) score += 80;
  if (/validation/.test(text)) score += 65;
  if (/effective[-_ ]?score/.test(text)) score += 25;
  if (/miss[-_ ]?attribution/.test(text)) score += 10;
  if (/discovery/.test(text)) score -= 200;
  if (/fixture|sample|synthetic|test/.test(text)) score -= 120;
  if (/report/.test(text) && !/holdout|validation|sealed/.test(text)) score -= 30;
  return score;
}

function fingerprint(rows) {
  return crypto.createHash('sha256').update(rows.map(raceKey).join('\n')).digest('hex');
}

function safeRequire(file) {
  try {
    return require(file);
  } catch (_error) {
    return null;
  }
}

function moduleCandidates() {
  const modules = [
    { id: 'miss', value: miss },
    { id: 'scoreAb', value: scoreAb }
  ];
  const dirs = [path.join(ROOT, 'scripts'), path.join(ROOT, 'js')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(c?js)$/i.test(name)) continue;
      if (!/effective|holdout|validation|sealed|miss-attribution/i.test(name)) continue;
      const full = path.join(dir, name);
      if ([__filename, path.join(ROOT, 'scripts', 'validate-st-role-attack-exhibition-holdout.cjs')].includes(full)) continue;
      const value = safeRequire(full);
      if (value && typeof value === 'object') modules.push({ id: path.relative(ROOT, full), value });
    }
  }
  return modules;
}

function exportedProviders() {
  const providers = [];
  for (const moduleInfo of moduleCandidates()) {
    for (const [name, fn] of Object.entries(moduleInfo.value || {})) {
      if (typeof fn !== 'function') continue;
      if (name === 'loadDiscovery') continue;
      if (!/^(load|read|get).*(holdout|validation|sealed|dataset|data|input|split|cohort)/i.test(name) && !/holdout|validation|sealed/i.test(name)) continue;
      providers.push({
        id: `module:${moduleInfo.id}.${name}`,
        load: () => fn()
      });
    }
  }
  return providers;
}

function walkJsonFiles() {
  const files = [];
  const roots = [path.join(ROOT, 'data'), path.join(ROOT, 'config')];
  function walk(dir, depth = 0) {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !/\.json$/i.test(entry.name) || full === OUTPUT) continue;
      if (!/holdout|sealed|validation|effective|miss|reproducibility|weight/i.test(full)) continue;
      const size = fs.statSync(full).size;
      if (size <= 80 * 1024 * 1024) files.push(full);
    }
  }
  roots.forEach((dir) => walk(dir));
  return files;
}

function jsonProviders() {
  return walkJsonFiles().map((file) => ({
    id: `json:${path.relative(ROOT, file)}`,
    load: () => readJson(file)
  }));
}

function discoveryInfo() {
  if (typeof miss.loadDiscovery !== 'function') throw new Error('loadDiscovery unavailable');
  const loaded = miss.loadDiscovery();
  const arrays = collectRowArrays(loaded, 'miss.loadDiscovery');
  const primary = arrays.sort((left, right) => right.rows.length - left.rows.length)[0];
  const rows = primary?.rows || [];
  const weightConfig = loaded?.weightConfig || loaded?.weightsConfig || loaded?.config || null;
  if (!rows.length || !weightConfig) throw new Error('Discovery rows or weightConfig unavailable');
  return { rows, keys: new Set(rows.map(raceKey)), weightConfig };
}

function resolveHoldout() {
  const discovery = discoveryInfo();
  const attempts = [];
  const accepted = [];
  const providers = [...exportedProviders(), ...jsonProviders()];

  for (const provider of providers) {
    try {
      const value = provider.load();
      if (value && typeof value.then === 'function') {
        attempts.push({ provider: provider.id, skipped: 'async-provider' });
        continue;
      }
      const arrays = collectRowArrays(value, provider.id);
      if (!arrays.length) {
        attempts.push({ provider: provider.id, rowArrayCount: 0 });
        continue;
      }
      for (const candidate of arrays) {
        const rows = candidate.rows;
        const overlapCount = rows.filter((row) => discovery.keys.has(raceKey(row))).length;
        const score = semanticScore(candidate.label);
        const summary = {
          provider: provider.id,
          label: candidate.label,
          rowCount: rows.length,
          discoveryOverlapCount: overlapCount,
          semanticScore: score
        };
        attempts.push(summary);
        if (rows.length >= 20 && overlapCount === 0 && score >= 60) {
          accepted.push({ ...summary, rows, weightConfig: value?.weightConfig || value?.weightsConfig || value?.config || discovery.weightConfig });
        }
      }
    } catch (error) {
      attempts.push({ provider: provider.id, error: String(error?.message || error) });
    }
  }

  accepted.sort((left, right) =>
    right.semanticScore - left.semanticScore ||
    right.rowCount - left.rowCount ||
    left.label.localeCompare(right.label)
  );
  const selected = accepted[0];
  if (!selected) {
    const error = new Error('No semantically labelled zero-overlap holdout row array found');
    error.attempts = attempts;
    throw error;
  }
  return {
    provider: selected.label,
    rows: selected.rows,
    weightConfig: selected.weightConfig,
    discoveryRaceCount: discovery.rows.length,
    discoveryOverlapCount: selected.discoveryOverlapCount,
    fingerprint: fingerprint(selected.rows),
    semanticScore: selected.semanticScore,
    attempts
  };
}

function buildResolvedReport() {
  const source = readJson(SOURCE_REPORT, {});
  const sourceReady = source?.nextStep === EXPECTED_SOURCE_NEXT_STEP;
  const holdout = resolveHoldout();
  const prepared = v1.prepareRows(holdout.rows, holdout.weightConfig);
  const midpoint = Math.floor(prepared.length / 2);
  const overall = v1.summarize(prepared);
  const firstHalf = v1.summarize(prepared.slice(0, midpoint));
  const secondHalf = v1.summarize(prepared.slice(midpoint));
  const decision = v1.decide({
    sourceReady,
    discoveryOverlapCount: holdout.discoveryOverlapCount,
    overall,
    firstHalf,
    secondHalf
  });
  return {
    schemaVersion: 2,
    analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
    resolverVersion: 'zero-overlap-semantic-resolver-v2',
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
      requiredWeightedGaps: { st: '> 0', roleAttack: '> 0', exhibition: '> 0' },
      candidateSelection: '現行baseline順位が最上位の適格3・4号艇',
      resultUsedForEligibilityOrSelection: false,
      oddsOrPayoutUsed: false
    },
    holdout: {
      provider: holdout.provider,
      raceCount: prepared.length,
      fingerprint: holdout.fingerprint,
      semanticScore: holdout.semanticScore,
      discoveryRaceCount: holdout.discoveryRaceCount,
      discoveryOverlapCount: holdout.discoveryOverlapCount,
      providerAttempts: holdout.attempts
    },
    fixedRules: v1.FIXED_RULES,
    overall,
    firstHalf,
    secondHalf,
    decision,
    nextStep: decision.nextStep,
    eligibleRaces: prepared.filter((row) => row.eligible)
  };
}

function run() {
  const existing = readJson(OUTPUT, null);
  if (isFinalReport(existing)) {
    return { report: existing, reusedFinalReport: true, wrote: false };
  }
  try {
    return { report: buildResolvedReport(), reusedFinalReport: false, wrote: false };
  } catch (error) {
    return {
      report: {
        schemaVersion: 2,
        analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
        resolverVersion: 'zero-overlap-semantic-resolver-v2',
        generatedAt: new Date().toISOString(),
        productionChanged: false,
        automaticApplication: false,
        usableForPrediction: false,
        holdoutConsumed: false,
        thresholdSearchPerformed: false,
        status: 'blocked-holdout-loader-v2',
        nextStep: 'blocked-resolve-untouched-holdout-source-v2',
        error: String(error?.message || error),
        attempts: error?.attempts || []
      },
      reusedFinalReport: false,
      wrote: false
    };
  }
}

function main() {
  const result = run();
  if (process.argv.includes('--write')) {
    if (!result.reusedFinalReport) {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, JSON.stringify(result.report, null, 2) + '\n');
      result.wrote = true;
    }
    console.log(JSON.stringify({
      nextStep: result.report.nextStep,
      reusedFinalReport: result.reusedFinalReport,
      wrote: result.wrote,
      holdoutConsumed: result.report.holdoutConsumed,
      provider: result.report.holdout?.provider || null,
      raceCount: result.report.overall?.raceCount || null,
      eligibleCount: result.report.overall?.eligibleCount || null
    }, null, 2));
  } else {
    process.stdout.write(JSON.stringify({ ...result.report, reusedFinalReport: result.reusedFinalReport }, null, 2) + '\n');
  }
  if (isBlockedStep(result.report.nextStep)) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = {
  isBlockedStep,
  isFinalReport,
  collectRowArrays,
  semanticScore,
  dedupeRows,
  resolveHoldout,
  buildResolvedReport,
  run
};
