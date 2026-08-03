"use strict";

const assert = require("node:assert/strict");

const insights = require(
  "../js/odds-insights.js"
);

assert.equal(
  insights.calculateCombinedOdds([
    10,
    20
  ]),
  6.7
);

assert.equal(
  insights.calculateCombinedOdds([
    null,
    0,
    ""
  ]),
  null
);

const combined =
  insights.buildCombinedOdds({
    mainSheet: {
      tickets: [
        {
          ticket: "1-2-3",
          odds: 10
        },
        {
          ticket: "1-3-2",
          odds: 20
        }
      ],
      coverTickets: [
        { odds: 30 }
      ],
      flowTickets: []
    },
    manshuSheet: {
      tickets: [
        { odds: 100 },
        { odds: 200 }
      ]
    }
  });

assert.deepEqual(
  {
    main: combined.main,
    cover: combined.cover,
    flow: combined.flow,
    manshu: combined.manshu
  },
  {
    main: 6.7,
    cover: 30,
    flow: null,
    manshu: 66.7
  }
);

assert.equal(
  combined.totalCount,
  5
);

assert.equal(
  combined.availableCount,
  5
);

assert.equal(
  combined.coverageRate,
  100
);

assert.deepEqual(
  {
    isFormal:
      combined.categories.main
        .isFormal,
    availableCount:
      combined.categories.main
        .availableCount,
    totalCount:
      combined.categories.main
        .totalCount,
    coverageRate:
      combined.categories.main
        .coverageRate,
    recoveryMargin:
      combined.categories.main
        .theoreticalRecoveryMarginPercent,
    allocation:
      combined.categories.main
        .allocation
        .map(item => [
          item.ticket,
          item.allocationRate
        ])
  },
  {
    isFormal: true,
    availableCount: 2,
    totalCount: 2,
    coverageRate: 100,
    recoveryMargin: 566.7,
    allocation: [
      ["1-2-3", 66.7],
      ["1-3-2", 33.3]
    ]
  }
);

const incomplete =
  insights.buildCombinedOdds({
    mainSheet: {
      tickets: [
        {
          ticket: "1-2-3",
          odds: 10
        },
        {
          ticket: "1-3-2",
          odds: null
        }
      ]
    }
  });

assert.deepEqual(
  {
    formal: incomplete.main,
    reference:
      incomplete.categories.main
        .referenceCombinedOdds,
    availableCount:
      incomplete.categories.main
        .availableCount,
    totalCount:
      incomplete.categories.main
        .totalCount,
    coverageRate:
      incomplete.categories.main
        .coverageRate,
    isFormal:
      incomplete.categories.main
        .isFormal,
    recoveryMargin:
      incomplete.categories.main
        .theoreticalRecoveryMarginPercent,
    allocation:
      incomplete.categories.main
        .allocation
  },
  {
    formal: null,
    reference: 10,
    availableCount: 1,
    totalCount: 2,
    coverageRate: 50,
    isFormal: false,
    recoveryMargin: null,
    allocation: []
  }
);

const updated =
  insights.buildCombinedOdds({
    mainSheet: {
      tickets: [
        {
          ticket: "1-2-3",
          odds: 20
        },
        {
          ticket: "1-3-2",
          odds: 20
        }
      ]
    }
  });

assert.equal(updated.main, 10);
assert.notEqual(
  updated.main,
  combined.main
);
assert.deepEqual(
  updated.categories.main
    .allocation
    .map(item => item.allocationRate),
  [50, 50]
);

const top =
  insights.buildMissingTop30(
    {
      available: true,
      scope: "venue-all-races",
      missingNumbers: [
        {
          ticket: "4-1-5",
          recentOccurrences: 1,
          missingDays: 100
        },
        {
          ticket: "2-1-3",
          recentOccurrences: 0,
          missingDays: 31
        },
        { ticket: "1-1-2" },
        {
          ticket: "6-1-2",
          recentOccurrences: 0,
          missingDays: 45
        },
        {
          ticket: "6-5-4",
          recentOccurrences: 0,
          missingDays: 489,
          missingDaysLowerBound: true
        },
        {
          ticket: "6-4-5",
          recentOccurrences: 0,
          missingDays: 679
        },
        {
          ticket: "5-4-6",
          recentOccurrences: 0,
          missingDays: 210
        }
      ]
    },
    {
      "4-1-5": 80,
      "2-1-3": 5.2,
      "6-5-4": 12.5,
      "6-4-5": 420,
      "5-4-6": 210
    },
    6
  );

assert.deepEqual(
  top.top30.map(item => [
    item.rank,
    item.ticket,
    item.missingDays
  ]),
  [
    [1, "6-4-5", 679],
    [2, "6-5-4", 489],
    [3, "5-4-6", 210],
    [4, "6-1-2", 45],
    [5, "2-1-3", 31]
  ],
  "直近30日0回だけを未出現日数の長い順にする"
);
assert.equal(
  top.top30.every(item =>
    !Object.hasOwn(item, "odds")
  ),
  true,
  "オッズを出てない目へ付けない"
);

const oddsChanged =
  insights.buildMissingTop30(
    {
      available: true,
      scope: "venue-all-races",
      missingNumbers:
        top.missingNumbers
    },
    {
      "6-5-4": 999,
      "5-4-6": 3.1,
      "6-4-5": 4.2,
      "4-1-5": 2.8,
      "2-1-3": 700,
      "6-1-2": 1.2
    },
    6
  );

assert.deepEqual(
  oddsChanged.top30.map(
    item => item.ticket
  ),
  top.top30.map(
    item => item.ticket
  ),
  "現在オッズが逆転しても順位を変えない"
);

const withoutOdds =
  insights.buildMissingTop30(
    {
      available: true,
      scope: "venue-all-races",
      missingNumbers:
        top.missingNumbers
    },
    {},
    6
  );

assert.deepEqual(
  withoutOdds.top30.map(
    item => item.ticket
  ),
  top.top30.map(
    item => item.ticket
  ),
  "オッズ未取得でも順位と行を維持する"
);
assert.equal(
  withoutOdds.top30.every(
    item =>
      !Object.hasOwn(item, "odds")
  ),
  true
);

const oneHundredTwenty = [];
for (let first = 1; first <= 6; first += 1) {
  for (let second = 1; second <= 6; second += 1) {
    for (let third = 1; third <= 6; third += 1) {
      if (
        new Set([
          first,
          second,
          third
        ]).size !== 3
      ) {
        continue;
      }

      oneHundredTwenty.push({
        ticket:
          `${first}-${second}-${third}`,
        recentOccurrences: 0,
        missingDays:
          first * 100 +
          second * 10 +
          third
      });
    }
  }
}

const limited =
  insights.buildMissingTop30(
    {
      available: true,
      scope: "venue-all-races",
      missingNumbers:
        oneHundredTwenty
    },
    {},
    30
  );

assert.equal(
  limited.top30.length,
  30,
  "全120通りからTOP30だけを表示する"
);
assert.deepEqual(
  limited.top30.map(
    item => item.rank
  ),
  Array.from(
    { length: 30 },
    (_, index) => index + 1
  )
);
assert.equal(
  limited.sort,
  "zero-in-recent-30-days-then-missing-days"
);

console.log(
  "出てない目・合成オッズテストに合格しました"
);
