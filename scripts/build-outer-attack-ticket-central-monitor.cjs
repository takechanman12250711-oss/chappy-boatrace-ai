'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'outer-attack-ticket-central-monitor-v1';
const ARCHIVE_ID = 'outer-attack-ticket-central-shadow-archive-v1';
const SETTLEMENT_STORE_ID = 'outer-attack-ticket-central-settlements-v1';
const REPORT_ID = 'outer-attack-ticket-central-report-v1';
const FILES = Object.freeze({
  archive: 'outer-attack-ticket-central-shadow-archive-v1.json',
  settlements: 'outer-attack-ticket-central-settlements-v1.json',
  report: 'outer-attack-ticket-central-report-v1.json'
});

function dependencies() {
  return {
    shadow: require('../js/outer-attack-ticket-shadow.js'),
    settlement: require('../js/outer-attack-ticket-settlement.js'),
    gate: require('../js/outer-attack-ticket-decision-gate.js'),
    input: require('./analysis-input-contract.js')
  };
}

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.keys(value).sort().reduce((out, key) => {
    if (value[key] !== undefined) out[key] = stable(value[key]);
    return out;
  }, {});
}

function fingerprint(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function parseTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value, fallback = '') {
  const parsed = parseTime(value);
  return parsed ? new Date(parsed).toISOString() : fallback;
}

function jstDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`日時形式異常: ${value}`);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' })
    .format(date)
    .replaceAll('-', '');
}

function normalizeDate(value) {
  const date = String(value || '').replace(/\D/g, '').slice(0, 8);
  return /^\d{8}$/.test(date) ? date : '';
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return clone(fallback);
    throw error;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function emptyArchive(now, deps) {
  return {
    schemaVersion: 1,
    archiveId: ARCHIVE_ID,
    monitorVersion: VERSION,
    sourceShadowVersion: deps.shadow.VERSION,
    createdAt: now,
    updatedAt: now,
    immutable: true,
    productionChanged: false,
    automaticApplication: false,
    snapshots: {},
    conflicts: []
  };
}

function emptySettlementStore(now, deps) {
  return {
    schemaVersion: 1,
    storeId: SETTLEMENT_STORE_ID,
    monitorVersion: VERSION,
    sourceSettlementVersion: deps.settlement.VERSION,
    createdAt: now,
    updatedAt: now,
    productionChanged: false,
    automaticApplication: false,
    settlements: {},
    exclusions: {}
  };
}

function snapshotCore(snapshot = {}) {
  return {
    schemaVersion: snapshot.schemaVersion,
    experimentId: snapshot.experimentId,
    status: snapshot.status,
    productionChanged: snapshot.productionChanged,
    automaticApplication: snapshot.automaticApplication,
    resultUsedForGeneration: snapshot.resultUsedForGeneration,
    retrospectiveBackfillAllowed: snapshot.retrospectiveBackfillAllowed,
    replacementPolicy: snapshot.replacementPolicy,
    sourceRaceKey: snapshot.sourceRaceKey,
    captureAt: snapshot.captureAt,
    captureKey: snapshot.captureKey,
    signal: snapshot.signal,
    a: snapshot.a,
    variants: snapshot.variants,
    readyVariantCount: snapshot.readyVariantCount,
    comparisonStatus: snapshot.comparisonStatus,
    persistenceRecommended: snapshot.persistenceRecommended
  };
}

function predictionRows(data = {}) {
  const rows = [];
  const add = (values, kind, priority) => {
    (Array.isArray(values) ? values : []).forEach((record, index) => {
      if (record && typeof record === 'object') rows.push({ record, kind, priority, index });
    });
  };
  add(data.verificationPredictions, 'verification-prediction', 2);
  add(data.predictions, 'primary-prediction', 3);
  return rows;
}

function selectPredictionSnapshots(data, deps) {
  const byRace = new Map();
  const diagnostics = {
    sourceRecordCount: 0,
    preDeadlineRecordCount: 0,
    duplicateRaceKeyCount: 0,
    excludedReasons: {}
  };
  for (const item of predictionRows(data)) {
    diagnostics.sourceRecordCount += 1;
    const key = deps.input.raceKey(item.record, data?.date || '');
    if (!key) {
      diagnostics.excludedReasons['race-key-missing'] = (diagnostics.excludedReasons['race-key-missing'] || 0) + 1;
      continue;
    }
    const reason = deps.input.preDeadlineReason(item.record);
    if (reason) {
      diagnostics.excludedReasons[reason] = (diagnostics.excludedReasons[reason] || 0) + 1;
      continue;
    }
    diagnostics.preDeadlineRecordCount += 1;
    const record = item.record.raceKey ? item.record : { ...item.record, raceKey: key };
    let snapshot;
    try {
      snapshot = deps.shadow.buildSnapshot(record, {
        now: record.selectedAt || record.capturedAt || record.createdAt || new Date().toISOString()
      });
    } catch (error) {
      diagnostics.excludedReasons['shadow-build-error'] = (diagnostics.excludedReasons['shadow-build-error'] || 0) + 1;
      continue;
    }
    const score = Number(snapshot.persistenceRecommended === true) * 1000 +
      Number(snapshot.signal?.status === 'active') * 100 +
      Number(snapshot.readyVariantCount || 0) * 10 + item.priority;
    if (!byRace.has(key)) byRace.set(key, []);
    byRace.get(key).push({ ...item, record, raceKey: key, snapshot, score });
  }
  const selected = [];
  for (const candidates of byRace.values()) {
    diagnostics.duplicateRaceKeyCount += Math.max(0, candidates.length - 1);
    candidates.sort((left, right) =>
      right.score - left.score ||
      parseTime(right.record.selectedAt || right.record.capturedAt || right.record.createdAt) -
        parseTime(left.record.selectedAt || left.record.capturedAt || left.record.createdAt) ||
      right.priority - left.priority || left.index - right.index
    );
    selected.push(candidates[0]);
  }
  selected.sort((left, right) => left.raceKey.localeCompare(right.raceKey));
  return { selected, diagnostics };
}

function capture(data, archive, options = {}) {
  const deps = options.dependencies || dependencies();
  const now = asIso(options.now, new Date().toISOString());
  const next = archive?.archiveId === ARCHIVE_ID ? clone(archive) : emptyArchive(now, deps);
  if (!next.snapshots || typeof next.snapshots !== 'object') next.snapshots = {};
  if (!Array.isArray(next.conflicts)) next.conflicts = [];
  const start = parseTime(deps.gate.CONFIG?.prospectiveStartAt);
  const selected = selectPredictionSnapshots(data, deps);
  const diagnostics = {
    ...selected.diagnostics,
    selectedRaceCount: selected.selected.length,
    beforeProspectiveStartCount: 0,
    notPersistenceRecommendedCount: 0,
    notReadyCount: 0,
    capturedCount: 0,
    preservedCount: 0,
    conflictCount: 0
  };

  for (const candidate of selected.selected) {
    const snapshot = candidate.snapshot;
    if (start && parseTime(snapshot.captureAt) < start) {
      diagnostics.beforeProspectiveStartCount += 1;
      continue;
    }
    if (snapshot.persistenceRecommended !== true) {
      diagnostics.notPersistenceRecommendedCount += 1;
      continue;
    }
    if (Number(snapshot.readyVariantCount || 0) <= 0) diagnostics.notReadyCount += 1;
    const key = String(snapshot.captureKey || `${snapshot.sourceRaceKey}|${snapshot.captureAt}`).trim();
    if (!key) continue;
    const immutableFingerprint = fingerprint(snapshotCore(snapshot));
    const existing = next.snapshots[key];
    if (existing) {
      if (existing.immutableFingerprint === immutableFingerprint) {
        diagnostics.preservedCount += 1;
      } else {
        diagnostics.conflictCount += 1;
        const conflictKey = `${key}|${immutableFingerprint}`;
        if (!next.conflicts.some(row => row.conflictKey === conflictKey)) {
          next.conflicts.push({
            conflictKey,
            archiveKey: key,
            sourceRaceKey: snapshot.sourceRaceKey,
            detectedAt: now,
            existingFingerprint: existing.immutableFingerprint,
            incomingFingerprint: immutableFingerprint,
            action: 'blocked-preserve-first-central-capture'
          });
        }
      }
      continue;
    }
    next.snapshots[key] = {
      archiveKey: key,
      sourceRaceKey: String(snapshot.sourceRaceKey || candidate.raceKey),
      sourceKind: candidate.kind,
      sourcePredictionCapturedAt: String(snapshot.captureAt || ''),
      centralCapturedAt: now,
      immutableFingerprint,
      sourceShadowVersion: deps.shadow.VERSION,
      productionChanged: false,
      automaticApplication: false,
      snapshot: { ...clone(snapshot), centralCapturedAt: now, immutableFingerprint }
    };
    diagnostics.capturedCount += 1;
  }

  next.updatedAt = now;
  next.snapshotCount = Object.keys(next.snapshots).length;
  next.conflictCount = next.conflicts.length;
  next.lastCapture = { date: String(data?.date || options.date || ''), capturedAt: now, diagnostics };
  return { archive: next, diagnostics };
}

function centralOfficial(record, fallbackDate, deps) {
  if (!record || record.resultAvailable !== true || !deps.input.isOfficialResultSource(record)) {
    return { valid: false, reason: 'source-not-official' };
  }
  const raceKey = deps.input.raceKey(record, fallbackDate);
  const ticket = deps.input.actualTicket(record);
  const payout = [
    record.officialPayoutPer100,
    record.payoutPer100Yen,
    record.payoutPer100,
    record.trifecta?.payout,
    record.payout
  ].map(Number).find(value => Number.isFinite(value) && value > 0) || 0;
  if (!raceKey) return { valid: false, reason: 'race-key-invalid' };
  if (!ticket) return { valid: false, reason: 'ticket-missing', raceKey };
  if (!payout) return { valid: false, reason: 'payout-missing', raceKey };
  const adapted = {
    ...record,
    raceKey,
    recordType: 'official_result',
    finishers: ticket.split('-').map(Number),
    officialPayoutPer100: payout,
    checkedAt: record.checkedAt || record.collectedAt || ''
  };
  const normalized = deps.settlement.normalizeOfficialResult(adapted);
  if (normalized?.valid) return normalized;
  return {
    valid: true,
    raceKey,
    ticket,
    finishers: adapted.finishers,
    payoutPer100Yen: payout,
    source: String(record.source || 'boatrace-official'),
    recordType: 'official_result',
    checkedAt: String(adapted.checkedAt || ''),
    fingerprint: fingerprint({ raceKey, ticket, payout })
  };
}

function collectOfficials(resultsDir, targetKeys, deps) {
  const source = deps.input.collectOfficialResults(resultsDir, targetKeys);
  const officials = new Map();
  const rejectedReasons = {};
  for (const [key, record] of source) {
    const normalized = centralOfficial(record, key.slice(0, 8), deps);
    if (normalized.valid) officials.set(key, normalized);
    else rejectedReasons[normalized.reason] = (rejectedReasons[normalized.reason] || 0) + 1;
  }
  return { officials, rejectedReasons };
}

function captureOrder(entry, official) {
  const captured = parseTime(entry.centralCapturedAt);
  const checked = parseTime(official.checkedAt);
  if (!captured || !checked) return 'unknown-central-order';
  return captured <= checked ? 'central-before-result' : 'result-before-central-capture';
}

function settlementFingerprint(row) {
  return fingerprint({
    sourceRaceKey: row.sourceRaceKey,
    shadowCaptureKey: row.shadowCaptureKey,
    shadowImmutableFingerprint: row.shadowImmutableFingerprint,
    officialFingerprint: row.official?.fingerprint,
    comparison: row.comparison,
    variantMetadata: row.variantMetadata
  });
}

function settle(archive, store, options = {}) {
  const deps = options.dependencies || dependencies();
  const now = asIso(options.now, new Date().toISOString());
  const next = store?.storeId === SETTLEMENT_STORE_ID ? clone(store) : emptySettlementStore(now, deps);
  if (!next.settlements || typeof next.settlements !== 'object') next.settlements = {};
  if (!next.exclusions || typeof next.exclusions !== 'object') next.exclusions = {};
  const entries = Object.values(archive?.snapshots || {}).filter(Boolean);
  const byRace = new Map();
  for (const entry of entries) {
    const key = String(entry.sourceRaceKey || '');
    if (!key) continue;
    if (!byRace.has(key)) byRace.set(key, []);
    byRace.get(key).push(entry);
  }
  const { officials, rejectedReasons } = collectOfficials(options.resultsDir, new Set(byRace.keys()), deps);
  const diagnostics = {
    archivedSnapshotCount: entries.length,
    archivedRaceCount: byRace.size,
    officialResultCount: officials.size,
    pendingResultCount: 0,
    settledCount: 0,
    preservedCount: 0,
    revisedCount: 0,
    supersededSnapshotCount: 0,
    missedPreResultCentralCaptureCount: 0,
    unknownCentralOrderCount: 0,
    immutableConflictCount: 0,
    notComparableCount: 0,
    rejectedResultReasons
  };

  for (const [key, raceEntries] of [...byRace].sort(([left], [right]) => left.localeCompare(right))) {
    const official = officials.get(key);
    if (!official) {
      diagnostics.pendingResultCount += 1;
      continue;
    }
    const valid = [];
    let immutableMismatch = false;
    for (const entry of raceEntries) {
      if (!entry.snapshot || entry.immutableFingerprint !== fingerprint(snapshotCore(entry.snapshot))) {
        immutableMismatch = true;
        diagnostics.immutableConflictCount += 1;
        continue;
      }
      valid.push({ entry, order: captureOrder(entry, official) });
    }
    const eligible = valid.filter(row => row.order === 'central-before-result').sort((left, right) =>
      parseTime(right.entry.sourcePredictionCapturedAt || right.entry.snapshot.captureAt) -
        parseTime(left.entry.sourcePredictionCapturedAt || left.entry.snapshot.captureAt) ||
      parseTime(right.entry.centralCapturedAt) - parseTime(left.entry.centralCapturedAt)
    );
    if (!eligible.length) {
      const late = valid.find(row => row.order === 'result-before-central-capture');
      const unknown = valid.find(row => row.order === 'unknown-central-order');
      if (late) {
        diagnostics.missedPreResultCentralCaptureCount += 1;
        next.exclusions[key] = {
          sourceRaceKey: key,
          status: 'missed-pre-result-central-capture',
          centralCapturedAt: late.entry.centralCapturedAt,
          officialCheckedAt: official.checkedAt,
          archiveKey: late.entry.archiveKey,
          automaticApplication: false
        };
      } else if (unknown) {
        diagnostics.unknownCentralOrderCount += 1;
        next.exclusions[key] = {
          sourceRaceKey: key,
          status: 'unknown-central-capture-order',
          centralCapturedAt: unknown.entry.centralCapturedAt,
          officialCheckedAt: official.checkedAt,
          archiveKey: unknown.entry.archiveKey,
          automaticApplication: false
        };
      } else if (immutableMismatch) {
        next.exclusions[key] = {
          sourceRaceKey: key,
          status: 'blocked-immutable-shadow-mismatch',
          detectedAt: now,
          automaticApplication: false
        };
      }
      continue;
    }

    diagnostics.supersededSnapshotCount += Math.max(0, eligible.length - 1);
    const entry = eligible[0].entry;
    const built = deps.settlement.buildSettlement(entry.snapshot, official, { now });
    if (!built) {
      diagnostics.notComparableCount += 1;
      next.exclusions[key] = {
        sourceRaceKey: key,
        status: 'not-comparable',
        archiveKey: entry.archiveKey,
        automaticApplication: false
      };
      continue;
    }
    const incoming = {
      ...built,
      centralMonitorVersion: VERSION,
      centralCaptureOrder: 'central-before-result',
      centralCapturedAt: entry.centralCapturedAt,
      shadowImmutableFingerprint: entry.immutableFingerprint,
      centralComparisonEligible: built.comparisonEligible === true,
      productionChanged: false,
      automaticApplication: false
    };
    incoming.centralSettlementFingerprint = settlementFingerprint(incoming);
    const existing = next.settlements[key];
    if (existing?.centralSettlementFingerprint === incoming.centralSettlementFingerprint) {
      diagnostics.preservedCount += 1;
      delete next.exclusions[key];
      continue;
    }
    if (existing) {
      incoming.revision = Math.max(1, Number(existing.revision || 1)) + 1;
      incoming.previousOfficialFingerprint = String(existing.official?.fingerprint || '');
      incoming.correctedAt = now;
      diagnostics.revisedCount += 1;
    }
    next.settlements[key] = incoming;
    delete next.exclusions[key];
    diagnostics.settledCount += 1;
  }

  next.updatedAt = now;
  next.settlementCount = Object.keys(next.settlements).length;
  next.exclusionCount = Object.keys(next.exclusions).length;
  next.lastSettlement = { settledAt: now, diagnostics };
  return { store: next, diagnostics };
}

function report(archive, store, options = {}) {
  const deps = options.dependencies || dependencies();
  const now = asIso(options.now, new Date().toISOString());
  const all = Object.values(store?.settlements || {}).filter(Boolean);
  const eligible = all.filter(row =>
    row.centralCaptureOrder === 'central-before-result' &&
    row.centralComparisonEligible === true &&
    row.shadowImmutableFingerprint
  );
  const settlementReport = deps.settlement.aggregateSettlements(eligible, { now });
  const decision = deps.gate.buildDecisionReport(eligible, { now });
  const exclusions = Object.values(store?.exclusions || {}).filter(Boolean);
  const exclusionCounts = exclusions.reduce((counts, row) => {
    const key = String(row.status || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const archivedRaceKeys = new Set(Object.values(archive?.snapshots || {}).map(row => row.sourceRaceKey).filter(Boolean));
  const pendingCount = [...archivedRaceKeys].filter(key => !store?.settlements?.[key] && !store?.exclusions?.[key]).length;
  return {
    schemaVersion: 1,
    reportId: REPORT_ID,
    monitorVersion: VERSION,
    generatedAt: now,
    productionChanged: false,
    automaticApplication: false,
    humanApprovalRequired: true,
    thresholdSearchPerformed: false,
    primaryCohort: 'central-before-result-and-prediction-before-result',
    pipeline: {
      immutableSnapshotCount: Object.keys(archive?.snapshots || {}).length,
      archivedRaceCount: archivedRaceKeys.size,
      archiveConflictCount: Array.isArray(archive?.conflicts) ? archive.conflicts.length : 0,
      settlementCount: all.length,
      eligibleSettlementCount: eligible.length,
      pendingOfficialResultCount: pendingCount,
      exclusionCount: exclusions.length,
      exclusionCounts
    },
    settlementReport,
    decision,
    nextMilestones: Object.fromEntries(Object.entries(decision.variants || {}).map(([key, row]) => [key, {
      sampleCount: Number(row.sampleCount || 0),
      nextMilestone: Number(row.nextMilestone || 100),
      remaining: Number(row.remainingToNextMilestone || 0),
      status: String(row.status || 'collecting-to-100')
    }])),
    safety: {
      sourcePredictionsMustPassPreDeadlineContract: true,
      firstCentralCaptureImmutable: true,
      resultBeforeCentralCaptureExcluded: true,
      officialResultsOnly: true,
      sameTicketCountAndStakeCheckedBySourceShadow: true,
      productionTicketsChanged: false,
      oddsUsedForTicketGenerationOrDeletion: false,
      automaticApplication: false,
      userApprovalRequiredBeforeAnyProductionAdoption: true
    }
  };
}

function pathsFor(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const stats = path.resolve(options.statsDir || path.join(root, 'data', 'stats'));
  return {
    root,
    predictions: path.resolve(options.predictionsDir || path.join(root, 'data', 'predictions')),
    results: path.resolve(options.resultsDir || path.join(root, 'data', 'results')),
    archive: path.resolve(options.archiveFile || path.join(stats, FILES.archive)),
    settlements: path.resolve(options.settlementsFile || path.join(stats, FILES.settlements)),
    report: path.resolve(options.reportFile || path.join(stats, FILES.report))
  };
}

function captureFiles(options = {}) {
  const deps = options.dependencies || dependencies();
  const files = pathsFor(options);
  const now = asIso(options.now, new Date().toISOString());
  const date = normalizeDate(options.date) || jstDate(options.sourceTime || now);
  const predictionFile = path.join(files.predictions, `${date}.json`);
  if (!fs.existsSync(predictionFile)) return { status: 'no-prediction-file', date, diagnostics: { capturedCount: 0 } };
  const data = loadJson(predictionFile, {});
  const archive = loadJson(files.archive, emptyArchive(now, deps));
  const output = capture({ ...data, date: data.date || date }, archive, { ...options, date, now, dependencies: deps });
  writeJson(files.archive, output.archive);
  return { status: 'captured', date, archiveFile: files.archive, ...output };
}

function settleFiles(options = {}) {
  const deps = options.dependencies || dependencies();
  const files = pathsFor(options);
  const now = asIso(options.now, new Date().toISOString());
  const archive = loadJson(files.archive, emptyArchive(now, deps));
  const store = loadJson(files.settlements, emptySettlementStore(now, deps));
  const output = settle(archive, store, { ...options, now, resultsDir: files.results, dependencies: deps });
  const centralReport = report(archive, output.store, { ...options, now, dependencies: deps });
  writeJson(files.settlements, output.store);
  writeJson(files.report, centralReport);
  return {
    status: 'settled',
    settlementsFile: files.settlements,
    reportFile: files.report,
    ...output,
    report: centralReport
  };
}

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : '';
}

function main() {
  const mode = arg('mode') || 'all';
  const options = {
    root: arg('root') || undefined,
    statsDir: arg('stats-dir') || undefined,
    predictionsDir: arg('predictions-dir') || undefined,
    resultsDir: arg('results-dir') || undefined,
    date: arg('date') || process.env.PREDICT_DATE || undefined,
    sourceTime: arg('source-time') || process.env.SOURCE_WORKFLOW_CREATED_AT || undefined,
    now: arg('now') || undefined
  };
  let output;
  if (mode === 'capture') output = captureFiles(options);
  else if (mode === 'settle') output = settleFiles(options);
  else if (mode === 'all') output = { status: 'captured-and-settled', capture: captureFiles(options), settlement: settleFiles(options) };
  else throw new Error(`未対応mode: ${mode}`);
  const summary = output.report?.pipeline || output.settlement?.report?.pipeline || output.diagnostics || {};
  process.stdout.write(`${JSON.stringify({ status: output.status, mode, summary }, null, 2)}\n`);
  return output;
}

if (require.main === module) main();

module.exports = {
  VERSION,
  ARCHIVE_ID,
  SETTLEMENT_STORE_ID,
  REPORT_ID,
  FILES,
  dependencies,
  stable,
  fingerprint,
  parseTime,
  asIso,
  jstDate,
  normalizeDate,
  loadJson,
  writeJson,
  emptyArchive,
  emptySettlementStore,
  snapshotCore,
  predictionRows,
  selectPredictionSnapshots,
  capture,
  centralOfficial,
  collectOfficials,
  captureOrder,
  settlementFingerprint,
  settle,
  report,
  pathsFor,
  captureFiles,
  settleFiles,
  main
};
