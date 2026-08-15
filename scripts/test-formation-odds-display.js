"use strict";

const assert = require("node:assert/strict");
const display = require("../js/formation-odds-display");

const twentyFour = display.expandFormation([1, 2], [3, 4, 5]);
assert.equal(twentyFour.length, 24);
assert.equal(display.notationFor([2, 1], [5, 3, 4]), "12-345-全");
assert.ok(twentyFour.includes("1-3-2"));
assert.ok(twentyFour.includes("2-5-6"));
assert.ok(!twentyFour.includes("1-3-3"));

const eight = display.normalizeFormationRow({
  headBoatNo: 4,
  secondBoatNos: [3, 2],
  reason: "4号艇中心。4号艇中心。流し／流し"
});
assert.equal(eight.notation, "4-23-全");
assert.equal(eight.pointCount, 8);
assert.equal(eight.reason, "4号艇中心。フォーメーション。");

const merged = display.mergeCompatibleRows([
  display.normalizeFormationRow({
    headBoatNo: 1,
    secondBoatNos: [3, 4, 5],
    scenarioId: "same",
    reason: "同じ展開"
  }),
  display.normalizeFormationRow({
    headBoatNo: 2,
    secondBoatNos: [3, 4, 5],
    scenarioId: "same",
    reason: "同じ展開"
  })
]);
assert.equal(merged.length, 1);
assert.equal(merged[0].notation, "12-345-全");
assert.equal(merged[0].pointCount, 24);

const completeTickets = display.expandFormation([4], [2, 3]);
assert.deepEqual(display.inferCompleteFormationRows(completeTickets), [{
  firstBoatNos: [4],
  secondBoatNos: [2, 3],
  reason: "",
  scenarioId: ""
}]);
assert.deepEqual(
  display.inferCompleteFormationRows(completeTickets.slice(0, 7)),
  [{
    firstBoatNos: [4],
    secondBoatNos: [2],
    reason: "",
    scenarioId: ""
  }],
  "完全な2着軸だけをフォーメーション表示へ採用する"
);

const innerDualHead = display.collectFormationRows({
  aiCore: {
    formations: {
      flowFormations: [{
        headBoatNo: 1,
        secondBoatNos: [3, 4, 5],
        reason: "1号艇中心・2号艇押さえ"
      }],
      safety: ["2-1-3"]
    }
  }
});
assert.equal(innerDualHead.length, 1);
assert.equal(innerDualHead[0].notation, "12-345-全");
assert.equal(innerDualHead[0].pointCount, 24);

const outsideSingleHead = display.collectFormationRows({
  aiCore: {
    formations: {
      flowFormations: [{
        headBoatNo: 4,
        secondBoatNos: [2, 3]
      }],
      safety: ["1-2-3"]
    }
  }
});
assert.equal(outsideSingleHead[0].notation, "4-23-全");
assert.equal(outsideSingleHead[0].pointCount, 8);

assert.equal(
  display.cleanDisplayText("中心展開。押さえ確認。中心展開。"),
  "中心展開。押さえ確認。"
);
assert.equal(display.fetchedOddsText("12.3倍"), "12.3倍");
assert.equal(display.fetchedOddsText(12.3), "12.3倍");

const prediction = {
  aiCore: {
    formations: {
      flowFormations: [{
        headBoatNo: 4,
        secondBoatNos: [2, 3],
        reason: "4号艇の攻めから2・3号艇の残しを拾う"
      }]
    }
  },
  race: {
    odds: {
      byTicket: Object.fromEntries(
        completeTickets.map((ticket, index) => [ticket, 10 + index / 10])
      )
    }
  },
  practicalSelection: {
    tickets: [
      { ticket: "4-2-1" },
      { ticket: "4-2-3" }
    ]
  }
};
const models = display.buildDisplayModels(prediction);
assert.equal(models.length, 1);
assert.equal(models[0].notation, "4-23-全");
assert.equal(models[0].pointCount, 8);
assert.equal(models[0].availableOddsCount, 8);
assert.equal(models[0].selectedCount, 2);
assert.equal(
  models[0].tickets.find(item => item.ticket === "4-2-1").oddsText,
  "10.0倍"
);

const rendered = display.renderModels(models);
assert.match(rendered, /4-23-全/);
assert.match(rendered, /8点/);
assert.match(rendered, /★ 購入対象 2券/);
assert.equal(
  (rendered.match(/4号艇の攻めから2・3号艇の残しを拾う/g) || []).length,
  1,
  "同じ説明文を各オッズ行へ繰り返さない"
);

console.log("formation odds display tests passed");
