'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config/race-roughness-v1.json');
const report = require('../scripts/build-race-insight-report.cjs');
const { isInsightReport } = require('../scripts/persist-race-insight-report.cjs');

const boat = (no, course, cls, nw, extra = {}) => ({ boat: no, course, cls, nw, m2: 33, m3: 48.5, avgST: 0.16, tilt: 0, ...extra });
const solidRace = { jcd: '24', raceNo: 5, wind: 1, wave: 1, boats: [
  boat(1, 1, 'A1', 7.8), boat(2, 2, 'B1', 4.9), boat(3, 3, 'B1', 4.8), boat(4, 4, 'B1', 4.6), boat(5, 5, 'B2', 3.5), boat(6, 6, 'B1', 4.2)] };
const roughRace = { jcd: '02', raceNo: 5, wind: 7, wave: 7, boats: [
  boat(1, 1, 'B2', 3.2), boat(2, 2, 'B1', 5.1), boat(3, 3, 'A2', 6.0), boat(4, 4, 'A1', 7.4), boat(5, 5, 'A1', 7.1), boat(6, 6, 'B1', 5.0)] };

test('frozen config and feature function describe the same model', () => {
  assert.equal(config.usableForPrediction, false);
  assert.equal(config.automaticApplication, false);
  const keys = Object.keys(report.roughnessFeatures(solidRace, config));
  assert.deepEqual(keys, config.features);
  assert.equal(config.mean.length, keys.length);
  assert.equal(config.scale.length, keys.length);
  assert.equal(config.coefficients.length, keys.length);
  assert.ok(config.thresholds.solidBelow < config.thresholds.roughAtOrAbove);
});

test('strong inside racer is classified solid, strong outside field rough', () => {
  assert.equal(report.classifyRoughness(solidRace, config).label, 'solid');
  assert.equal(report.classifyRoughness(roughRace, config).label, 'rough');
  assert.equal(report.classifyRoughness({ ...solidRace, boats: solidRace.boats.slice(0, 5) }, config), null);
});

test('tilt is read from nested saved entries without inventing values', () => {
  const record = { prediction: { a: [{ raw: { entry: { boatNo: 4, tilt: '2.5' } } }, { boatNo: 2, tilt: '' }, { boatNo: 9, tilt: 1 }] } };
  assert.deepEqual(report.collectTilts(record), { 4: 2.5 });
  assert.equal(report.tiltBucket(-0.5), '-0.5');
  assert.equal(report.tiltBucket(1.5), '+1〜1.5');
  assert.equal(report.tiltBucket(3), '+2以上');
});

test('re-encoded internal motor scores are kept apart from official rates', () => {
  const internal = [1, 2, 3, 4, 5, 6].map(n => ({ m2: 30 + n, m3: 45 + n }));
  const official = [1, 2, 3, 4, 5, 6].map(n => ({ m2: 30 + n, m3: 48 + n * 2 }));
  assert.equal(report.motorSource(internal), 'internal-score');
  assert.equal(report.motorSource(official), 'official');
  assert.equal(report.motorSource([{ m2: null, m3: null }, ...official.slice(1)]), 'missing');
});

function record(key, race, order, payout, tickets) {
  const [date, jcd, raceNo] = key.split('-');
  return {
    __analysisRaceKey: key, raceNo: Number(raceNo), jcd, date, selectedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00Z`,
    __insight: { boats: race.boats, wind: race.wind, wave: race.wave },
    prediction: { practicalTickets: tickets },
    __officialResult: {
      trifecta: { payout, combination: order.join('-') },
      finishers: order.map((b, i) => ({ rank: i + 1, boat: b })),
      starts: [1, 2, 3, 4, 5, 6].map(b => ({ boat: b, course: b }))
    }
  };
}

test('report splits fit / hold-out / forward windows and never changes predictions', () => {
  const records = [
    record('20260901-24-5', solidRace, [1, 2, 3, 4, 5, 6], 1200, ['1-2-3']),
    record('20261001-02-5', roughRace, [4, 5, 1, 2, 3, 6], 25000, ['1-2-3']),
    record('20261107-24-5', solidRace, [1, 3, 2, 4, 5, 6], 1800, ['1-3-2', '1-2-3'])
  ];
  const before = JSON.stringify(records);
  const out = report.build({ records, config });
  assert.equal(JSON.stringify(records), before);
  assert.ok(isInsightReport(out));
  assert.equal(out.usableForPrediction, false);
  assert.equal(out.roughness.fitWindow.races, 1);
  assert.equal(out.roughness.holdoutWindow.races, 2);
  assert.equal(out.roughness.forwardWindow.races, 1);
  assert.equal(out.roughness.holdoutWindow.rough.roughRaces, 1);
  assert.equal(out.roughness.forwardWindow.solid.chappy.hits, 1);
  assert.equal(out.roughness.latestDay.date, '20261107');
  assert.equal(out.venue.byVenue.length, 2);
  const course4 = out.tilt.byCourse.find(c => c.course === 4);
  assert.equal(course4.entries, 3);
  assert.equal(course4.winRate, 33.3);
});

test('publication validator rejects reports that could be mistaken for predictions', () => {
  const ok = report.build({ records: [record('20261001-02-5', roughRace, [4, 5, 1, 2, 3, 6], 25000, ['4-5-1'])], config });
  assert.ok(isInsightReport(ok));
  assert.equal(isInsightReport({ ...ok, usableForPrediction: true }), false);
  assert.equal(isInsightReport({ ...ok, sourceCohort: { analyzedRaces: 0 } }), false);
});

test('chappy head boat is the most frequent first-place boat in the saved tickets', () => {
  assert.equal(report.headBoat(['1-2-3', '1-3-2', '2-1-3']), 1);
  assert.equal(report.headBoat(['4-1-2', '4-1-3', '1-4-2']), 4);
  assert.equal(report.headBoat([]), null);
});

test('the three fixed skip rules read only pre-race data', () => {
  const official = (m2s, extra = {}) => m2s.map((m2, i) => boat(i + 1, i + 1, 'B1', 5, { m2, m3: m2 + 20 + i, ...(extra[i + 1] || {}) }));
  const row = (boats, head, label = 'solid') => ({ boats, head, roughness: { label } });
  // B1: rough lookout
  assert.equal(report.shadowRules(row(official([30, 31, 32, 33, 34, 35]), 1, 'rough')).B1_skipRough, true);
  // B2: course-4 tilt +2 and chappy's head is someone else; not when chappy heads the 4
  const tilted = official([30, 31, 32, 33, 34, 35], { 4: { tilt: 2.5 } });
  assert.equal(report.shadowRules(row(tilted, 1)).B2_skipKadoTilt, true);
  assert.equal(report.shadowRules(row(tilted, 4)).B2_skipKadoTilt, false);
  // B3: chappy heads the inside boat whose official motor is the single lowest
  assert.equal(report.shadowRules(row(official([25, 31, 32, 33, 34, 35]), 1)).B3_skipWeakInMotor, true);
  assert.equal(report.shadowRules(row(official([25, 31, 32, 33, 34, 35]), 2)).B3_skipWeakInMotor, false);
  assert.equal(report.shadowRules(row(official([25, 25, 32, 33, 34, 35]), 1)).B3_skipWeakInMotor, false);
  // internal-score motors (m3 = m2 + 15) are never judged
  const internal = [1, 2, 3, 4, 5, 6].map(n => boat(n, n, 'B1', 5, { m2: n === 1 ? 20 : 30 + n, m3: (n === 1 ? 20 : 30 + n) + 15 }));
  assert.equal(report.shadowRules(row(internal, 1)).B3_skipWeakInMotor, false);
});

test('shadow comparison never marks itself usable and splits explored / holdout', () => {
  const out = report.build({ records: [record('20261106-24-5', solidRace, [1, 2, 3, 4, 5, 6], 1200, ['1-2-3']),
    record('20261108-02-5', roughRace, [4, 5, 1, 2, 3, 6], 25000, ['1-2-3'])], config });
  const s = out.shadowAb;
  assert.equal(s.productionChanged, false);
  assert.equal(s.usableForPrediction, false);
  assert.equal(s.automaticApplication, false);
  assert.equal(s.explored.A_current.races, 1);
  assert.equal(s.holdout.A_current.races, 1);
  assert.equal(s.holdout.variants.B1_skipRough.skipped.races, 1);
  assert.equal(s.holdout.variants.B1_skipRough.kept.races, 0);
});
