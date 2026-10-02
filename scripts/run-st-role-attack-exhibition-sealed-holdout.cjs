'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const scoreAb = require('../js/effective-score-weight-ab');
const weightReport = require('./build-effective-score-weight-ab-report');
const missReport = require('./build-effective-score-miss-attribution-report');
const audit = require('./validate-st-role-attack-exhibition-holdout.cjs');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'effective-score-weight-ab-v1.json');
const SEALED_REPORT_PATH = path.join(ROOT, 'data', 'stats', 'effective-score-weight-ab-report.json');
const SOURCE_REPORT_PATH = path.join(ROOT, 'data', 'stats', 'flow-suppression-report.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'stats', 'st-role-attack-exhibition-holdout-report.json');
const EXPECTED_SOURCE_NEXT_STEP = 'validate-st-role-attack-exhibition-on-untouched-holdout';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fingerprint(rows) {
  return crypto
    .createHash('sha256')
    .update(rows.map((row) => audit.raceKey(row)).join('\n'))
    .digest('hex');
}

function loadPreregisteredSealedHoldout(options = {}) {
  const root = options.root || ROOT;
  const configPath = options.configPath || path.join(root, 'config', 'effective-score-weight-ab-v1.json');
  const sealedReportPath = options.sealedReportPath || path.join(root, 'data', 'stats', 'effective-score-weight-ab-report.json');
  const config = scoreAb.validateConfig(options.config || readJson(configPath));
  const sealedReport = options.sealedReport || readJson(sealedReportPath);

  if (sealedReport?.experimentId !== config.experimentId) {
    throw new Error('sealed holdout report does not match the preregistered experiment');
  }
  if (sealedReport?.holdout?.opened !== false) {
    throw new Error('preregistered holdout was already opened; fail closed');
  }
  if ((sealedReport?.holdout?.evaluatedCandidateIds || []).length !== 0) {
    throw new Error('preregistered holdout already contains evaluated candidates; fail closed');
  }
  if (sealedReport?.cohort?.holdout?.sealedUntilDiscoverySelection !== true) {
    throw new Error('sealed-until-discovery contract is missing; fail closed');
  }
  if (sealedReport?.limitations?.sourceCommitAlreadyContainedOfficialHoldoutResults !== true) {
    throw new Error('retrospective temporal holdout limitation is missing; fail closed');
  }

  const holdoutDates = [...(config?.cohort?.holdoutDates || [])];
  if (holdoutDates.length === 0) throw new Error('preregistered holdout dates are missing');

  const replay = weightReport.collectReplayBasisCohort({
    root,
    config,
    predictionsDir: options.predictionsDir,
    allowedDates: holdoutDates
  });
  const settled = weightReport.joinOfficialResults(replay.rows, {
    root,
    config,
    resultsDir: options.resultsDir
  });
  const rows = [...settled.rows].sort((left, right) =>
    audit.raceKey(left).localeCompare(audit.raceKey(right))
  );

  const discoveryLoaded = options.discoveryLoaded || missReport.loadDiscovery({
    root,
    predictionsDir: options.predictionsDir,
    resultsDir: options.resultsDir
  });
  const discoveryRows = [...(discoveryLoaded?.settled?.rows || [])];
  const discoveryKeys = new Set(discoveryRows.map((row) => audit.raceKey(row)));
  const discoveryOverlapCount = rows.filter((row) => discoveryKeys.has(audit.raceKey(row))).length;

  if (rows.length === 0) throw new Error('preregistered sealed holdout has no settled rows');
  if (discoveryOverlapCount !== 0) {
    throw new Error(`Discovery overlap detected: ${discoveryOverlapCount}`);
  }

  return {
    provider: 'effective-score-weight-ab-v1.preregistered-sealed-holdout',
    holdoutType: 'retrospective-temporal-procedural-seal',
    prospectiveAtOfficialOutcomeTime: false,
    configFrozenAt: config.frozenAt,
    sourceCommit: config.sourceCommit,
    dates: holdoutDates,
    rows,
    weightConfig: config,
    replayDiagnostics: replay.diagnostics,
    settledDiagnostics: settled.diagnostics,
    discoveryRaceCount: discoveryRows.length,
    discoveryOverlapCount,
    fingerprint: fingerprint(rows)
  };
}

function build(options = {}) {
  const root = options.root || ROOT;
  const source = options.sourceReport || readJson(
    options.sourceReportPath || path.join(root, 'data', 'stats', 'flow-suppression-report.json')
  );
  const sourceReady = source?.nextStep === EXPECTED_SOURCE_NEXT_STEP;
  const holdout = loadPreregisteredSealedHoldout({ ...options, root });
  const prepared = audit.prepareRows(holdout.rows, holdout.weightConfig);
  const midpoint = Math.floor(prepared.length / 2);
  const overall = audit.summarize(prepared);
  const firstHalf = audit.summarize(prepared.slice(0, midpoint));
  const secondHalf = audit.summarize(prepared.slice(midpoint));
  const decision = audit.decide({
    sourceReady,
    discoveryOverlapCount: holdout.discoveryOverlapCount,
    overall,
    firstHalf,
    secondHalf
  });

  return {
    schemaVersion: 2,
    analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
    sourceResolver: 'effective-score-weight-ab-preregistered-seal-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    humanApprovalRequiredForProduction: true,
    holdoutConsumed: true,
    thresholdSearchPerformed: false,
    source: {
      report: path.relative(root, options.sourceReportPath || SOURCE_REPORT_PATH),
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
      holdoutType: holdout.holdoutType,
      prospectiveAtOfficialOutcomeTime: holdout.prospectiveAtOfficialOutcomeTime,
      dates: holdout.dates,
      configFrozenAt: holdout.configFrozenAt,
      sourceCommit: holdout.sourceCommit,
      raceCount: prepared.length,
      fingerprint: holdout.fingerprint,
      discoveryRaceCount: holdout.discoveryRaceCount,
      discoveryOverlapCount: holdout.discoveryOverlapCount,
      replayDiagnostics: holdout.replayDiagnostics,
      settledDiagnostics: holdout.settledDiagnostics
    },
    fixedRules: audit.FIXED_RULES,
    overall,
    firstHalf,
    secondHalf,
    decision,
    nextStep: decision.nextStep,
    eligibleRaces: prepared.filter((row) => row.eligible),
    limitations: {
      retrospectiveTemporalHoldout: true,
      proceduralSealOnly: true,
      prospectiveAtOfficialOutcomeTime: false,
      productionClaimAllowed: false
    }
  };
}

function blockedReport(error) {
  return {
    schemaVersion: 2,
    analysisId: 'st-role-attack-exhibition-untouched-holdout-v1',
    sourceResolver: 'effective-score-weight-ab-preregistered-seal-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    holdoutConsumed: false,
    thresholdSearchPerformed: false,
    status: 'blocked-sealed-holdout-source',
    nextStep: 'blocked-resolve-untouched-holdout-source',
    error: String(error?.message || error)
  };
}

function main() {
  let report;
  try {
    report = build();
  } catch (error) {
    report = blockedReport(error);
  }

  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${report.nextStep}`);
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  if (String(report.nextStep || '').startsWith('blocked-')) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = {
  fingerprint,
  loadPreregisteredSealedHoldout,
  build,
  blockedReport
};
