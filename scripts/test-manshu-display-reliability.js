"use strict";

const assert = require("node:assert/strict");
const moduleApi = require("../js/manshu-display-reliability.js");

const prediction = {
  manshuSheet: { tickets: [] },
  ticketSheets: {
    hole: [
      {
        ticket: "4-1-2",
        category: "万舟",
        odds: 118.4,
        oddsText: "118.4倍",
        scenarioSummary: "4号艇のカド攻めから1号艇を残す。"
      },
      { ticket: "5-1-3", category: "穴候補" }
    ]
  },
  practicalSelection: { status: "selected" }
};

const fallback = moduleApi.firstFallbackTicket(prediction);
assert.equal(moduleApi.ticketOf(fallback), "4-1-2");
const normalized = moduleApi.normalizeCandidate(fallback);
assert.equal(normalized.category, "万舟");
assert.equal(normalized.oddsText, "118.4倍");
assert.match(moduleApi.candidateBody(normalized), /4号艇のカド攻め/);
assert.match(moduleApi.candidateBody(normalized), /data-manshu-display-fallback="true"/);

assert.equal(
  moduleApi.firstFallbackTicket({
    ...prediction,
    manshuSheet: { tickets: [{ ticket: "6-1-2" }] }
  }),
  null,
  "通常の万舟表示がある場合は上書きしない"
);

assert.equal(
  moduleApi.firstFallbackTicket({
    ...prediction,
    practicalSelection: { status: "skipped" }
  }),
  null,
  "見送りレースへ購入候補を復元しない"
);

assert.equal(
  moduleApi.ticketOf(
    moduleApi.firstFallbackTicket({
      manshuSheet: { tickets: [] },
      formation: { manshu: ["5-2-1"] },
      practicalSelection: { status: "selected" }
    })
  ),
  "5-2-1",
  "候補シートがない保存形式でもformationから復元する"
);

console.log("万舟表示フォールバック回帰テスト: 合格");
