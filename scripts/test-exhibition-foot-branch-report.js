"use strict";
const assert=require("node:assert/strict");const e=require("./build-exhibition-foot-branch-report");
function r(i,rank,text){return{date:"20260817",jcd:"05",raceNo:i,prediction:{practicalTickets:["1-2-3"],flowSupport:{attackBoatNo:3,attackExhibitionRank:rank,dataCoverage:{exhibition:6},confirms:[text]}}};}
function rr(x,hit,payout=800){return{date:x.date,jcd:x.jcd,raceNo:x.raceNo,resultAvailable:true,status:"finished",trifecta:{combination:hit?"1-2-3":"2-1-3",payout}};}
const stored={prediction:{verificationEvidence:{exhibitionFoot:{formal:true,attackBoatNo:4,exhibitionRank:2,exhibitionCoverage:6,statements:["4号艇は展示上位で気配良好"],confirm:true,alert:false}}}};
const storedEvidence=e.evidence(stored);assert.equal(storedEvidence.formal,true);assert.equal(storedEvidence.attackBoatNo,4);assert.equal(storedEvidence.rank,2);assert.equal(storedEvidence.coverage,6);assert.equal(storedEvidence.confirm,true);assert.equal(storedEvidence.alert,false);
const a=[],b=[];for(let i=1;i<=12;i++){const x=r(i,1,"3号艇は展示上位で気配良く展開を補強");a.push(x);b.push(rr(x,true,900));}for(let i=13;i<=24;i++){const x=r(i,3,"3号艇は展示下位で足に不安");a.push(x);b.push(rr(x,i===13,500));}
const report=e.build([{predictions:a}],[{races:b}]);assert.equal(report.productionChanged,false);assert.equal(report.summaries.rank1.raceCount,12);assert.equal(report.summaries.rank3plus.raceCount,12);assert.ok(report.summaries.rank3plus.recoveryRate<report.summaries.rank1.recoveryRate);assert.ok(report.weakBranchRanking.some(x=>x.branch==="rank3plus"));
const predictionDoc={predictions:a.map(x=>({...x,unusedPayload:{rows:Array(100).fill("discard")}})),verificationPredictions:[]};
const resultDoc={races:b.map(x=>({...x,unusedPayload:{rows:Array(100).fill("discard")}}))};
const compactPrediction=e.compactPredictionDoc(predictionDoc);const compactResult=e.compactResultDoc(resultDoc);
assert.equal(compactPrediction.predictions[0].unusedPayload,undefined);assert.equal(compactResult.races[0].unusedPayload,undefined);
const compactReport=e.build([compactPrediction],[compactResult]);assert.deepEqual(compactReport.diagnostics,report.diagnostics);assert.deepEqual(compactReport.summaries,report.summaries);assert.deepEqual(compactReport.weakBranchRanking,report.weakBranchRanking);
console.log("exhibition foot branch report test: ok");

// The original venue measurements are a separate descriptive cohort. The old
// ticket summaries above must remain identical when this evidence is present.
const clone = value => JSON.parse(JSON.stringify(value));
const metricNames = { lapTime: '一周', mawariTime: 'まわり足', straightTime: '直線' };
function metricRecord() {
  const row = { raceKey: '20261019-06-1', date: '20261019', jcd: '06', raceNo: 1,
    selectedAt: '2026-10-19T05:55:00.000Z', deadlineAt: '2026-10-19T15:00:00+09:00',
    prediction: { practicalTickets: ['2-1-3'], preRaceConditions: {
      schemaVersion: 4, source: 'boatrace-official', sourceTiming: 'pre_deadline',
      sourceFetchedAt: '2026-10-19T05:54:01.000Z', officialResultUsed: false
    } } };
  const source = { status: 'available', source: 'BOATRACE浜名湖公式・独自計測一周',
    sourceUrl: 'https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php?day=20261019&race=1&kind=2',
    sourceFetchedAt: '2026-10-19T05:54:00.000Z', sourceSha256: 'a'.repeat(64),
    date: row.date, jcd: '06', rno: 1, rowCount: 6, identityMatched: true,
    exhibitionMatched: true, lapComplete: true, metricCounts: {}, metricDefinitions: {},
    boatIdentities: Array.from({ length: 6 }, (_, i) => ({ boat: i + 1, registerNo: String(4001 + i) })) };
  const values = { lapTime: [36.1, 36.2, 36.3, 36.4, 36.5, 36.6],
    mawariTime: [5.3, 5.1, 5.2, 5.4, 5.5, 5.6], straightTime: [8.1, 8.1, 8.3, 8.4, 8.5, 8.6] };
  const metrics = {};
  for (const [name, label] of Object.entries(metricNames)) {
    source.metricCounts[name] = 6;
    source.metricDefinitions[name] = { unit: 'seconds', measurementLabel: label, venueCode: '06' };
    metrics[name] = { measurementLabel: label, unit: 'seconds', status: 'comparable', comparable: true,
      reasonCode: '', boats: values[name].map((value, i) => ({ boatNo: i + 1, registerNo: String(4001 + i),
        value, rank: 1 + values[name].filter(other => other < value).length })) };
  }
  row.prediction.preRaceConditions.originalFootEvidence = {
    version: 'original-foot-evidence-v1', mode: 'reference-only', referenceOnly: true,
    scoreApplied: false, affectsPrediction: false, affectsTickets: false, usableForPrediction: false,
    officialResultUsed: false, rankingPolicy: 'ascending-exact-ties-competition', sourceMetadata: source, metrics
  };
  return row;
}
function metricResult(row) { return { ...rr(row, false), source: 'boatrace-official',
  checkedAt: '2026-10-19T06:05:00.000Z', trifecta: { combination: '2-1-3', payout: 900 },
  starts: [{ marker: '', falseStart: false, lateStart: false }] }; }
function metricsOf(row, result = metricResult(row)) {
  return e.build([{ predictions: [row] }], [{ races: result ? [result] : [] }]).originalMetrics;
}
const current = metricRecord(), settled = metricResult(current);
const beforeCurrent = JSON.stringify(current), beforeResult = JSON.stringify(settled);
const originals = metricsOf(current, settled);
assert.equal(originals.referenceOnly, true);
assert.equal(originals.performanceEvidence, false);
assert.equal(originals.remoteSealVerification, 'not-evaluated');
assert.equal(originals.coverage.supportedVenueRaceCount, 1);
assert.equal(originals.metrics.mawariTime.comparableRaceCount, 1);
assert.equal(originals.metrics.mawariTime.referenceOutcomes.uniqueFastestWinnerCount, 1);
assert.equal(originals.metrics.lapTime.referenceOutcomes.uniqueFastestWinnerCount, 0);
assert.equal(originals.metrics.lapTime.referenceOutcomes.uniqueFastestTopThreeCount, 1);
assert.equal(originals.metrics.straightTime.referenceOutcomes.uniqueFastestRaceCount, 0);
assert.equal(originals.metrics.straightTime.referenceOutcomes.tiedFastestRaceCount, 1);
assert.equal(originals.metrics.straightTime.referenceOutcomes.tiedFastestContainsWinnerCount, 1);
assert.equal(originals.metrics.straightTime.referenceOutcomes.tiedFastestTopThreeOverlapCount, 2);
assert.equal(JSON.stringify(current), beforeCurrent, 'saved prediction is never mutated');
assert.equal(JSON.stringify(settled), beforeResult, 'official result is never mutated');

const missing = metricRecord();
delete missing.prediction.preRaceConditions.originalFootEvidence;
assert.equal(metricsOf(missing).coverage.legacyEvidenceMissingRaceCount, 1);
assert.equal(metricsOf(missing).metrics.mawariTime.unavailableReasons['legacy-evidence-missing'], 1);
const noSnapshot = metricRecord(); delete noSnapshot.prediction.preRaceConditions;
assert.equal(metricsOf(noSnapshot).coverage.snapshotMissingRaceCount, 1);
const otherVenue = metricRecord(); otherVenue.jcd = '05';
assert.equal(metricsOf(otherVenue).coverage.unsupportedVenueRaceCount, 1);
assert.equal(metricsOf(otherVenue).metrics.mawariTime.unknownRaceCount, 0);

for (const status of ['fetch-failed', 'unavailable', 'identity-mismatch', 'exhibition-mismatch', 'unsupported']) {
  const row = metricRecord(); row.prediction.preRaceConditions.originalFootEvidence.sourceMetadata.status = status;
  const out = metricsOf(row);
  assert.equal(out.coverage.sourceExclusionReasons[`source-${status}`], 1, status);
  assert.equal(out.metrics.mawariTime.referenceOutcomes.settledRaceCount, 0, status);
}
const sourceCases = [
  ['source-integrity-invalid', s => { s.sourceSha256 = ''; }],
  ['source-integrity-invalid', s => { s.sourceFetchedAt = '2026-02-30T05:54:00Z'; }],
  ['source-race-identity-mismatch', s => { s.rno = 2; }],
  ['source-label-mismatch', s => { s.source = 'unverified'; }],
  ['source-url-mismatch', s => { s.sourceUrl = s.sourceUrl.replace('race=1', 'race=2'); }],
  ['source-url-mismatch', s => { s.sourceUrl = s.sourceUrl.replace('www.boatrace-hamanako.jp', 'example.com'); }],
  ['source-binding-invalid', s => { s.identityMatched = false; }],
  ['source-boat-identity-invalid', s => { s.boatIdentities[1].boat = 1; }]
];
for (const [reason, change] of sourceCases) {
  const row = metricRecord(); change(row.prediction.preRaceConditions.originalFootEvidence.sourceMetadata);
  assert.equal(metricsOf(row).metrics.mawariTime.unavailableReasons[reason], 1, reason);
}
const incomplete = metricRecord();
Object.assign(incomplete.prediction.preRaceConditions.originalFootEvidence.metrics.mawariTime,
  { comparable: false, status: 'incomplete', reasonCode: 'METRIC_VALUES_INCOMPLETE' });
const incompleteOut = metricsOf(incomplete);
assert.equal(incompleteOut.metrics.mawariTime.incompleteRaceCount, 1);
assert.equal(incompleteOut.metrics.mawariTime.referenceOutcomes.settledRaceCount, 0);
assert.equal(incompleteOut.metrics.lapTime.referenceOutcomes.settledRaceCount, 1);
const badRank = metricRecord(); badRank.prediction.preRaceConditions.originalFootEvidence.metrics.mawariTime.boats[0].rank = 1;
assert.equal(metricsOf(badRank).metrics.mawariTime.unavailableReasons['stored-rank-invalid'], 1);
const badMetric = metricRecord(); badMetric.prediction.preRaceConditions.originalFootEvidence.sourceMetadata.metricDefinitions.mawariTime.measurementLabel = '一周';
assert.equal(metricsOf(badMetric).metrics.mawariTime.unavailableReasons['metric-definition-mismatch'], 1);

const timingCases = [
  ['source-timing-not-pre-deadline', row => { row.prediction.preRaceConditions.sourceTiming = 'unknown'; }],
  ['official-result-flag-not-false', row => { row.prediction.preRaceConditions.officialResultUsed = true; }],
  ['retrospective-record', row => { row.isRetrospective = true; }],
  ['official-result-used', row => { row.prediction.officialResultUsedForEvaluation = true; }],
  ['timestamp-missing', row => { row.selectedAt = ''; }],
  ['source-fetched-after-capture', row => { row.selectedAt = '2026-10-19T05:54:00.500Z'; }],
  ['source-fetched-at-or-after-deadline', row => { row.prediction.preRaceConditions.sourceFetchedAt = '2026-10-19T06:00:00Z'; }],
  ['captured-at-or-after-deadline', row => { row.selectedAt = '2026-10-19T06:00:00Z'; }],
  ['original-source-fetched-after-parent-source', row => { row.prediction.preRaceConditions.originalFootEvidence.sourceMetadata.sourceFetchedAt = '2026-10-19T05:54:02.000Z'; }]
];
for (const [reason, change] of timingCases) {
  const row = metricRecord(); change(row);
  const out = metricsOf(row);
  assert.equal(out.metrics.mawariTime.comparableRaceCount, 1, reason);
  assert.equal(out.metrics.mawariTime.timingExclusionReasons[reason], 1, reason);
  assert.equal(out.metrics.mawariTime.referenceOutcomes.settledRaceCount, 0, reason);
  const compact = e.compactPredictionDoc({ predictions: [row] });
  assert.deepEqual(e.build([compact], [{ races: [metricResult(row)] }]).originalMetrics, out, `timing projection: ${reason}`);
}
const resultCases = [
  ['result-missing', null],
  ['result-source-unverified', { source: 'unverified' }],
  ['result-not-finished', { status: 'not_finished', resultAvailable: false }],
  ['result-void', { status: 'void', void: true }],
  ['result-refund-or-start-disqualification', { refund: true }],
  ['result-refund-or-start-disqualification', { refunded: '返還あり' }],
  ['result-refund-or-start-disqualification', { refunds: [{ boat: 4 }] }],
  ['result-refund-or-start-disqualification', { finishers: Array(5).fill({ boat: 1 }) }],
  ['result-refund-or-start-disqualification', { finishers: [] }],
  ['result-refund-or-start-disqualification', { starts: [{ marker: 'F', falseStart: true }] }],
  ['result-refund-or-start-disqualification', { starts: [{ marker: 'L', lateStart: true }] }],
  ['result-check-timestamp-missing', { checkedAt: '' }],
  ['result-checked-before-deadline', { checkedAt: '2026-10-19T05:59:00Z' }],
  ['result-finish-order-unavailable', { trifecta: null }]
];
for (const [reason, change] of resultCases) {
  const result = change === null ? null : { ...metricResult(current), ...change };
  const out = metricsOf(current, result);
  assert.equal(out.metrics.mawariTime.preDeadlineComparableRaceCount, 1, reason);
  assert.equal(out.metrics.mawariTime.referenceOutcomes.settledRaceCount, 0, reason);
  assert.equal(out.metrics.mawariTime.referenceOutcomes.excludedResultReasons[reason], 1, reason);
  const rd = { races: result ? [result] : [] };
  assert.deepEqual(e.build([e.compactPredictionDoc({ predictions: [current] })], [e.compactResultDoc(rd)]).originalMetrics, out,
    `result projection: ${reason}`);
  assert.deepEqual(e.build([e.compactPredictionDoc({ predictions: [current] })],
    [e.compactResultDoc(e.compactResultDoc(rd))]).originalMetrics, out, `repeated result projection: ${reason}`);
}

const rootFallback = metricRecord();
rootFallback.preRaceConditions = rootFallback.prediction.preRaceConditions;
delete rootFallback.prediction.preRaceConditions;
assert.deepEqual(metricsOf(rootFallback), originals, 'retain existing root condition fallback');
const large = clone(current);
large.prediction.preRaceConditions.escapeEvaluationEvidence = { rows: Array(100).fill('raw data is not retained') };
large.prediction.preRaceConditions.originalFootEvidence.sourceMetadata.unusedHtml = 'discard';
const projected = e.compactPredictionDoc({ predictions: [large] });
assert.equal(projected.predictions[0].prediction.preRaceConditions.escapeEvaluationEvidence, undefined);
assert.equal(projected.predictions[0].prediction.preRaceConditions.originalFootEvidence.sourceMetadata.unusedHtml, undefined);
assert.deepEqual(e.build([projected], [e.compactResultDoc({ races: [settled] })]).originalMetrics, originals);
const oldOnly = e.build([{ predictions: [r(1, 1, '展示上位')] }], [{ races: [rr(r(1, 1, '展示上位'), true)] }]);
const withOriginal = clone(r(1, 1, '展示上位'));
withOriginal.prediction.preRaceConditions = current.prediction.preRaceConditions;
const added = e.build([{ predictions: [withOriginal] }], [{ races: [rr(withOriginal, true)] }]);
assert.deepEqual(added.diagnostics, oldOnly.diagnostics);
assert.deepEqual(added.summaries, oldOnly.summaries);
assert.deepEqual(added.weakBranchRanking, oldOnly.weakBranchRanking);
assert.equal(added.schemaVersion, oldOnly.schemaVersion);
console.log('original venue metric reference report: ok');
