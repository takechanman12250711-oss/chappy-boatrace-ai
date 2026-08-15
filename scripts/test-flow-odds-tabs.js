"use strict";

const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync("js/flow-odds-tabs.js", "utf8");

const fakeNode = () => ({
  appendChild() {},
  querySelectorAll() { return []; },
  addEventListener() {},
  setAttribute() {},
  classList: { add() {} }
});

const documentObject = {
  head: fakeNode(),
  documentElement: fakeNode(),
  readyState: "complete",
  createElement() { return fakeNode(); },
  querySelectorAll() { return []; },
  addEventListener() {},
  getElementById() { return null; }
};
const context = {
  window: {
    document: documentObject,
    addEventListener() {},
    setTimeout,
    clearTimeout
  },
  document: documentObject,
  console,
  setTimeout,
  clearTimeout
};
context.window.window = context.window;
vm.runInNewContext(source, context, { filename: "flow-odds-tabs.js" });

const api = context.window.ChappyFlowOddsTabs;
assert(api, "ChappyFlowOddsTabs が公開されていません");

assert.deepStrictEqual(
  Array.from(api.parseNotation("1-23-全").tickets),
  [
    "1-2-3", "1-2-4", "1-2-5", "1-2-6",
    "1-3-2", "1-3-4", "1-3-5", "1-3-6"
  ]
);
assert.strictEqual(api.parseNotation("1-2-全").tickets.length, 4);
assert.strictEqual(api.parseNotation("1-234-全").tickets.length, 12);
assert.strictEqual(api.parseNotation("12-345-全").tickets.length, 24);
assert.strictEqual(api.parseNotation("4-23-全").tickets.length, 8);
assert.strictEqual(api.parseNotation("1-1-全"), null);
assert.strictEqual(api.parseNotation("1-23-4"), null);

assert.deepStrictEqual(
  api.resolveRaceParams({ jcd: "19", rno: 8, date: "20260815" }),
  { jcd: "19", rno: 8, date: "20260815" }
);
const map = api.oddsDataToMap({
  ok: true,
  available: true,
  byTicket: { "1-2-3": 10.1, "1-2-4": 5.5 }
});
assert.strictEqual(map.get("1-2-3"), "10.1倍");
assert.strictEqual(map.size, 2);
assert.strictEqual(
  source.includes("new MutationObserver"),
  false,
  "画面全体の常時MutationObserverを起動しない"
);
assert.strictEqual(
  source.includes("oddsCache.delete(key)"),
  true,
  "空・失敗オッズを固定キャッシュせず再試行可能にする"
);

console.log("flow odds tabs tests passed");
