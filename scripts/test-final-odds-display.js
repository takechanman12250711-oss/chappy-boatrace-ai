"use strict";

const assert = require("node:assert/strict");
const finalOdds = require("../js/final-odds-display.js");

const memory = new Map();
const storage = {
  getItem(key) {
    return memory.get(key) || null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  }
};

const livePrediction = {
  date: "20260804",
  stadiumCode: "12",
  raceNo: 10,
  race: {
    date: "20260804",
    stadiumCode: "12",
    raceNo: 10,
    status: "open"
  },
  ticketSheets: {
    main: [{ ticket: "1-2-3", odds: 8.4 }],
    cover: [{ ticket: "2-1-3", odds: 31.2 }],
    flow: [{ ticket: "1-2-4", odds: 18.6 }],
    hole: [{ ticket: "4-1-6", odds: 126.5 }],
    all: []
  },
  mainSheet: {
    tickets: [{ ticket: "1-2-3", odds: 8.4 }],
    coverTickets: [{ ticket: "2-1-3", odds: 31.2 }],
    flowTickets: [{ ticket: "1-2-4", odds: 18.6 }]
  },
  manshuSheet: {
    tickets: [{ ticket: "4-1-6", odds: 126.5 }]
  },
  aiCore: {
    mainSheet: {
      tickets: [{ ticket: "1-2-3", odds: 8.4 }],
      coverTickets: [{ ticket: "2-1-3", odds: 31.2 }],
      flowTickets: [{ ticket: "1-2-4", odds: 18.6 }]
    },
    manshuSheet: {
      tickets: [{ ticket: "4-1-6", odds: 126.5 }]
    }
  },
  finalAi: {
    ticketRanks: [{ ticket: "1-2-3", odds: 8.4 }],
    topTickets: [{ ticket: "2-1-3", odds: 31.2 }],
    manshuTickets: [{ ticket: "4-1-6", odds: 126.5 }]
  }
};

assert.equal(finalOdds.save(livePrediction, storage), true);

const endedPrediction = {
  ...livePrediction,
  race: {
    ...livePrediction.race,
    status: "finished"
  },
  ticketSheets: {
    ...livePrediction.ticketSheets,
    main: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
    cover: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }],
    flow: [{ ticket: "1-2-4", odds: 19.1 }],
    hole: [{ ticket: "4-1-6", odds: null, oddsText: "オッズ未取得" }]
  },
  mainSheet: {
    ...livePrediction.mainSheet,
    tickets: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
    coverTickets: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }],
    flowTickets: [{ ticket: "1-2-4", odds: 19.1 }]
  },
  manshuSheet: {
    tickets: [{ ticket: "4-1-6", odds: null, oddsText: "オッズ未取得" }]
  },
  aiCore: {
    mainSheet: {
      tickets: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
      coverTickets: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }],
      flowTickets: [{ ticket: "1-2-4", odds: null, oddsText: "オッズ未取得" }]
    },
    manshuSheet: {
      tickets: [{ ticket: "4-1-6", odds: null, oddsText: "オッズ未取得" }]
    }
  },
  finalAi: {
    ticketRanks: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
    topTickets: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }],
    manshuTickets: [{ ticket: "4-1-6", odds: null, oddsText: "オッズ未取得" }]
  }
};

const prepared = finalOdds.prepare(endedPrediction, storage);

assert.equal(prepared.ticketSheets.main[0].odds, 8.4);
assert.equal(prepared.ticketSheets.cover[0].odds, 31.2);
assert.equal(prepared.ticketSheets.flow[0].odds, 19.1);
assert.equal(prepared.ticketSheets.hole[0].odds, 126.5);
assert.equal(prepared.manshuSheet.tickets[0].odds, 126.5);
assert.equal(prepared.aiCore.mainSheet.tickets[0].odds, 8.4);
assert.equal(prepared.aiCore.mainSheet.coverTickets[0].odds, 31.2);
assert.equal(prepared.aiCore.mainSheet.flowTickets[0].odds, 19.1);
assert.equal(prepared.aiCore.manshuSheet.tickets[0].odds, 126.5);
assert.equal(prepared.finalAi.ticketRanks[0].odds, 8.4);
assert.equal(prepared.finalAi.topTickets[0].odds, 31.2);
assert.equal(prepared.finalAi.manshuTickets[0].odds, 126.5);
assert.equal(
  prepared.mainSheet.coverTickets[0].oddsText,
  "31.2倍（最終取得）"
);
assert.equal(
  prepared.manshuSheet.tickets[0].oddsText,
  "126.5倍（最終取得）"
);
assert.equal(prepared.finalOddsDisplay.label, "最終取得オッズ");
assert.notStrictEqual(prepared, endedPrediction);
assert.equal(endedPrediction.ticketSheets.main[0].odds, null);

const savedAfterPartialEnd = finalOdds.load(endedPrediction, storage);
assert.equal(savedAfterPartialEnd.byTicket["1-2-3"], 8.4);
assert.equal(savedAfterPartialEnd.byTicket["2-1-3"], 31.2);
assert.equal(savedAfterPartialEnd.byTicket["1-2-4"], 19.1);
assert.equal(savedAfterPartialEnd.byTicket["4-1-6"], 126.5);

const unknownRace = {
  ...endedPrediction,
  race: {
    date: "20260804",
    stadiumCode: "12",
    raceNo: 11,
    status: "finished"
  },
  raceNo: 11,
  ticketSheets: {
    main: [{ ticket: "1-2-3", odds: null }],
    cover: [{ ticket: "2-1-3", odds: null }],
    flow: [{ ticket: "1-2-4", odds: null }],
    hole: [{ ticket: "4-1-6", odds: null }],
    all: []
  },
  mainSheet: {
    tickets: [{ ticket: "1-2-3", odds: null }],
    coverTickets: [{ ticket: "2-1-3", odds: null }],
    flowTickets: [{ ticket: "1-2-4", odds: null }]
  },
  manshuSheet: {
    tickets: [{ ticket: "4-1-6", odds: null }]
  }
};
assert.strictEqual(finalOdds.prepare(unknownRace, storage), unknownRace);

const serverMemory = new Map();
const serverStorage = {
  getItem(key) {
    return serverMemory.get(key) || null;
  },
  setItem(key, value) {
    serverMemory.set(key, String(value));
  }
};
const serverSavedAt = "2026-08-09T04:11:00.000Z";
const serverPrediction = {
  ...unknownRace,
  ticketSheets: {
    ...unknownRace.ticketSheets,
    main: [{
      ticket: "1-2-3",
      odds: 9.7,
      oddsText: "9.7倍（最終取得）",
      oddsSource: "boatrace-official-snapshot",
      oddsSavedAt: serverSavedAt,
      isFinalRetrievedOdds: true
    }]
  },
  finalOddsDisplay: {
    available: true,
    label: "最終取得オッズ",
    source: "boatrace-official-snapshot",
    savedAt: serverSavedAt,
    isFinalRetrievedOdds: true
  }
};

assert.equal(
  finalOdds.save(
    serverPrediction,
    serverStorage
  ),
  true,
  "APIの最終オッズを端末fallbackにも保存する"
);
const storedServerSnapshot =
  finalOdds.load(
    serverPrediction,
    serverStorage
  );
assert.equal(
  storedServerSnapshot.source,
  "boatrace-official-snapshot",
  "API snapshotのsourceを端末保存で失わない"
);
assert.equal(
  storedServerSnapshot.savedAt,
  serverSavedAt,
  "API snapshotのsavedAtを端末保存で失わない"
);
assert.equal(
  storedServerSnapshot
    .isFinalRetrievedOdds,
  true,
  "API snapshotの最終取得識別子を端末保存で失わない"
);
const preparedServer =
  finalOdds.prepare(
    serverPrediction,
    serverStorage
  );
assert.equal(
  preparedServer
    .finalOddsDisplay.source,
  "boatrace-official-snapshot",
  "終了レース再描画でもAPI sourceを維持する"
);
assert.equal(
  preparedServer
    .finalOddsDisplay.savedAt,
  serverSavedAt,
  "終了レース再描画でもAPI savedAtを維持する"
);
assert.equal(
  preparedServer
    .ticketSheets.main[0]
    .oddsText,
  "9.7倍（最終取得）",
  "API最終オッズの表示ラベルを維持する"
);

const monotonicMemory = new Map();
const monotonicStorage = {
  getItem(key) {
    return monotonicMemory.get(key) || null;
  },
  setItem(key, value) {
    monotonicMemory.set(key, String(value));
  }
};
const newerPrediction = {
  ...serverPrediction,
  ticketSheets: {
    ...serverPrediction.ticketSheets,
    main: [{
      ticket: "1-2-3",
      odds: 8.4,
      oddsText: "8.4倍（最終取得）",
      oddsSource: "official-last-retrieved",
      oddsSavedAt: "2026-08-09T05:13:00.000Z",
      isFinalRetrievedOdds: true
    }]
  },
  finalOddsDisplay: {
    available: true,
    label: "最終取得オッズ",
    source: "official-last-retrieved",
    savedAt: "2026-08-09T05:13:00.000Z",
    isFinalRetrievedOdds: true
  }
};
const olderPrediction = {
  ...serverPrediction,
  ticketSheets: {
    ...serverPrediction.ticketSheets,
    main: [{
      ticket: "1-2-3",
      odds: 9.7,
      oddsText: "9.7倍（最終取得）",
      oddsSource: "boatrace-official-snapshot",
      oddsSavedAt: "2026-08-09T05:11:00.000Z",
      isFinalRetrievedOdds: true
    }]
  },
  finalOddsDisplay: {
    available: true,
    label: "最終取得オッズ",
    source: "boatrace-official-snapshot",
    savedAt: "2026-08-09T05:11:00.000Z",
    isFinalRetrievedOdds: true
  }
};
assert.equal(finalOdds.save(newerPrediction, monotonicStorage), true);
assert.equal(
  finalOdds.save(olderPrediction, monotonicStorage),
  false,
  "遅着した古いAPI snapshotで新しい端末保存値を巻き戻さない"
);
const monotonicPrepared = finalOdds.prepare(
  olderPrediction,
  monotonicStorage
);
assert.equal(
  monotonicPrepared.ticketSheets.main[0].odds,
  8.4,
  "終了画面も新しい端末保存値を優先する"
);
assert.equal(
  monotonicPrepared.finalOddsDisplay.savedAt,
  "2026-08-09T05:13:00.000Z",
  "終了画面の保存時刻も巻き戻さない"
);

const quotaStorage = {
  getItem() {
    return null;
  },
  setItem() {
    const error = new Error("quota full");
    error.name = "QuotaExceededError";
    throw error;
  }
};
assert.equal(
  finalOdds.save(serverPrediction, quotaStorage),
  false,
  "端末保存不可でも最終オッズ表示を例外終了させない"
);
assert.doesNotThrow(
  () => finalOdds.prepare(serverPrediction, quotaStorage),
  "localStorage容量不足で予想画面を壊さない"
);
assert.equal(
  finalOdds.raceKey({
    date: "20260809",
    raceNo: 6
  }),
  "",
  "開催場コード欠損を00として別レースと共有しない"
);

const mismatchedPrediction = {
  date: "20260804",
  stadiumCode: "12",
  raceNo: 11,
  race: {
    date: "20260804",
    stadiumCode: "12",
    raceNo: 11,
    status: "finished"
  },
  ticketSheets: {
    main: [{
      ticket: "4-5-6",
      odds: null,
      oddsText: "オッズ未取得"
    }]
  }
};
const mismatchedPrepared =
  finalOdds.prepare(
    mismatchedPrediction,
    serverStorage
  );
assert.strictEqual(
  mismatchedPrepared,
  mismatchedPrediction,
  "保存値と現在の予想券が一致しなければfallback利用可能扱いにしない"
);
assert.equal(
  mismatchedPrepared
    .ticketSheets.main[0]
    .oddsText,
  "オッズ未取得",
  "別の候補へ保存済みオッズを誤転記しない"
);
assert.equal(
  mismatchedPrepared
    .finalOddsDisplay,
  undefined,
  "1券も復元できなければ最終オッズavailableを付けない"
);

const boundary = require("../js/main-cover-display-boundary.js");
const previousLocalStorage = global.localStorage;
const previousDocument = global.document;
let wrappedDisplay = null;
try {
  global.localStorage = serverStorage;
  global.document = {
    getElementById(id) {
      return id === "raceModeSelect"
        ? { value: "review" }
        : null;
    }
  };
  const renderTarget = {
    ChappyPracticalSelection: {
      select() {
        throw new Error("保存済み正式選定があるため再計算しない");
      }
    },
    renderAll(prediction) {
      wrappedDisplay = {
        ...prediction,
        mainSheet:
          prediction.aiCore?.mainSheet ||
          prediction.mainSheet
      };
    },
    renderPrediction() {}
  };
  boundary.install(renderTarget);
  finalOdds.install(renderTarget);
  renderTarget.renderAll({
    ...unknownRace,
    practicalSelection: {
      status: "selected",
      tickets: [{ ticket: "1-2-3", category: "本線" }],
      expansionSummary: { normalCount: 1 }
    }
  });
} finally {
  if (previousLocalStorage === undefined) delete global.localStorage;
  else global.localStorage = previousLocalStorage;
  if (previousDocument === undefined) delete global.document;
  else global.document = previousDocument;
}
assert.equal(
  wrappedDisplay.ticketSheets.main[0].odds,
  9.7,
  "本番wrapper順でも端末fallbackを候補プールへ戻す"
);
assert.equal(
  wrappedDisplay.mainSheet.tickets[0].odds,
  9.7,
  "本番wrapper順でAI Core優先後も最終オッズを維持する"
);
assert.equal(
  wrappedDisplay.mainSheet.tickets.length,
  1,
  "wrapper統合後も正式選定の点数を変えない"
);

console.log("終了後の全分類最終取得オッズ表示: 合格");
