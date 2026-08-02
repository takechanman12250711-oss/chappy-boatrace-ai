"use strict";
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync("js/theory-improvement-dashboard.js", "utf8");
const sandbox = { window: { addEventListener() {}, setTimeout() {} }, document: {}, fetch: async () => ({ ok: true, json: async () => ({}) }), console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.window.ChappyTheoryImprovementDashboard;
assert(api, "dashboard api missing");
const html = api.renderHtml({
  performance: { byTheory: [] },
  proposals: { proposalCount: 2, approvalGate: { approvedCandidates: [{}] } },
  production: { productionCandidate: true, overall: { comparableCount: 120, aWins: 20, bWins: 40 } },
  approval: { humanApproved: true, adoptionAllowed: true },
  rollout: { enabled: true, rolloutPercent: 10, status: "canary-ready" },
  monitor: { status: "healthy", stopRequested: false },
  stopDecision: { status: "monitoring-canary", nextAction: "監視継続" }
});
assert(html.includes("運用管理"));
assert(html.includes("10%"));
assert(html.includes("監視継続"));
assert(html.includes("表示専用"));
assert.strictEqual(api.operationState({ monitor: { stopRequested: true } }), "停止対応が必要");
console.log("theory operation panel test passed");
