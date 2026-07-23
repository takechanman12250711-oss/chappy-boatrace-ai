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
      missingNumbers: [
        { ticket: "4-1-5" },
        { ticket: "2-1-3" },
        { ticket: "1-1-2" },
        { ticket: "6-1-2" }
      ]
    },
    {
      "4-1-5": 80,
      "2-1-3": 12.5
    },
    3
  );

assert.deepEqual(
  top.top30.map(item => [
    item.rank,
    item.ticket,
    item.odds
  ]),
  [
    [1, "2-1-3", 12.5],
    [2, "4-1-5", 80],
    [3, "6-1-2", null]
  ]
);

console.log(
  "出てない目・合成オッズテストに合格しました"
);
