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

const context = {
  window: {},
  document: {
    head: fakeNode(),
    documentElement: fakeNode(),
    readyState: "complete",
    createElement() { return fakeNode(); },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  MutationObserver: class {
    observe() {}
  },
  console
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
assert.strictEqual(api.parseNotation("1-1-全"), null);
assert.strictEqual(api.parseNotation("1-23-4"), null);

console.log("flow odds tabs tests passed");
