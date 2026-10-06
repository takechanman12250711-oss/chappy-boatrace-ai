"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const autoStats = require("../js/auto-stats");
const source = fs.readFileSync(path.join(__dirname, "..", "js/result-ui-phase5.js"), "utf8");

async function render(report, ok = true) {
  let card;
  const element = () => ({ children: [], style: {}, appendChild(child) { this.children.push(child); }, textContent: "" });
  const area = { children: [], isConnected: true, before(value) { card = value; } };
  const document = { baseURI: "https://preview.example/", readyState: "loading",
    head: { appendChild() {} }, addEventListener() {}, createElement: element,
    getElementById: id => id === "statsArea" ? area : id === "candidate24Performance" ? card : null };
  const window = { ChappyAutoStats: autoStats, addEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} } };
  const context = vm.createContext({ window, document, URL,
    MutationObserver: window.MutationObserver, fetch: async () => ({ ok, json: async () => report }) });
  vm.runInContext(source, context);
  window.ChappyResultUiPhase5.install();
  await new Promise(resolve => setImmediate(resolve));
  const text = node => [node.textContent, ...(node.children || []).map(text)].join(" ");
  return text(card);
}

(async () => {
  const report = { version: "candidate24-report-v1", from: "20260728", to: "20261006", generatedAt: "2026-10-06T15:50:06Z",
    candidate24: { races: 535, hitRate: 39.4, recoveryRate: 65.7 }, practical: { races: 535, hitRate: 22.6, recoveryRate: 71.1 },
    pending: 1, excludedRefundOrVoid: 34, unknownPayout: 0 };
  const good = await render(report);
  assert.match(good, /2026-10-07 00:50 JST/);
  assert.match(good, /結果待ち 1R/);
  assert.match(good, /返還・不成立除外 34R/);
  assert.match(good, /払戻未確認 0R/);
  assert.match(good, /39.4%/);
  const missing = await render({ ...report, pending: null, excludedRefundOrVoid: undefined, unknownPayout: "" });
  assert.match(missing, /結果待ち 未確認/);
  assert.match(missing, /返還・不成立除外 未確認/);
  assert.doesNotMatch(missing, /払戻未確認 0R/);
  const zero = await render({ ...report, candidate24: { races: 0, hitRate: 0, recoveryRate: 0 } });
  assert.match(zero, /最大24点候補：的中率 — ／ 回収率 —（0R）/);
  assert.match(await render({}, true), /集計を取得できません/);
  assert.match(await render(null, false), /集計を取得できません/);
  console.log("candidate24 evidence and unavailable-state rendering: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
