"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "theory-improvement-dashboard.js"),
  "utf8"
);

const listeners = new Map();
const window = {
  addEventListener(name, handler) { listeners.set(name, handler); }
};
const document = {
  getElementById() { return null; },
  createElement() { return { id: "", textContent: "" }; },
  head: { appendChild() {} }
};

vm.runInNewContext(source, {
  window,
  document,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  console,
  setTimeout
});

const dashboard = window.ChappyTheoryImprovementDashboard;
assert.ok(dashboard, "dashboard API should be exposed");

const html = dashboard.renderHtml({
  performance: {
    byTheory: [
      { theoryKey: "wall", label: "壁艇理論", raceCount: 120, hitRate: 35.8, scenarioMatchRate: 61.7, recoveryRate: 108.4 }
    ]
  },
  proposals: {
    proposalCount: 2,
    approvalGate: { approvedCandidates: [{}, {}] }
  },
  production: {
    productionCandidate: true
  }
});

assert.match(html, /理論改善ダッシュボード/);
assert.match(html, /壁艇理論/);
assert.match(html, /本番採用候補あり/);
assert.match(html, /自動反映は行いません/);

const rows = dashboard.topTheoryRows({
  byTheory: Array.from({ length: 7 }, (_, index) => ({
    theoryKey: `t${index}`,
    raceCount: index
  }))
});
assert.equal(rows.length, 5);
assert.equal(rows[0].raceCount, 6);
assert.equal(dashboard.statusLabel({ overall: { comparableCount: 12 } }), "検証中（12R）");
assert.equal(dashboard.statusLabel({}), "データ蓄積中");

console.log("theory improvement dashboard tests passed");
