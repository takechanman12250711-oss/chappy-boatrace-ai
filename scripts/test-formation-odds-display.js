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
assert.equal(innerDualHead[0].notation, "1-345-全");
assert.equal(innerDualHead[0].pointCount, 12);
assert.ok(innerDualHead[0].tickets.every(ticket => ticket.startsWith("1-")),
  "2頭の押さえ1券から2頭の全流しを新しく表示しない");

function notationTickets(notation) {
  const groups = notation.split("-").map(group => group === "全" ? "123456" : group);
  const tickets = [];
  for (const first of groups[0]) for (const second of groups[1]) for (const third of groups[2]) {
    if (new Set([first, second, third]).size === 3) tickets.push(`${first}-${second}-${third}`);
  }
  return [...new Set(tickets)].sort();
}

function assertExactDisplay(rows, expected, label) {
  for (const row of rows) {
    assert.deepEqual(notationTickets(row.notation), [...row.tickets].sort(), `${label}: 表記の再展開と表示券が一致`);
    assert.equal(row.pointCount, row.tickets.length, `${label}: 実点数を表示`);
  }
  assert.deepEqual([...new Set(rows.flatMap(row => row.tickets))].sort(), [...new Set(expected)].sort(), label);
}

const allLegalTickets = Object.freeze(notationTickets("123456-123456-全"));
assert.equal(allLegalTickets.length, 120);
for (const source of [allLegalTickets, [...allLegalTickets].reverse()]) {
  const rows = display.collectFormationRows({ mainSheet: { flowFormations: [{ expandedTickets: source }] } });
  assertExactDisplay(rows, allLegalTickets, "全120合法券も初期ペア集約で追加・欠落させない");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pointCount, 120);
}
assertExactDisplay(innerDualHead, notationTickets("1-345-全"), "通常12点の全券を保持する");

const limitedTickets = ["1-2-3", "1-2-4", "1-3-4", "1-4-3"];
const limitedRow = {
  headBoatNo: 1, secondBoatNos: [2, 3, 4], thirdBoatNos: [3, 4],
  notation: "1-234-34", expandedTickets: limitedTickets
};
assert.equal(display.normalizeFormationRow(limitedRow).notation, "1-234-34");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: [limitedRow] } }),
  limitedTickets, "明示4券を3着全艇の12券へ広げない");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: [
  { headBoatNo: 1, secondBoatNos: [2, 3, 4], thirdBoatNos: [3, 4] }
] } }), limitedTickets, "明示3着候補を全艇に置換しない");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: ["1-234-34"] } }),
  limitedTickets, "艇数を指定した表記をそのまま表示する");

const mixedTickets = ["1-3-4", "1-3-5", "2-3-5", "2-3-6"];
const mixedPrediction = {
  mainSheet: { flowFormations: [
    { headBoatNo: 1, secondBoatNos: [3], expandedTickets: mixedTickets.slice(0, 2) },
    { headBoatNo: 2, secondBoatNos: [3], expandedTickets: mixedTickets.slice(2) }
  ] }
};
const frozenInput = JSON.stringify(mixedPrediction);
assertExactDisplay(display.collectFormationRows(mixedPrediction), mixedTickets,
  "頭ごとの3着候補が異なる場合に交差した未生成券を足さない");
assert.equal(JSON.stringify(mixedPrediction), frozenInput, "元予想・元券の順番を変更しない");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: [
  { expandedTickets: ["1-2-3", "4-5-6"] }
] } }), ["1-2-3", "4-5-6"], "非直積の明示券も正確な複数行に分けて残す");
assertExactDisplay(display.collectFormationRows({ formation: { flow: ["4-1-2", "4-3-6"] } }),
  ["4-1-2", "4-3-6"], "明示フォーメーションがない旧保存券も欠落・膨張させない");

assert.equal(display.normalizeFormationRow({ ...limitedRow, expandedTickets: [] }), null,
  "明示券が空なら頭と2着候補から券を復活させない");
assert.deepEqual(display.collectFormationRows({
  mainSheet: { flowFormations: [{ ...limitedRow, expandedTickets: [] }] },
  formation: { flow: display.expandFormation([1], [2, 3, 4]) }
}), [], "空の明示券を別経路の全艇候補で埋めない");
assert.equal(display.normalizeFormationRow({ ...limitedRow, thirdBoatNos: [5] }), null,
  "3着表記と候補が矛盾するときに別の券を作らない");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: [
  { ...limitedRow, expandedTickets: ["1-2-3", "1-2-5", "2-3-4"] }
] } }), ["1-2-3"], "明示券に対して頭と3着の明示制約を守る");

const changedOdds = {
  ...mixedPrediction,
  race: { odds: { byTicket: { "1-3-4": 1.1, "2-3-6": 999, "6-5-4": 1000 } } },
  practicalSelection: { tickets: [{ ticket: "6-5-4" }] }
};
assertExactDisplay(display.collectFormationRows(changedOdds), mixedTickets,
  "オッズや別の購入対象から表示用の券を生成しない");
assertExactDisplay(display.collectFormationRows({ mainSheet: { flowFormations: [
  { notation: "12-345-全" }
] } }), twentyFour, "明示された既存24点フォーメーションは縮小しない");

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
assert.deepEqual(
  display.raceParamsOf({
    race: { stadiumCode: "19", raceNo: 8, date: "20260815" }
  }),
  { jcd: "19", rno: 8, date: "20260815" },
  "表示中レースのキーで共有オッズを参照する"
);
assert.equal(
  display.oddsMapFromData({ byTicket: { "1-2-3": 10.1 } }).get("1-2-3"),
  "10.1倍"
);

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
