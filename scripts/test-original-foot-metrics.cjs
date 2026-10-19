'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const conditions = require('../js/prediction-conditions');
const originalApi = require('../api/_original-exhibition');
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const registers = ['3744', '3959', '4581', '3422', '4933', '4793'];
const lap = [37.1, 37.2, 37.3, 37.4, 37.5, 37.6];
const mawari = [5.8, 5.4, 5.4, 5.1, 5.2, 5.7];
const straight = [8.2, 8.1, 8.0, 7.9, 7.8, 7.7];
function htmlFixture(missingMawari = false, missingLap = false) {
  return `<table><thead><tr><th class='col6'>一周</th><th class='col7'>まわり足</th><th class='col8'>直線</th></tr></thead><tbody>` +
    registers.map((registerNo, i) => `<tr><td class='col1'>${i + 1}</td>` +
      `<td class='col2'><a href='profile?toban=${registerNo}'>選手</a></td>` +
      `<td class='col5'>${(6.8 + i * 0.01).toFixed(2)}</td><td class='col6'>${missingLap && i === 2 ? '--' : lap[i].toFixed(2)}</td>` +
      `<td class='col7'>${missingMawari && i === 1 ? '--' : mawari[i].toFixed(2)}</td>` +
      `<td class='col8'>${straight[i].toFixed(2)}</td></tr>`).join('') +
    '</tbody></table><h2>一周・まわり足・直線タイムは、BOATRACE 浜名湖独自計測値です。</h2>';
}
async function apiPayload(missingMawari = false, missingLap = false) {
  const html = htmlFixture(missingMawari, missingLap);
  const original = await originalApi.fetchOriginalExhibition({ jcd: '06', date: '20261019', rno: 6 },
    async () => ({ ok: true, async text() { return html; } }));
  assert.equal(original.status, missingLap ? 'incomplete' : 'available');
  assert.equal(original.sourceSha256, createHash('sha256').update(html, 'utf8').digest('hex'));
  const payload = {
    source: 'boatrace-official', stadiumCode: '06', date: '20261019', raceNo: 6,
    fetchedAt: new Date(Date.parse(original.sourceFetchedAt) + 1).toISOString(),
    entries: registers.map((registerNo, i) => ({ boat: i + 1, boatNo: 50 + i, registerNo,
      racerName: `選手${i + 1}`, className: 'A2', avgSt: 0.15, nationalWinRate: 5,
      localWinRate: 5, motor2Rate: 33, motor3Rate: 45, exhibition: { displayTime: 6.8 + i * 0.01 },
      currentRace: { stList: [0.15, 0.15] } })),
    beforeInfo: registers.map((_, i) => ({ boat: i + 1, exhibition: { displayTime: 6.8 + i * 0.01 } })),
    startExhibition: registers.map((_, i) => ({ boat: i + 1, course: i + 1, st: 0.15,
      isOfficialCourse: true, mappingSource: 'official-start-image' })),
    weather: { windSpeed: 2, waveHeight: 1, windDirection: '向かい風' }
  };
  return originalApi.attachOriginalLapTimes(payload, original);
}
function assertNoComparison(payload, name) {
  const before = JSON.stringify(payload);
  const snapshot = conditions.capture(payload);
  assert.equal(snapshot.originalFootEvidence.status, 'unknown', name);
  for (const metric of Object.values(snapshot.originalFootEvidence.metrics)) {
    assert.equal(metric.comparable, false, name);
    assert.equal(metric.meanSeconds, null);
    assert.ok(metric.boats.every(row => row.rank === null && row.differenceFromMeanSeconds === null));
  }
  assert.equal(JSON.stringify(payload), before);
  return snapshot;
}
async function main() {
  const payload = await apiPayload();
  const before = JSON.stringify(payload);
  freeze(payload);
  const snapshot = conditions.capture(payload, { indexes: { byBoat: { 1: { total: 88, attack: 77 } } } });
  const foot = snapshot.originalFootEvidence;
  assert.equal(snapshot.schemaVersion, 4, 'add fields without reclassifying old snapshots');
  assert.equal(foot.status, 'comparable');
  assert.equal(foot.mode, 'reference-only');
  for (const flag of ['scoreApplied', 'affectsPrediction', 'affectsTickets', 'usableForPrediction', 'officialResultUsed']) {
    assert.equal(foot[flag], false);
  }
  assert.equal(foot.referenceOnly, true);
  assert.equal(snapshot.dataAvailability.lapTime, 6);
  assert.equal(snapshot.dataAvailability.mawariTime, 6);
  assert.equal(snapshot.dataAvailability.straightTime, 6);
  assert.deepEqual(snapshot.originalExhibition, payload.originalExhibition);
  assert.deepEqual(snapshot.escapeEvaluationEvidence.originalExhibition, payload.originalExhibition);
  assert.notStrictEqual(snapshot.originalExhibition, payload.originalExhibition);
  assert.deepEqual(snapshot.escapeEvaluationEvidence.entries, payload.entries);
  assert.deepEqual(snapshot.escapeEvaluationEvidence.beforeInfo, payload.beforeInfo);
  assert.equal(snapshot.boats[0].mawariTimeSourceRef, 'originalExhibition');
  assert.equal(snapshot.boats[0].straightTimeMeasurementLabel, '直線');
  assert.deepEqual(foot.metrics.lapTime.boats.map(row => row.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(foot.metrics.straightTime.boats.map(row => row.rank), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(foot.metrics.mawariTime.boats.map(row => row.rank), [6, 3, 3, 1, 2, 5],
    'each physical metric has its own ordering; exact ties share a rank');
  assert.equal(foot.metrics.mawariTime.meanSeconds, 5.433333);
  assert.equal(foot.metrics.mawariTime.boats[3].differenceFromMeanSeconds, -0.333333,
    'difference is against this race mean, not a previous race or another metric');
  assert.equal(JSON.stringify(payload), before);

  const missing = conditions.capture(await apiPayload(true));
  assert.equal(missing.dataAvailability.mawariTime, 5);
  assert.equal(missing.dataAvailability.lapTime, 6, 'a missing mawari measurement never erases lap');
  assert.equal(missing.boats[1].mawariTime, null);
  assert.equal(missing.boats[1].lapTime, lap[1]);
  assert.equal(missing.originalFootEvidence.metrics.mawariTime.status, 'incomplete');
  assert.ok(missing.originalFootEvidence.metrics.mawariTime.boats.every(row => row.rank === null));
  assert.equal(missing.originalFootEvidence.metrics.lapTime.comparable, true);
  assert.equal(missing.originalFootEvidence.metrics.straightTime.comparable, true);
  assert.equal(missing.originalFootEvidence.status, 'partial');
  const missingLapPayload = await apiPayload(false, true);
  assert.equal(missingLapPayload.originalExhibition.status, 'available');
  assert.equal(missingLapPayload.originalExhibition.lapComplete, false);
  assert.deepEqual(missingLapPayload.originalExhibition.metricCounts, { lapTime: 5, mawariTime: 6, straightTime: 6 });
  assert.ok([...missingLapPayload.entries, ...missingLapPayload.beforeInfo].every(row =>
    !Object.hasOwn(row, 'lapTime') && !Object.hasOwn(row, 'lapTimeSource')),
    'incomplete lap measurements are not partially added to the legacy engine inputs');
  const missingLapSnapshot = conditions.capture(missingLapPayload);
  assert.equal(missingLapSnapshot.dataAvailability.lapTime, 0);
  assert.equal(missingLapSnapshot.dataAvailability.mawariTime, 6);
  assert.equal(missingLapSnapshot.dataAvailability.straightTime, 6);
  assert.ok(missingLapSnapshot.boats.every(row => row.lapTime === null));
  assert.equal(missingLapSnapshot.originalFootEvidence.metrics.lapTime.comparable, false);
  assert.ok(missingLapSnapshot.originalFootEvidence.metrics.lapTime.boats.every(row => row.rank === null));
  assert.equal(missingLapSnapshot.originalFootEvidence.metrics.mawariTime.comparable, true);
  assert.equal(missingLapSnapshot.originalFootEvidence.metrics.straightTime.comparable, true);
  assert.equal(missingLapSnapshot.originalFootEvidence.status, 'partial');

  const negativeCases = [
    ['missing source metadata', data => { delete data.originalExhibition; }],
    ['missing body hash', data => { delete data.originalExhibition.sourceSha256; }],
    ['invalid body hash', data => { data.originalExhibition.sourceSha256 = 'not-a-sha'; }],
    ['missing source timestamp', data => { data.originalExhibition.sourceFetchedAt = null; }],
    ['invalid source timestamp', data => { data.originalExhibition.sourceFetchedAt = 'yesterday'; }],
    ['invalid calendar timestamp', data => { data.originalExhibition.sourceFetchedAt = '2026-02-30T00:00:00.000Z'; }],
    ['source after API observation', data => { data.originalExhibition.sourceFetchedAt =
      new Date(Date.parse(data.fetchedAt) + 1).toISOString(); }],
    ['invalid API timestamp', data => { data.fetchedAt = ''; }],
    ['different race', data => { data.originalExhibition.rno = 7; }],
    ['different date', data => { data.originalExhibition.date = '20261018'; }],
    ['different venue', data => { data.originalExhibition.jcd = '07'; }],
    ['identity not checked', data => { data.originalExhibition.identityMatched = false; }],
    ['exhibition not checked', data => { data.originalExhibition.exhibitionMatched = false; }],
    ['missing six-boat identity', data => { data.originalExhibition.boatIdentities.pop(); }],
    ['different racer identity', data => { data.originalExhibition.boatIdentities[0].registerNo = '9999'; }],
    ['duplicate identity boat', data => { data.originalExhibition.boatIdentities[0].boat = 2; }],
    ['duplicate entry boat', data => { data.entries[0].boat = 2; }],
    ['missing before row', data => { data.beforeInfo.pop(); }],
    ['duplicate before boat', data => { data.beforeInfo[0].boat = 2; }],
    ['missing official course', data => { data.startExhibition.pop(); }],
    ['duplicate official course', data => { data.startExhibition[0].course = 2; }],
    ['unofficial course', data => { data.startExhibition[0].isOfficialCourse = false; data.startExhibition[0].mappingSource = ''; }]
  ];
  for (const [name, change] of negativeCases) {
    const altered = clone(payload);
    change(altered);
    assertNoComparison(altered, name);
  }
  for (const [suffix, value] of [['Source', 'another source'], ['SourceUrl', 'https://example.test'],
    ['Unit', 'milliseconds'], ['MeasurementLabel', '直線'], ['SourceRef', 'someOtherMetadata']]) {
    const altered = clone(payload);
    altered.beforeInfo[0]['mawariTime' + suffix] = value;
    const evidence = conditions.capture(altered).originalFootEvidence;
    assert.equal(evidence.metrics.mawariTime.comparable, false, `reject mixed ${suffix}`);
    assert.equal(evidence.metrics.lapTime.comparable, true);
    assert.equal(evidence.metrics.straightTime.comparable, true);
  }
  const otherVenueDefinition = clone(payload);
  otherVenueDefinition.originalExhibition.metricDefinitions.mawariTime.venueCode = '07';
  const otherVenueEvidence = conditions.capture(otherVenueDefinition).originalFootEvidence;
  assert.equal(otherVenueEvidence.metrics.mawariTime.comparable, false,
    'the same label and seconds unit cannot substitute another venue measurement definition');
  assert.equal(otherVenueEvidence.metrics.mawariTime.reasonCode, 'METRIC_DEFINITION_OR_SOURCE_MISMATCH');
  assert.ok(otherVenueEvidence.metrics.mawariTime.boats.every(row => row.rank === null));
  assert.equal(otherVenueEvidence.metrics.lapTime.comparable, true);
  assert.equal(otherVenueEvidence.metrics.straightTime.comparable, true);
  const staleLap = clone(payload);
  staleLap.originalExhibition.lapComplete = false;
  staleLap.originalExhibition.metricCounts.lapTime = 5;
  const staleSnapshot = conditions.capture(staleLap);
  assert.equal(staleSnapshot.dataAvailability.lapTime, 6, 'existing raw lap values remain available for backward compatibility');
  assert.equal(staleSnapshot.originalFootEvidence.metrics.lapTime.comparable, false,
    'old lap metadata cannot be rebound to a new source that did not measure all six laps');
  assert.equal(staleSnapshot.originalFootEvidence.metrics.mawariTime.comparable, true);
  assert.equal(staleSnapshot.originalFootEvidence.metrics.straightTime.comparable, true);
  const aliased = clone(payload);
  delete aliased.beforeInfo[0].lapTime;
  delete aliased.beforeInfo[0].exhibition.lapTime;
  delete aliased.entries[0].lapTime;
  delete aliased.entries[0].exhibition.lapTime;
  aliased.beforeInfo[0].oneLapTime = 39;
  const aliasSnapshot = conditions.capture(aliased);
  assert.equal(aliasSnapshot.boats[0].lapTime, 39, 'existing oneLapTime snapshot alias stays unchanged');
  assert.equal(aliasSnapshot.originalFootEvidence.metrics.lapTime.comparable, false,
    'reference comparison cannot assign canonical provenance to an unrelated alias');

  const reversed = clone(payload);
  for (const row of [...reversed.entries, ...reversed.beforeInfo]) {
    row.mawariTime = mawari[6 - row.boat];
    row.straightTime = straight[6 - row.boat];
    row.exhibition.mawariTime = row.mawariTime;
    row.exhibition.straightTime = row.straightTime;
  }
  assert.notDeepEqual(conditions.capture(reversed).originalFootEvidence.metrics.mawariTime.boats.map(row => row.rank),
    foot.metrics.mawariTime.boats.map(row => row.rank));
  const context = { console: { log() {}, warn() {}, error() {} } };
  context.window = context;
  vm.createContext(context);
  for (const name of ['evaluated-scenario-candidates', 'ai-core']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
  }
  const current = context.ChappyAICore.buildPredictionData(clone(payload));
  const changedPhysical = context.ChappyAICore.buildPredictionData(reversed);
  const decision = core => clone({
    indexes: core.analyses.map(row => ({ boatNo: row.boatNo, indexes: row.indexes, roles: row.roleScores })),
    main: core.formations.main, safety: core.formations.safety, flow: core.formations.flow,
    hole: core.formations.longshot, mainScenario: core.raceScenarios.mainScenario.type,
    head: core.raceScenarios.attacker, scores: core.raceScenarios.scenarios.map(row => [row.type, row.score])
  });
  assert.deepEqual(decision(changedPhysical), decision(current),
    'new physical fields change reference ranks without reaching any core score, role, scenario or ticket');
  assert.ok(current.formations.main.length > 0, 'core invariance is checked on an established prediction');
  const legacyWithoutLaps = clone(missingLapPayload);
  delete legacyWithoutLaps.originalExhibition;
  for (const row of [...legacyWithoutLaps.entries, ...legacyWithoutLaps.beforeInfo]) {
    for (const metric of ['mawariTime', 'straightTime']) {
      for (const suffix of ['', 'Source', 'SourceUrl', 'Unit', 'MeasurementLabel', 'SourceRef']) {
        delete row[metric + suffix];
        delete row.exhibition[metric + suffix];
      }
    }
  }
  assert.deepEqual(decision(context.ChappyAICore.buildPredictionData(clone(missingLapPayload))),
    decision(context.ChappyAICore.buildPredictionData(legacyWithoutLaps)),
    'when lap is incomplete, independent foot measurements preserve the old no-lap scores and tickets');
  const legacy = conditions.capture({ entries: [{ boat: 1, turnTime: 7.1 }], beforeInfo: [] });
  assert.equal(legacy.boats[0].mawariTime, null);
  assert.equal(legacy.boats[0].straightTime, null);
  assert.equal(legacy.originalFootEvidence.status, 'unknown');
  console.log('original foot reference metrics tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
