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
const fallbackHtml = moduleApi.candidateBody(normalized);
assert.match(fallbackHtml, /4号艇のカド攻め/);
assert.match(fallbackHtml, /data-manshu-display-fallback="true"/);
assert.match(fallbackHtml, /<span>候補<\/span>/);
assert.equal(
  fallbackHtml.includes("<h3>万舟"),
  false,
  "万舟見出しを内側で重複表示しない"
);

assert.equal(
  moduleApi.ticketOf(
    moduleApi.firstFallbackTicket({
      manshuSheet: {
        tickets: [{
          ticket: "6-1-2",
          category: "穴候補",
          scenarioSummary: "6号艇の展開突き。"
        }]
      },
      practicalSelection: { status: "selected" }
    })
  ),
  "6-1-2",
  "表示境界で万舟欄だけ空になっても、予想本体に保持した候補を復元する"
);

const normalManshuSection = {
  querySelector(selector) {
    if (selector.includes(":not(")) return { dataset: {} };
    return null;
  }
};
const normalManshuDocument = {
  getElementById(id) {
    if (id !== "resultArea") return null;
    return {
      querySelector(selector) {
        return selector === ".v3-manshu-newspaper"
          ? normalManshuSection
          : null;
      }
    };
  }
};
assert.equal(
  moduleApi.apply(prediction, normalManshuDocument),
  false,
  "通常描画済みの万舟行は上書きしない"
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
