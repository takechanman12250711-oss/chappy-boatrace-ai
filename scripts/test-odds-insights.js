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
        { odds: 10 },
        { odds: 20 }
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
