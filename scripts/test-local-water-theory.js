const assert = require("assert");
const theory = require("../js/local-water-theory.js");

const data = {
  jcd: "24",
  weather: { windSpeed: 3, waveHeight: 2 },
  entries: [
    { boatNo: 1, localWinRate: 7.2, local2Rate: 52, local3Rate: 70, localStarts: 30 },
    { boatNo: 2, localWinRate: 5.8, local2Rate: 40, local3Rate: 60, localStarts: 20 },
    { boatNo: 3, localWinRate: 4.0, local2Rate: 28, local3Rate: 45, localStarts: 18 },
    { boatNo: 4 },
    { boatNo: 5 },
    { boatNo: 6 }
  ]
};

const raceScenarios = {
  mainScenario: {
    outcome: {
      firstCandidates: [1],
      secondCandidates: [2],
      thirdCandidates: [3]
    },
    blockedBoats: [4]
  }
};

const result = theory.evaluate(data, [], raceScenarios);

assert.equal(result.version, "local-water-theory-v1.0.0");
assert.equal(result.venue.name, "大村");
assert.equal(result.roles.length, 6);
assert(result.roles[0].score > result.roles[2].score);
assert.equal(result.roles[0].isAdopted, true);
assert.equal(result.roles[3].status, "暫定");
assert(result.summary.includes("1号艇"));

const roughData = {
  jcd: "03",
  weather: { windSpeed: 6, waveHeight: 8 },
  entries: [
    { boatNo: 1, localWinRate: 5.5, local2Rate: 38, local3Rate: 55, localStarts: 15 },
    { boatNo: 4, localWinRate: 5.5, local2Rate: 38, local3Rate: 55, localStarts: 15 }
  ]
};
const roughScenarios = {
  mainScenario: {
    outcome: { firstCandidates: [4], secondCandidates: [1], thirdCandidates: [] },
    blockedBoats: []
  }
};
const roughResult = theory.evaluate(roughData, [], roughScenarios);
assert.equal(roughResult.venue.name, "江戸川");
assert(roughResult.roles[1].breakdown.weather > 0);

console.log("local-water-theory: ok");
