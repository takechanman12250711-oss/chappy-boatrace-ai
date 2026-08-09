"use strict";

const assert = require("node:assert/strict");
const boundary = require("../js/main-cover-display-boundary.js");

function tickets(list) {
  return list.map(item => item.ticket);
}

const flowCommonReason =
  "1号艇のイン逃げを1着軸に、2号艇の2着残しを固定。";
const flowThirdFiveReason =
  "5号艇の3着拾いが同じイン逃げ展開で成立。";
const flowThirdSixReason =
  "6号艇の3着拾いが同じイン逃げ展開で成立。";

const flowFormation = {
  headBoatNo: 1,
  secondBoatNos: [2, 3],
  thirdMode: "all",
  notation: "1-23-全",
  pointCount: 8,
  expandedTickets: [
    "1-2-3",
    "1-2-4",
    "1-2-5",
    "1-2-6",
    "1-3-2",
    "1-3-4",
    "1-3-5",
    "1-3-6"
  ]
};

const candidateSheets = {
  main: [
    {
      ticket: "1-2-3",
      category: "本線",
      odds: 12.4,
      oddsText: "12.4倍（最終取得）",
      oddsSource: "boatrace-official-snapshot",
      oddsSavedAt: "2026-08-09T04:11:00.000Z",
      isFinalRetrievedOdds: true
    },
    { ticket: "1-3-2", category: "本線" },
    { ticket: "1-2-4", category: "本線" },
    { ticket: "1-4-2", category: "本線" },
    { ticket: "1-3-4", category: "本線" },
    { ticket: "1-4-3", category: "本線" }
  ],
  cover: [
    { ticket: "2-1-3", category: "押さえ" },
    { ticket: "3-1-2", category: "押さえ" },
    { ticket: "2-1-4", category: "押さえ" },
    { ticket: "3-1-4", category: "押さえ" }
  ],
  flow: [
    {
      ticket: "1-2-5",
      category: "流し",
      odds: 36.8,
      oddsText: "36.8倍（最終取得）",
      oddsSource: "boatrace-official-snapshot",
      oddsSavedAt: "2026-08-09T04:11:00.000Z",
      isFinalRetrievedOdds: true
    },
    {
      ticket: "1-2-6",
      category: "流し",
      odds: 42.7,
      oddsText: "42.7倍（最終取得）",
      oddsSource: "boatrace-official-snapshot",
      oddsSavedAt: "2026-08-09T04:11:00.000Z",
      isFinalRetrievedOdds: true
    },
    { ticket: "1-3-5", category: "流し" }
  ],
  hole: [
    { ticket: "4-1-2", category: "万舟・穴" },
    { ticket: "5-1-3", category: "万舟・穴" },
    { ticket: "6-1-2", category: "万舟・穴" }
  ]
};

const practicalTickets = [
  {
    ticket: "1-2-3",
    category: "本線",
    odds: 9.8,
    oddsText: "9.8倍（最終取得）",
    oddsSource: "official-last-retrieved",
    oddsSavedAt: "2026-08-09T05:11:00.000Z",
    isFinalRetrievedOdds: true
  },
  { ticket: "1-3-2", category: "本線" },
  { ticket: "1-2-4", category: "本線" },
  { ticket: "2-1-3", category: "押さえ" },
  { ticket: "3-1-2", category: "押さえ" },
  {
    ticket: "1-2-5",
    category: "流し",
    oddsText: "オッズ未取得",
    flowAnchor: "1-2",
    flowCommonReason,
    scenarioSummary: flowThirdFiveReason
  },
  {
    ticket: "1-2-6",
    category: "流し",
    oddsText: "オッズ未取得",
    flowAnchor: "1-2",
    flowCommonReason,
    scenarioSummary: flowThirdSixReason
  },
  {
    ticket: "3-4-1",
    category: "独立展開",
    selectionTier: "展開追加"
  }
];

const prediction = {
  mainSheet: {
    tickets: candidateSheets.main,
    coverTickets: candidateSheets.cover,
    flowTickets: candidateSheets.flow,
    flowFormations: [flowFormation],
    marker: "top-level-main-sheet"
  },
  manshuSheet: {
    tickets: candidateSheets.hole,
    marker: "top-level-manshu-sheet"
  },
  ticketSheets: candidateSheets,
  aiCore: {
    mainSheet: {
      tickets: candidateSheets.main,
      coverTickets: candidateSheets.cover,
      flowTickets: candidateSheets.flow,
      flowFormations: [flowFormation],
      marker: "ai-core-main-sheet"
    },
    manshuSheet: {
      tickets: candidateSheets.hole,
      marker: "ai-core-manshu-sheet"
    }
  },
  practicalSelection: {
    status: "selected",
    tickets: practicalTickets,
    expansionSummary: {
      normalCount: 7,
      addedCount: 1,
      finalCount: 8
    }
  },
  practicalTickets,
  formations: {
    main: ["1-2-3"],
    safety: ["2-1-3"]
  }
};

const originalSnapshot = structuredClone(prediction);
const resolved = boundary.resolveNormalDisplayRows(prediction);

assert.deepEqual(tickets(resolved.main), ["1-2-3", "1-3-2", "1-2-4"]);
assert.deepEqual(tickets(resolved.cover), ["2-1-3", "3-1-2"]);
assert.deepEqual(tickets(resolved.flow), ["1-2-5", "1-2-6"]);
assert.deepEqual(resolved.flow.map(item => item.flowAnchor), ["1-2", "1-2"]);
assert.deepEqual(
  resolved.flow.map(item => item.flowCommonReason),
  [flowCommonReason, flowCommonReason]
);
assert.deepEqual(
  resolved.flow.map(item => item.scenarioSummary),
  [flowThirdFiveReason, flowThirdSixReason]
);
assert.deepEqual(tickets(resolved.hole), []);

const prepared = boundary.prepare(prediction);

assert.deepEqual(tickets(prepared.mainSheet.tickets), ["1-2-3", "1-3-2", "1-2-4"]);
assert.deepEqual(tickets(prepared.mainSheet.coverTickets), ["2-1-3", "3-1-2"]);
assert.deepEqual(tickets(prepared.mainSheet.flowTickets), ["1-2-5", "1-2-6"]);
assert.deepEqual(tickets(prepared.manshuSheet.tickets), []);
assert.equal(prepared.mainSheet.marker, "top-level-main-sheet");
assert.equal(prepared.manshuSheet.marker, "top-level-manshu-sheet");

assert.deepEqual(tickets(prepared.aiCore.mainSheet.tickets), ["1-2-3", "1-3-2", "1-2-4"]);
assert.deepEqual(tickets(prepared.aiCore.mainSheet.coverTickets), ["2-1-3", "3-1-2"]);
assert.deepEqual(tickets(prepared.aiCore.mainSheet.flowTickets), ["1-2-5", "1-2-6"]);
assert.deepEqual(tickets(prepared.aiCore.manshuSheet.tickets), []);
assert.equal(prepared.aiCore.mainSheet.marker, "ai-core-main-sheet");
assert.equal(prepared.aiCore.manshuSheet.marker, "ai-core-manshu-sheet");

assert.deepEqual(
  prepared.mainSheet.flowFormations,
  [],
  "通常欄は流しformation 8点でなく根拠のある同一軸exact flow 2券を使う"
);
assert.deepEqual(prepared.aiCore.mainSheet.flowFormations, []);
assert.equal(prepared.mainSheet.tickets[0].odds, 12.4);
assert.equal(prepared.mainSheet.tickets[0].oddsText, "12.4倍（最終取得）");
assert.equal(prepared.mainSheet.tickets[0].oddsSource, "boatrace-official-snapshot");
assert.equal(
  prepared.mainSheet.tickets[0].oddsSavedAt,
  "2026-08-09T04:11:00.000Z",
  "後勝ちのlocal finalよりserver finalを優先する"
);
assert.equal(prepared.mainSheet.tickets[0].isFinalRetrievedOdds, true);
assert.equal(prepared.mainSheet.flowTickets[0].odds, 36.8);
assert.equal(prepared.mainSheet.flowTickets[0].oddsText, "36.8倍（最終取得）");
assert.equal(prepared.mainSheet.flowTickets[1].odds, 42.7);
assert.equal(prepared.mainSheet.flowTickets[1].oddsText, "42.7倍（最終取得）");
assert.deepEqual(
  prepared.mainSheet.flowTickets.map(item => item.flowCommonReason),
  [flowCommonReason, flowCommonReason],
  "同一軸2券の共通根拠を最終オッズの統合後も保持する"
);
assert.deepEqual(
  prepared.mainSheet.flowTickets.map(item => item.scenarioSummary),
  [flowThirdFiveReason, flowThirdSixReason],
  "3着艇ごとの異なる採用理由を保持する"
);

assert.equal(prepared.ticketSheets.main.length, 6, "候補プールは削らない");
assert.equal(prepared.ticketSheets.cover.length, 4, "候補プールは削らない");
assert.equal(prepared.ticketSheets.flow.length, 3, "流し詳細の物理候補は削らない");
assert.equal(prepared.ticketSheets.hole.length, 3, "候補プールは削らない");
assert.deepEqual(prepared.formations, prediction.formations);
assert.deepEqual(
  prediction.mainSheet.flowFormations,
  [flowFormation],
  "流し詳細が参照する原本formationは保持する"
);
assert.notStrictEqual(prepared, prediction);
assert.deepEqual(prediction, originalSnapshot, "表示境界は入力を変更しない");
assert.equal(
  [
    ...prepared.mainSheet.tickets,
    ...prepared.mainSheet.coverTickets,
    ...prepared.mainSheet.flowTickets,
    ...prepared.manshuSheet.tickets
  ].some(item => item.ticket === "3-4-1"),
  false,
  "独立展開は通常予想欄へ混ぜない"
);

const newerServer = boundary.mergeDisplayRows(
  [{ ticket: "2-3-4", category: "本線" }],
  [{
    ticket: "2-3-4",
    odds: 11.2,
    oddsText: "11.2倍（最終取得）",
    oddsSource: "boatrace-official-snapshot",
    oddsSavedAt: "2026-08-09T04:00:00.000Z",
    isFinalRetrievedOdds: true
  }, {
    ticket: "2-3-4",
    odds: 12.4,
    oddsText: "12.4倍（最終取得）",
    oddsSource: "boatrace-official",
    savedAt: "2026-08-09T04:30:00.000Z",
    isFinalRetrievedOdds: true
  }]
)[0];
assert.equal(newerServer.odds, 12.4);
assert.equal(newerServer.oddsText, "12.4倍（最終取得）");
assert.equal(newerServer.oddsSource, "boatrace-official");
assert.equal(
  newerServer.oddsSavedAt,
  "2026-08-09T04:30:00.000Z",
  "server final同士はsavedAtが新しい方を優先する"
);

const overLimitTickets = [
  ...[1, 2, 3, 4, 5].map(no => ({ ticket: `1-2-${no}`, category: "本線" })),
  ...[1, 2, 3, 4].map(no => ({ ticket: `2-1-${no}`, category: "押さえ" })),
  { ticket: "1-3-4", category: "流し" },
  { ticket: "1-3-5", category: "流し" },
  { ticket: "4-2-1", category: "万舟・穴" },
  { ticket: "5-2-1", category: "万舟・穴" }
];
const overLimit = boundary.prepare({
  practicalSelection: {
    status: "selected",
    tickets: overLimitTickets,
    expansionSummary: { normalCount: overLimitTickets.length }
  }
});
assert.deepEqual(tickets(overLimit.mainSheet.tickets), ["1-2-1", "1-2-2", "1-2-3"]);
assert.deepEqual(tickets(overLimit.mainSheet.coverTickets), ["2-1-1", "2-1-2"]);
assert.deepEqual(tickets(overLimit.mainSheet.flowTickets), ["1-3-4", "1-3-5"]);
assert.deepEqual(
  tickets(overLimit.manshuSheet.tickets),
  [],
  "流し2券成立時は表示境界でも通常穴を併用しない"
);

const duplicatedSelection = boundary.resolveNormalDisplayRows({
  practicalSelection: {
    status: "selected",
    tickets: [
      { ticket: "1-2-3", category: "本線", categories: ["流し"] },
      { ticket: "1-3-2", category: "本線" },
      { ticket: "1-2-3", category: "押さえ" },
      { ticket: "1-2-4", category: "本線" },
      { ticket: "2-1-3", category: "押さえ" },
      { ticket: "3-1-2", category: "押さえ" },
      { ticket: "1-3-4", category: "流し" },
      { ticket: "1-3-4", category: "万舟・穴" },
      { ticket: "1-3-5", category: "流し" },
      { ticket: "4-1-2", category: "万舟・穴" }
    ],
    expansionSummary: { normalCount: 10 }
  }
});
assert.deepEqual(
  tickets(duplicatedSelection.main),
  ["1-2-3", "1-3-2", "1-2-4"],
  "formal sourceの選択順を維持する"
);
assert.deepEqual(tickets(duplicatedSelection.cover), ["2-1-3", "3-1-2"]);
assert.deepEqual(tickets(duplicatedSelection.flow), ["1-3-4", "1-3-5"]);
assert.deepEqual(
  tickets(duplicatedSelection.hole),
  [],
  "同一ticketを別カテゴリへ重複表示せず、流し2券と通常穴を併用しない"
);

const compactPrediction = {
  practicalTickets: [
    { ticket: "3-1-2", category: "本線" },
    { ticket: "3-2-1", category: "本線" },
    { ticket: "3-1-4", category: "本線" },
    { ticket: "1-3-2", category: "押さえ" },
    { ticket: "2-3-1", category: "押さえ" },
    { ticket: "3-4-1", category: "流し" },
    { ticket: "3-4-2", category: "流し" },
    { ticket: "6-3-1", category: "万舟・穴" },
    { ticket: "4-3-1", category: "独立展開", selectionTier: "展開追加" }
  ]
};
const compactPrepared = boundary.prepare(compactPrediction);
assert.equal(compactPrepared.mainSheet.tickets.length, 3);
assert.equal(compactPrepared.mainSheet.coverTickets.length, 2);
assert.equal(compactPrepared.mainSheet.flowTickets.length, 2);
assert.equal(compactPrepared.manshuSheet.tickets.length, 0);
assert.deepEqual(
  tickets(compactPrepared.mainSheet.flowTickets),
  ["3-4-1", "3-4-2"],
  "practicalTicketsだけの保存形式でも同一軸exact flow 2券をcanonical sourceにする"
);

const legacySingleFlow =
  boundary.prepare({
    practicalTickets: [
      { ticket: "1-2-3", category: "本線" },
      { ticket: "1-2-4", category: "本線" },
      { ticket: "1-3-2", category: "本線" },
      { ticket: "2-1-3", category: "押さえ" },
      { ticket: "2-1-4", category: "押さえ" },
      { ticket: "1-3-5", category: "流し" },
      { ticket: "5-2-3", category: "万舟・穴" }
    ]
  });
assert.deepEqual(
  legacySingleFlow.mainSheet
    .flowTickets,
  [],
  "保存済み1券だけの行も流しとして再表示しない"
);
assert.deepEqual(
  tickets(
    legacySingleFlow.manshuSheet
      .tickets
  ),
  ["5-2-3"],
  "流しが2券そろわない場合は保存済み通常穴を残す"
);

const skippedInput = {
  mainSheet: {
    tickets: candidateSheets.main,
    coverTickets: candidateSheets.cover,
    flowTickets: candidateSheets.flow,
    flowFormations: [flowFormation]
  },
  manshuSheet: { tickets: candidateSheets.hole },
  ticketSheets: candidateSheets,
  practicalSelection: {
    status: "skipped",
    tickets: []
  },
  practicalTickets
};
const skippedSnapshot = structuredClone(skippedInput);
const skipped = boundary.prepare(skippedInput);
assert.deepEqual(skipped.mainSheet.tickets, []);
assert.deepEqual(skipped.mainSheet.coverTickets, []);
assert.deepEqual(skipped.mainSheet.flowTickets, []);
assert.deepEqual(skipped.mainSheet.flowFormations, []);
assert.deepEqual(skipped.manshuSheet.tickets, []);
assert.deepEqual(skippedInput, skippedSnapshot, "見送りでも入力を変更しない");

const selectorInput = {
  mainSheet: {
    tickets: [{ ticket: "1-2-3", category: "本線" }]
  }
};
let selectorCalls = 0;
const selectedByBoundary = boundary.prepare(selectorInput, {
  select() {
    selectorCalls += 1;
    return {
      status: "selected",
      tickets: [{ ticket: "1-2-3", category: "本線" }],
      expansionSummary: { normalCount: 1 }
    };
  }
});
assert.equal(selectorCalls, 1);
assert.equal(selectedByBoundary.mainSheet.tickets.length, 1);
assert.equal(selectedByBoundary.practicalSelection.status, "selected");
assert.equal(selectorInput.practicalSelection, undefined, "selector結果を入力へ書き込まない");

const unchanged = {
  mainSheet: prediction.mainSheet,
  ticketSheets: candidateSheets
};
assert.strictEqual(boundary.prepare(unchanged), unchanged);

console.log("normal ticket display boundary: ok");
