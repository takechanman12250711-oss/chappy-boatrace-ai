"use strict";

const assert = require("node:assert/strict");
const review = require("./build-result-review");

assert.equal(
  review.classifyMiss(["1-2-3"], "1-2-3"),
  "的中"
);
assert.equal(
  review.classifyMiss(["1-2-3"], "2-1-3"),
  "頭外れ"
);
assert.equal(
  review.classifyMiss(["1-2-3"], "1-3-2"),
  "着順違い"
);
assert.equal(
  review.classifyMiss(["1-2-4"], "1-2-3"),
  "相手抜け"
);
assert.equal(
  review.classifyMiss(["1-4-5"], "1-2-3"),
  "完全抜け"
);

const hit = review.buildReview({
  prediction: {
    mainSheet: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 2 },
      ana: { boatNo: 3 },
      osae: { boatNo: 4 }
    },
    practicalTickets: [
      { ticket: "1-2-3" }
    ]
  },
  result: {
    settled: true,
    resultTicket: "1-2-3",
    practicalHit: true,
    verification: {
      structuredScenarioMatch: true
    }
  }
});

assert.equal(hit.practicalHit, true);
assert.equal(hit.missType, "的中");
assert.equal(hit.scenarioMatch, true);
assert.ok(hit.causeCodes.includes("mark.honmei.first"));
assert.ok(hit.summary.includes("的中"));

const miss = review.buildReview({
  prediction: {
    mainSheet: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 3 },
      ana: { boatNo: 4 },
      osae: { boatNo: 5 }
    },
    practicalTickets: [
      { ticket: "1-2-4" }
    ]
  },
  result: {
    settled: true,
    resultTicket: "2-3-6",
    practicalHit: false,
    verification: {
      structuredScenarioMatch: false
    }
  }
});

assert.equal(miss.missType, "頭外れ");
assert.equal(miss.scenarioMatch, false);
assert.ok(miss.weaknesses.some(text => text.includes("◎1号艇")));
assert.ok(miss.summary.includes("不的中"));

assert.equal(
  review.scenarioMatchOf({ verification: { scenarioMatched: true } }),
  true,
  "公式照合が保存するscenarioMatchedを読む"
);
assert.equal(
  review.scenarioMatchOf({ scenarioMatched: false }),
  false,
  "結果直下のscenarioMatchedを読む"
);
assert.equal(
  review.scenarioMatchOf({
    scenarioMatched: true,
    scenarioVerification: { status: "missed" }
  }),
  false,
  "1着艇と決まり手の正式判定を汎用scenarioMatchedより優先する"
);
assert.equal(
  review.scenarioMatchOf({
    verification: { scenarioVerification: { status: "matched" } }
  }),
  true,
  "verification配下の正式判定も読む"
);
assert.equal(
  review.scenarioMatchOf({
    scenarioMatched: true,
    scenarioVerification: { status: "not_comparable" }
  }),
  null,
  "比較不能を汎用一致値で上書きしない"
);
assert.equal(
  review.scenarioMatchOf({ scenarioVerification: { status: "matched" } }),
  true,
  "旧保存データは照合statusから補完する"
);
assert.equal(
  review.scenarioMatchOf({ scenarioVerification: { status: "not_comparable" } }),
  null,
  "比較不能を展開不一致へ変換しない"
);

const unknownScenario = review.buildReview({
  prediction: {
    mainSheet: { honmei: { boatNo: 1 } },
    practicalTickets: [{ ticket: "1-2-3" }]
  },
  result: {
    settled: true,
    resultTicket: "2-1-3",
    practicalHit: false,
    scenarioVerification: { status: "not_comparable" }
  }
});
assert.equal(unknownScenario.scenarioMatch, null);
assert.ok(!unknownScenario.causeCodes.includes("scenario.miss"));

console.log("result review tests passed");
