'use strict';

// Read saved reference evidence only. Never fetch, reconstruct old inputs, select
// tickets, or turn this descriptive result association into an adoption gate.
const input = require('./analysis-input-contract');
const METRICS = { lapTime: '一周', mawariTime: 'まわり足', straightTime: '直線' };
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row?.[key]]));
const map = (rows, fn) => Array.isArray(rows) ? rows.map(fn) : rows;
const flags = ['isRetrospective', 'predictionMode', 'officialResultUsedForPrediction', 'officialResultUsedForEvaluation'];
const timeKeys = ['schemaVersion', 'source', 'dataSource', 'sourceTiming', 'sourceFetchedAt', 'officialResultUsed'];
const sourceKeys = ['status', 'source', 'sourceUrl', 'sourceFetchedAt', 'sourceSha256', 'date', 'jcd', 'rno',
  'rowCount', 'identityMatched', 'exhibitionMatched', 'lapComplete'];
const boatKeys = ['boatNo', 'registerNo', 'value', 'rank'];

function projectConditions(value) {
  if (!value || typeof value !== 'object') return value;
  const out = pick(value, timeKeys), e = value.originalFootEvidence;
  if (!e || typeof e !== 'object') return out;
  const s = e.sourceMetadata;
  out.originalFootEvidence = {
    ...pick(e, ['version', 'mode', 'referenceOnly', 'scoreApplied', 'affectsPrediction', 'affectsTickets',
      'usableForPrediction', 'officialResultUsed', 'rankingPolicy']),
    sourceMetadata: s && {
      ...pick(s, sourceKeys),
      boatIdentities: map(s.boatIdentities, row => pick(row, ['boat', 'boatNo', 'registerNo'])),
      metricCounts: pick(s.metricCounts, Object.keys(METRICS)),
      metricDefinitions: Object.fromEntries(Object.keys(METRICS).map(name => [name,
        pick(s.metricDefinitions?.[name], ['unit', 'measurementLabel', 'venueCode'])]))
    },
    metrics: Object.fromEntries(Object.keys(METRICS).map(name => {
      const m = e.metrics?.[name];
      return [name, m && { ...pick(m, ['measurementLabel', 'unit', 'status', 'comparable', 'reasonCode']),
        boats: map(m.boats, row => pick(row, boatKeys)) }];
    }))
  };
  return out;
}
function projectPrediction(record = {}) {
  return {
    ...pick(record, ['raceKey', 'date', 'jcd', 'raceNo', 'selectedAt', 'capturedAt', 'createdAt',
      'deadlineAt', 'deadline', 'verificationMode', ...flags]),
    preRaceConditions: projectConditions(record.preRaceConditions),
    prediction: { ...pick(record.prediction, flags), preRaceConditions: projectConditions(record.prediction?.preRaceConditions) }
  };
}
function projectResult(record = {}) {
  return {
    ...pick(record, ['date', 'jcd', 'raceNo', 'source', 'resultSource', 'dataSource', 'checkedAt',
      'resultAvailable', 'status', 'void', 'refund', 'refunded']),
    starts: map(record.starts, row => pick(row, ['marker', 'falseStart', 'lateStart'])),
    // Only their lengths affect this audit. Keep the projection idempotent
    // without retaining finisher identities or refund payloads.
    originalMetricRefundCount: Array.isArray(record.refunds) ? record.refunds.length : record.originalMetricRefundCount,
    originalMetricFinisherCount: Array.isArray(record.finishers) ? record.finishers.length : record.originalMetricFinisherCount
  };
}
const increment = (counts, name) => { counts[name] = (counts[name] || 0) + 1; };
const validBoat = value => Number.isInteger(value) && value >= 1 && value <= 6;
const boatNo = row => row?.boatNo ?? row?.boat;
const sixBoats = rows => Array.isArray(rows) && rows.length === 6 &&
  rows.every(row => validBoat(boatNo(row))) && new Set(rows.map(boatNo)).size === 6;
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const time = Date.parse(value);
  // The common pre-deadline helper validates the outer timestamps. Original
  // source timestamps are generated in UTC and must also be real calendar dates.
  if (!Number.isFinite(time) || (value.endsWith('Z') && new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19))) return NaN;
  return time;
}
function sourceReason(e, record) {
  if (!e) return 'legacy-evidence-missing';
  if (e.version !== 'original-foot-evidence-v1' || e.mode !== 'reference-only' || e.referenceOnly !== true ||
      e.scoreApplied !== false || e.affectsPrediction !== false || e.affectsTickets !== false ||
      e.usableForPrediction !== false || e.officialResultUsed !== false ||
      e.rankingPolicy !== 'ascending-exact-ties-competition') return 'reference-contract-invalid';
  const s = e.sourceMetadata;
  if (!s) return 'source-metadata-missing';
  if (s.status !== 'available') return `source-${String(s.status || 'unavailable')}`;
  if (s.identityMatched !== true || s.exhibitionMatched !== true || s.rowCount !== 6) return 'source-binding-invalid';
  const k = input.raceKey(record);
  if (!k || `${s.date}-${s.jcd}-${s.rno}` !== k) return 'source-race-identity-mismatch';
  if (s.source !== 'BOATRACE浜名湖公式・独自計測一周') return 'source-label-mismatch';
  try {
    const u = new URL(s.sourceUrl);
    if (u.protocol !== 'https:' || u.hostname !== 'www.boatrace-hamanako.jp' || u.username || u.password || u.port ||
        u.pathname !== '/modules/yosou/group-cyokuzen.php' || u.searchParams.get('day') !== s.date ||
        u.searchParams.get('race') !== String(s.rno) || u.searchParams.get('kind') !== '2') return 'source-url-mismatch';
  } catch { return 'source-url-mismatch'; }
  if (!/^[a-f0-9]{64}$/i.test(s.sourceSha256 || '') || !String(s.sourceFetchedAt || '').endsWith('Z') ||
      !Number.isFinite(timestamp(s.sourceFetchedAt))) return 'source-integrity-invalid';
  if (!sixBoats(s.boatIdentities) || s.boatIdentities.some(row => !/^\d{4}$/.test(row.registerNo || ''))) return 'source-boat-identity-invalid';
  return '';
}
function metricReason(e, name) {
  const m = e.metrics?.[name], s = e.sourceMetadata, d = s.metricDefinitions?.[name];
  if (!m) return 'metric-evidence-missing';
  if (m.comparable !== true || m.status !== 'comparable') return m.reasonCode || 'metric-not-comparable';
  if (d?.unit !== 'seconds' || d.measurementLabel !== METRICS[name] || d.venueCode !== '06' ||
      m.unit !== 'seconds' || m.measurementLabel !== METRICS[name]) return 'metric-definition-mismatch';
  if (s.metricCounts?.[name] !== 6 || (name === 'lapTime' && s.lapComplete !== true)) return 'metric-values-incomplete';
  if (!sixBoats(m.boats) || m.boats.some(row => typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0 ||
      s.boatIdentities.find(identity => boatNo(identity) === boatNo(row))?.registerNo !== row.registerNo)) return 'metric-values-or-identity-invalid';
  if (m.boats.some(row => row.rank !== 1 + m.boats.filter(other => other.value < row.value).length)) return 'stored-rank-invalid';
  return '';
}
function timingReason(record, conditions, e) {
  const reason = input.preDeadlineReason(record);
  if (reason) return reason;
  if (timestamp(e.sourceMetadata.sourceFetchedAt) > timestamp(conditions.sourceFetchedAt)) return 'original-source-fetched-after-parent-source';
  if (!Number.isFinite(timestamp(conditions.sourceFetchedAt))) return 'parent-source-fetch-timestamp-missing';
  return '';
}
function resultReason(result, record) {
  if (!result) return 'result-missing';
  if (!input.isOfficialResultSource(result)) return 'result-source-unverified';
  if (result.void === true || result.status === 'void') return 'result-void';
  const refundCount = Array.isArray(result.refunds) ? result.refunds.length : result.originalMetricRefundCount;
  const finisherCount = Array.isArray(result.finishers) ? result.finishers.length : result.originalMetricFinisherCount;
  if (result.refund || result.refunded || refundCount > 0 || (Number.isInteger(finisherCount) && finisherCount !== 6) ||
      (Array.isArray(result.starts) && result.starts.some(row =>
      row.falseStart === true || row.lateStart === true || /^(F|L)$/i.test(row.marker || '')))) return 'result-refund-or-start-disqualification';
  if (result.resultAvailable !== true || result.status !== 'finished') return 'result-not-finished';
  if (!input.actualTicket(result)) return 'result-finish-order-unavailable';
  const checkedAt = timestamp(result.checkedAt);
  if (!Number.isFinite(checkedAt)) return 'result-check-timestamp-missing';
  if (checkedAt < Date.parse(record.deadlineAt || record.deadline)) return 'result-checked-before-deadline';
  return '';
}
function emptyMetric(label) {
  return { measurementLabel: label, unit: 'seconds', comparableRaceCount: 0, incompleteRaceCount: 0,
    unknownRaceCount: 0, preDeadlineComparableRaceCount: 0, unavailableReasons: {}, timingExclusionReasons: {},
    referenceOutcomes: { settledRaceCount: 0, excludedResultReasons: {}, uniqueFastestRaceCount: 0,
      uniqueFastestWinnerCount: 0, uniqueFastestTopThreeCount: 0, tiedFastestRaceCount: 0,
      tiedFastestContainsWinnerCount: 0, tiedFastestTopThreeOverlapCount: 0 } };
}
function buildOriginalMetrics(rows, resultDocs) {
  const metrics = Object.fromEntries(Object.entries(METRICS).map(([name, label]) => [name, emptyMetric(label)]));
  const resultMap = new Map();
  for (const doc of resultDocs) for (const result of doc.races || []) {
    const k = input.raceKey(result);
    if (k) resultMap.set(k, result);
  }
  const coverage = { canonicalRaceCount: rows.length, supportedVenueRaceCount: 0, unsupportedVenueRaceCount: 0,
    snapshotMissingRaceCount: 0, legacyEvidenceMissingRaceCount: 0, evidencePresentRaceCount: 0, sourceExclusionReasons: {} };
  for (const record of rows) {
    if (String(record.jcd).padStart(2, '0') !== '06') { coverage.unsupportedVenueRaceCount++; continue; }
    coverage.supportedVenueRaceCount++;
    const conditions = record.prediction?.preRaceConditions || record.preRaceConditions;
    const e = conditions?.originalFootEvidence;
    if (!conditions) coverage.snapshotMissingRaceCount++;
    else if (!e) coverage.legacyEvidenceMissingRaceCount++;
    else coverage.evidencePresentRaceCount++;
    const sourceFailure = !conditions ? 'snapshot-missing' : sourceReason(e, record);
    if (sourceFailure) increment(coverage.sourceExclusionReasons, sourceFailure);
    for (const name of Object.keys(METRICS)) {
      const out = metrics[name], reason = sourceFailure || metricReason(e, name);
      if (reason) {
        if (/^(METRIC_VALUES_INCOMPLETE|metric-values-incomplete)$/.test(reason)) out.incompleteRaceCount++;
        else out.unknownRaceCount++;
        increment(out.unavailableReasons, reason);
        continue;
      }
      out.comparableRaceCount++;
      const timeFailure = timingReason(record, conditions, e);
      if (timeFailure) { increment(out.timingExclusionReasons, timeFailure); continue; }
      out.preDeadlineComparableRaceCount++;
      const result = resultMap.get(input.raceKey(record)), resultFailure = resultReason(result, record);
      if (resultFailure) { increment(out.referenceOutcomes.excludedResultReasons, resultFailure); continue; }
      const order = input.actualTicket(result).split('-').map(Number);
      const fastest = e.metrics[name].boats.filter(row => row.rank === 1).map(boatNo);
      const outcome = out.referenceOutcomes;
      outcome.settledRaceCount++;
      if (fastest.length === 1) {
        outcome.uniqueFastestRaceCount++;
        if (fastest[0] === order[0]) outcome.uniqueFastestWinnerCount++;
        if (order.includes(fastest[0])) outcome.uniqueFastestTopThreeCount++;
      } else {
        outcome.tiedFastestRaceCount++;
        if (fastest.includes(order[0])) outcome.tiedFastestContainsWinnerCount++;
        outcome.tiedFastestTopThreeOverlapCount += fastest.filter(boat => order.includes(boat)).length;
      }
    }
  }
  return { version: 'original-foot-metric-reference-v1', venueCode: '06', referenceOnly: true,
    usableForPrediction: false, automaticApplication: false, performanceEvidence: false,
    remoteSealVerification: 'not-evaluated', outcomeScope: 'descriptive-timestamp-eligible-reference-only',
    tiePolicy: 'exact equal measurements share rank 1; tied races are separate from unique-fastest races',
    coverage, metrics };
}
module.exports = { buildOriginalMetrics, projectPrediction, projectResult };
