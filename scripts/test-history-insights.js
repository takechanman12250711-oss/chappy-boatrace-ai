"use strict";

const assert = require("node:assert/strict");
const {
  createPattern,
  addRace,
  finalizePattern
} = require("./build-race-stats");
const insights = require(
  "../js/history-insights"
);

function createRace(index) {
  const rough = index >= 20;
  const winner = rough ? 4 : 1;
  const order = rough
    ? [4, 2, 3, 1, 5, 6]
    : [1, 2, 3, 4, 5, 6];

  return {
    date: "20260701",
    raceNo: 1,
    finishers: order.map(
      (boat, rankIndex) => ({
        boat,
        rank: rankIndex + 1
      })
    ),
    starts: Array.from(
      { length: 6 },
      (_, boatIndex) => ({
        boat: boatIndex + 1,
        course: boatIndex + 1,
        st: 0.1 + boatIndex / 100
      })
    ),
    winningMethod:
      rough ? "まくり" : "逃げ",
    trifecta: {
      payout: rough ? 12000 : 1500
    }
  };
}

const recent = createPattern();

for (let index = 0; index < 30; index += 1) {
  addRace(recent, createRace(index));
}

const finalized = finalizePattern(recent);

assert.equal(
  finalized.boatPerformance["1"].wins,
  20
);
assert.equal(
  finalized.boatPerformance["1"].outsideTop3,
  10
);
assert.equal(
  finalized.turbulence.roughRaces.rate,
  33.3
);
assert.equal(
  finalized.payoutBands.over10000.rate,
  33.3
);

const stats = {
  byVenueRace: {
    "24": {
      "1": {
        recent1Year: finalized,
        previous2Years: finalizePattern(
          createPattern()
        ),
        all3Years: finalized
      }
    }
  }
};

const pattern = insights.getPattern(
  stats,
  "24",
  1
);
const trend = insights.buildTrend(pattern);

assert.equal(trend.available, true);
assert.equal(trend.label, "本線傾向");
assert.equal(trend.escapeRate, 66.7);
assert.equal(trend.roughRate, 33.3);
assert.equal(
  insights.supportForType(trend, "本線"),
  66.7
);
assert.equal(
  insights.supportForType(trend, "波乱"),
  33.3
);

assert.equal(
  insights.getPattern(stats, "25", 1),
  null
);

console.log(
  "公式3年履歴分析テストに合格しました"
);
