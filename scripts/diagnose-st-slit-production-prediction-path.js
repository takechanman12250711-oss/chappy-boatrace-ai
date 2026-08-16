"use strict";

const assert = require("node:assert/strict");

global.window = global;
const collector = require("./collect-predictions");
const theoryInput = require("../js/theory-input");

function courseHistory(course, starts, averageSt, stStdDev = 0.022) {
  return {
    course,
    starts,
    averageSt,
    stStdDev,
    stRange: Number((stStdDev * 4).toFixed(3))
  };
}

function entry(boatNo, exhibitionSt, avgSt = 0.15, currentSt = []) {
  return {
    boatNo,
    registerNo: String(5100 + boatNo),
    racerName: `${boatNo}号艇`,
    className: boatNo === 3 ? "A1" : "B1",
    avgSt,
    exhibitionSt,
    exhibitionTime: 6.8 + boatNo * 0.01,
    lapTime: 37.5 + boatNo * 0.01,
    fCount: 0,
    currentSeries: { st: currentSt },
    startExhibition: {
      boat: boatNo,
      course: boatNo,
      st: exhibitionSt,
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    }
  };
}

const entries = [
  entry(1, 0.14, 0.15, [0.14, 0.15]),
  entry(2, 0.16, 0.16, [0.16, 0.15]),
  entry(3, 0.04, 0.14, [0.12, 0.14, 0.13]),
  entry(4, 0.18, 0.17, [0.16, 0.18]),
  entry(5, 0.15, 0.16, [0.15, 0.17]),
  entry(6, 0.16, 0.17, [0.17, 0.16])
];

const historyRacers = entries.map(boat => ({
  registerNo: boat.registerNo,
  localStarts: 20,
  currentVenueStarts: 20,
  skillHistory: {
    windows: {
      all3Years: {
        byCourse: {
          [boat.boatNo]: courseHistory(boat.boatNo, 36, boat.avgSt)
        }
      },
      recent1Year: {
        byCourse: {
          [boat.boatNo]: courseHistory(boat.boatNo, 18, boat.avgSt, 0.02)
        }
      },
      previous2Years: {
        byCourse: {
          [boat.boatNo]: courseHistory(boat.boatNo, 18, boat.avgSt + 0.01, 0.025)
        }
      }
    }
  }
}));

const raw = {
  stadiumCode: "12",
  jcd: "12",
  raceNo: 1,
  entries,
  startExhibition: entries.map(boat => ({ ...boat.startExhibition })),
  weather: {
    windSpeed: 2,
    waveHeight: 2,
    windDirection: "北"
  },
  historyContext: {
    ready: true,
    racers: historyRacers,
    courseStructure: {
      overall: null,
      venue: null,
      thresholds: null
    }
  }
};

const prepared = theoryInput.prepare(raw, global.ChappyAICore);
const prediction = global.createPrediction(prepared);
const core = prediction?.aiCore || {};
const raceScenarios = core?.raceScenarios || {};
const coreScenarios = Array.isArray(raceScenarios.scenarios)
  ? raceScenarios.scenarios
  : [];
const compact = collector.compactVerificationEvidence(prediction) || {};
const compactScenarios = Array.isArray(compact.scenarios)
  ? compact.scenarios
  : [];

const diagnostic = {
  predictionVersion: prediction?.version || "",
  predictionKeys: Object.keys(prediction || {}).sort(),
  aiCoreKeys: Object.keys(core).sort(),
  hasMainScenario: Boolean(raceScenarios.mainScenario),
  coreScenarioCount: coreScenarios.length,
  coreAdjustmentFieldCount: coreScenarios.filter(row =>
    row && Object.prototype.hasOwnProperty.call(row, "slitAdjustment")
  ).length,
  coreAdjustments: coreScenarios.map(row => ({
    type: row?.type || "",
    slitAdjustment: row?.slitAdjustment,
    slitReasons: row?.slitReasons || []
  })),
  stSlitRoleCount: Array.isArray(core?.stSlitTheory?.roles)
    ? core.stSlitTheory.roles.length
    : 0,
  compactScenarioCount: compactScenarios.length,
  compactAdjustmentFieldCount: compactScenarios.filter(row =>
    row && Object.prototype.hasOwnProperty.call(row, "slitAdjustment")
  ).length,
  compactAdjustments: compactScenarios.map(row => ({
    type: row?.type || "",
    slitAdjustment: row?.slitAdjustment,
    slitReasons: row?.slitReasons || []
  })),
  compactStSlitRoleCount: Array.isArray(compact?.stSlit?.roles)
    ? compact.stSlit.roles.length
    : 0
};

console.log(JSON.stringify(diagnostic, null, 2));

assert.ok(prediction && typeof prediction === "object", "createPrediction must return an object");
assert.ok(core && Object.keys(core).length > 0, "production createPrediction must attach aiCore");
assert.ok(raceScenarios.mainScenario, "production createPrediction must attach aiCore.raceScenarios.mainScenario");
assert.ok(coreScenarios.length >= 4, "production createPrediction must attach four race scenarios");
assert.ok(diagnostic.coreAdjustmentFieldCount > 0, "aiCore race scenarios must retain slitAdjustment fields");
assert.ok(diagnostic.compactAdjustmentFieldCount > 0, "stored verification evidence must retain slitAdjustment fields");

console.log("ST/slit production prediction path diagnostic: ok");
