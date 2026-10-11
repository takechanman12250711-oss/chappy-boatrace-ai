'use strict';
const { compactFourStageRecord } = require('./report-input-projection.cjs');
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key]]));
const project = (value, fn) => value && typeof value === 'object' ? fn(value) : value;
const map = (value, fn) => Array.isArray(value) ? value.map(fn) : value;
const conditionKeys = ['schemaVersion', 'source', 'dataSource', 'sourceTiming', 'sourceFetchedAt', 'officialResultUsed'];
function conditions(value) { return project(value, source => pick(source, conditionKeys)); }

// These forward audits share the saved candidate pool, capture-time fallbacks,
// and a small set of frozen boat/weather signals. Preserve both root and nested
// conditions: an explicitly empty nested object must still suppress root fallback.
const forwardTimes = ['selectedAt', 'capturedAt', 'savedAt', 'createdAt', 'generatedAt'];
function forwardConditions(value) {
  return project(value, source => ({
    ...conditions(source),
    ...pick(source, ['windSpeed', 'waveHeight']),
    weather: project(source.weather, weather => pick(weather, ['windSpeed', 'wind', 'waveHeight', 'wave'])),
    boats: map(source.boats, boat => project(boat, row => pick(row,
      ['boatNo', 'boat', 'frameNo', 'attackStrength', 'raceFlowPower', 'totalScore', 'exhibitionST'])))
  }));
}
function compactForwardResearchRecord(record = {}) {
  const out = compactFourStageRecord(record);
  if (!out) return out;
  Object.assign(out, pick(record, forwardTimes), { preRaceConditions: forwardConditions(record.preRaceConditions) });
  if (record.prediction) out.prediction = {
    ...out.prediction, ...pick(record.prediction, forwardTimes),
    preRaceConditions: forwardConditions(record.prediction.preRaceConditions)
  };
  return out;
}
module.exports = { compactForwardResearchRecord };
