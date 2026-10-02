"use strict";

const assert = require("node:assert/strict");
const conditions = require("../js/prediction-conditions");

const raceData = {
  source: "boatrace-official",
  fetchedAt: "2026-09-01T08:50:00Z",
  entries: Array.from({ length: 6 }, (_, index) => ({
    boatNo: index + 1,
    racerName: `Racer ${index + 1}`,
    className: "A1",
    avgST: 0.15 + index * 0.01,
    nationalWinRate: 6,
    localWinRate: 6,
    motor2Rate: 35,
    motor3Rate: 55
  })),
  startExhibition: Array.from({ length: 6 }, (_, index) => ({
    boatNo: index + 1,
    course: index + 1,
    st: 0.10 + index * 0.01,
    isOfficialCourse: true,
    mappingSource: "official"
  })),
  beforeInfo: Array.from({ length: 6 }, (_, index) => ({
    boatNo: index + 1,
    exhibitionTime: 6.70 + index * 0.01
  })),
  weather: {
    windSpeed: 2,
    waveHeight: 1
  },
  result: {
    trifecta: "SECRET_RESULT_ONLY",
    payout: "SECRET_PAYOUT_ONLY"
  }
};

const prediction = {
  indexes: {
    byBoat: {
      1: { boatNo: 1, attack: 71, tenkai: 68, total: 74 },
      2: { boatNo: 2, attack: 64, tenkai: 70, total: 69 },
      3: { boatNo: 3, attack: 77, tenkai: 75, total: 76 },
      4: { boatNo: 4, attack: 66, tenkai: 72, total: 70 },
      5: { boatNo: 5, attack: 58, tenkai: 69, total: 65 },
      6: { boatNo: 6, attack: 54, tenkai: 65, total: 61 }
    }
  }
};

const snapshot = conditions.capture(raceData, prediction);

assert.equal(snapshot.schemaVersion, 4);
assert.equal(snapshot.sourceTiming, "pre_deadline");
assert.equal(snapshot.officialResultUsed, false);
assert.equal(snapshot.boats.length, 6);
assert.equal(snapshot.boats[0].attackStrength, 71);
assert.equal(snapshot.boats[0].attackScore, 71);
assert.equal(snapshot.boats[0].raceFlowPower, 68);
assert.equal(snapshot.boats[0].raceFlowScore, 68);
assert.equal(snapshot.boats[0].tenkaiScore, 68);
assert.equal(snapshot.boats[0].totalScore, 74);
assert.equal(snapshot.boats[0].indexSource, "prediction.indexes.pre_deadline");
assert.equal(snapshot.dataAvailability.attackStrength, 6);
assert.equal(snapshot.dataAvailability.raceFlowPower, 6);
assert.equal(snapshot.dataAvailability.totalScore, 6);
assert.deepEqual(snapshot.theorySignalStorage, {
  mode: "shadow-observation-only",
  source: "prediction.indexes",
  sourceTiming: "pre_deadline",
  affectsPrediction: false,
  affectsTickets: false,
  officialResultUsed: false
});

const serialized = JSON.stringify(snapshot);
assert.equal(serialized.includes("SECRET_RESULT_ONLY"), false);
assert.equal(serialized.includes("SECRET_PAYOUT_ONLY"), false);

const legacyCompatible = conditions.capture(raceData, {});
assert.equal(legacyCompatible.boats[0].attackStrength, null);
assert.equal(legacyCompatible.boats[0].raceFlowPower, null);
assert.equal(legacyCompatible.dataAvailability.attackStrength, 0);
assert.equal(legacyCompatible.dataAvailability.raceFlowPower, 0);

const scoreFallback = conditions.capture(raceData, {
  indexes: {
    scores: [
      { boatNo: 1, attack: 80, tenkai: 79, total: 82 }
    ]
  }
});
assert.equal(scoreFallback.boats[0].attackStrength, 80);
assert.equal(scoreFallback.boats[0].raceFlowPower, 79);
assert.equal(scoreFallback.boats[0].totalScore, 82);

console.log("pre-race theory signal storage: ok");
