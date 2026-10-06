"use strict";

// Exercise the real navigation and stats lifecycle without a browser or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rootPath = path.join(__dirname, "..");
require("./test-stats-runtime-navigation-intent.js");

function eventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, listener, options = {}) {
      const entries = listeners.get(type) || [];
      entries.push({ listener, once: options?.once === true });
      listeners.set(type, entries);
    },
    dispatchEvent(event) {
      for (const entry of [...(listeners.get(event.type) || [])]) {
        if (entry.once) {
          listeners.set(event.type, listeners.get(event.type).filter(row => row !== entry));
        }
        entry.listener(event);
      }
      return true;
    }
  };
}

function element(extra = {}) {
  return eventTarget({
    dataset: {}, hidden: false, textContent: "", innerHTML: "",
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    ...extra
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createHarness() {
  const gate = deferred();
  let runtimeError = null;
  let fetchCount = 0;
  const events = [];
  const nav = element();
  const items = ["race", "prediction", "result"].map(view => element({ dataset: { view } }));
  const nodes = new Map([
    ["homeDashboardV2", element({ dataset: { shellReady: "true" } })],
    ["raceSection", element()],
    ["predictionSection", element({ hidden: true })],
    ["resultSection", element({ hidden: true })],
    ["statsArea", element()],
    ["resultSyncStatus", element()]
  ]);
  const document = eventTarget({
    readyState: "loading", visibilityState: "visible",
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === ".bottom-nav" ? nav
      : selector === 'a[href="#resultSection"]' ? items[2] : null,
    querySelectorAll: selector => selector === ".bottom-nav-item" ? items : []
  });
  const storage = { getItem() { return null; } };
  const window = eventTarget({
    document, setTimeout, clearTimeout, AbortController,
    requestAnimationFrame() {},
    ChappyAppRuntime: { ensure: () => runtimeError ? Promise.reject(runtimeError) : Promise.resolve(true) },
    ChappyUtils: {
      round: (value, precision = 1) => Math.round(value * 10 ** precision) / 10 ** precision,
      safeNumber: value => Number(value) || 0,
      escapeHtml: value => String(value ?? ""),
      safeText: value => String(value ?? ""),
      setHtml: (id, html) => { nodes.get(id).innerHTML = html; }
    },
    ChappyStorage: { loadResults: () => [], loadPredictionHistory: () => [] },
    ChappyAutoStats: { normalizeIndex: payload => payload }
  });
  for (const type of ["chappy:view-changed", "chappy:stats-hydrating", "chappy:stats-updated"]) {
    window.addEventListener(type, event => events.push({ type, view: event.detail?.view }));
  }
  const context = vm.createContext({
    window, document, localStorage: storage, sessionStorage: storage,
    console: { error() {}, warn() {} },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    fetch: async url => {
      fetchCount += 1;
      await gate.promise;
      return { ok: true, json: async () => String(url).includes("race-review-progress")
        ? { version: "race-review-progress-v1" }
        : { predictions: [], results: [], runs: [], shadowV2Predictions: [] } };
    }
  });
  const run = name => vm.runInContext(fs.readFileSync(path.join(rootPath, "js", name), "utf8"), context, { filename: name });
  run("home-dashboard-v2.js");
  document.dispatchEvent({ type: "DOMContentLoaded" });
  document.readyState = "complete";
  run("stats.js");
  const click = view => {
    const item = items.find(row => row.dataset.view === view);
    const event = { type: "click", target: { closest: () => item }, preventDefault() {} };
    // A runtime-ready replay reaches the anchor before bubbling to home navigation.
    item.dispatchEvent(event);
    nav.dispatchEvent(event);
  };
  const status = () => {
    const node = nodes.get("resultSyncStatus");
    return { text: node.textContent, hidden: node.hidden, state: node.dataset.state };
  };
  return {
    window, nodes, gate, click, status, events,
    get fetchCount() { return fetchCount; },
    failRuntime(error) { runtimeError = error; }
  };
}

async function flush() {
  await new Promise(resolve => setImmediate(resolve));
}

async function finish(harness) {
  harness.gate.resolve();
  await harness.window.ChappyStats.initStatsEvents();
  await flush();
}

async function main() {
  const first = createHarness();
  first.click("result");
  assert.equal(first.nodes.get("resultSection").hidden, false, "first open shows results");
  assert.match(first.status().text, /読み込んでいます/, "stats hydration owns first loading text");
  first.click("result");
  first.click("result");
  assert.equal(first.events.filter(row => row.type === "chappy:stats-hydrating").length, 1, "rapid repeat clicks do not duplicate hydration");
  assert.equal(first.fetchCount, 3, "one request for each core stats input");
  await finish(first);
  assert.match(first.nodes.get("statsArea").innerHTML, /data-results-analysis-dashboard/, "zero-data dashboard is rendered");
  assert.equal(first.status().state, "ready", "zero official targets reach a terminal status");
  assert.equal(first.status().hidden, true, "completed no-target status is hidden");
  const ready = first.status();
  first.click("result");
  first.click("result");
  await flush();
  assert.deepEqual(first.status(), ready, "loaded result re-taps cannot revive stale loading text");
  assert.equal(first.events.filter(row => row.type === "chappy:view-changed" && row.view === "result").length, 1, "same-tab clicks preserve the existing no-extra-view-event contract");
  first.click("prediction");
  first.click("result");
  await flush();
  assert.deepEqual(first.status(), ready, "reopening results returns to terminal status");
  assert.equal(first.fetchCount, 3, "reopening does not fetch the stats inputs again");

  const interrupted = createHarness();
  interrupted.click("result");
  interrupted.click("prediction");
  await finish(interrupted);
  assert.equal(interrupted.nodes.get("resultSection").hidden, true, "late hydration does not navigate back to results");
  interrupted.click("result");
  await flush();
  assert.equal(interrupted.status().hidden, true, "reentry after background completion clears loading via actual sync lifecycle");
  assert.equal(interrupted.status().state, "ready");

  const failed = createHarness();
  failed.click("result");
  failed.gate.reject(new Error("fixture data unavailable"));
  await failed.window.ChappyStats.initStatsEvents();
  await flush();
  assert.match(failed.nodes.get("statsArea").innerHTML, /fixture data unavailable/, "failed data stays explicitly unavailable rather than silently becoming zero");
  assert.doesNotMatch(failed.status().text, /結果分析を読み込んでいます/, "data failure cannot strand general loading text");
  const failedStatus = failed.status();
  failed.click("result");
  await flush();
  assert.deepEqual(failed.status(), failedStatus, "re-tap preserves the settled data-failure state");

  first.failRuntime(new Error("fixture runtime unavailable"));
  first.click("result");
  await flush();
  assert.equal(first.status().hidden, false, "runtime error remains visible without navigation's loading write");
  assert.equal(first.status().state, "warning", "runtime error does not retain stale ready styling");
  assert.match(first.status().text, /読み込めませんでした/, "runtime error has a terminal retry message");
  console.log("stats navigation loading lifecycle regression: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
