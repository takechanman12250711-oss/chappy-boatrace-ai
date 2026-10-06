"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createHarness() {
  const pendingStats = deferred();
  const listeners = new Map();
  const windowListeners = new Map();
  const scripts = [];
  const replays = [];
  const errors = [];
  const status = { textContent: "unchanged" };
  let currentView = "race";
  let statsRequests = 0;
  function add(map, type, listener) {
    const list = map.get(type) || [];
    list.push(listener);
    map.set(type, list);
  }
  function dispatchView(view) {
    currentView = view;
    for (const listener of windowListeners.get("chappy:view-changed") || []) {
      listener({ detail: { view } });
    }
  }
  function click(target) {
    const replayed = target.dataset.chappyRuntimeReady === "true";
    let stopped = false;
    const event = {
      target: { closest: () => target },
      preventDefault() {}, stopImmediatePropagation() { stopped = true; }
    };
    for (const listener of listeners.get("click") || []) {
      listener(event);
      if (stopped) break;
    }
    if (!stopped) {
      if (replayed) replays.push(target.dataset.view || target.id);
      const view = target.dataset.view;
      if (view && view !== currentView) dispatchView(view);
    }
  }
  const target = (view, id = "") => ({
    id, dataset: view ? { view } : {},
    getAttribute: name => name === "href" && view ? `#${view}Section` : null,
    matches: () => false,
    click() { click(this); }
  });
  const document = {
    scripts,
    addEventListener: (type, listener) => add(listeners, type, listener),
    getElementById: () => status,
    head: {
      appendChild(script) {
        scripts.push(script);
        queueMicrotask(() => script.emit("load"));
      }
    },
    createElement() {
      const callbacks = new Map();
      return {
        src: "", dataset: {},
        addEventListener: (type, listener) => callbacks.set(type, listener),
        emit: type => callbacks.get(type)?.(),
        remove() { scripts.splice(scripts.indexOf(this), 1); }
      };
    }
  };
  const storage = { getItem() { return null; } };
  const window = {
    setTimeout, clearTimeout,
    addEventListener: (type, listener) => add(windowListeners, type, listener),
    ChappyStatsRuntime: { ensureReady() { statsRequests += 1; return pendingStats.promise; } },
    ChappyRaceControls: { initialize() {} },
    ChappyRaceSelection: { select() {} }
  };
  vm.runInNewContext(source, {
    window, document, localStorage: storage, sessionStorage: storage,
    console: { error: (...args) => errors.push(args) }
  }, { filename: "app-runtime-loader.js" });
  return {
    pendingStats, replays, status, errors, dispatchView,
    click: view => click(target(view)),
    clickAction: id => click(target("", id)),
    get currentView() { return currentView; },
    get statsRequests() { return statsRequests; }
  };
}

async function flush() { await new Promise(resolve => setImmediate(resolve)); }
async function finish(harness) { harness.pendingStats.resolve(true); await flush(); }

async function main() {
  const first = createHarness();
  first.click("result");
  await flush();
  assert.equal(first.currentView, "race", "cold stats click waits for required scripts");
  assert.equal(first.statsRequests, 1);
  await finish(first);
  assert.equal(first.currentView, "result", "current stats intent replays when ready");
  assert.deepEqual(first.replays, ["result"]);

  for (const nextView of ["race", "prediction"]) {
    const interrupted = createHarness();
    interrupted.click("result");
    interrupted.click(nextView);
    await flush();
    await finish(interrupted);
    assert.equal(interrupted.currentView, nextView, `newer ${nextView} navigation wins over cold stats replay`);
    assert.equal(interrupted.replays.includes("result"), false);
  }

  const reopened = createHarness();
  reopened.click("result");
  reopened.click("prediction");
  reopened.click("result");
  await finish(reopened);
  assert.deepEqual(reopened.replays, ["result"], "only latest result intent replays after away/back");
  assert.equal(reopened.currentView, "result");
  assert.equal(reopened.statsRequests, 1, "concurrent intents reuse one stats runtime load");

  const twice = createHarness();
  twice.click("result");
  twice.click("result");
  await finish(twice);
  assert.deepEqual(twice.replays, ["result"], "cold double click produces one current navigation replay");

  const eventNavigation = createHarness();
  eventNavigation.click("result");
  eventNavigation.dispatchView("prediction");
  await finish(eventNavigation);
  assert.equal(eventNavigation.currentView, "prediction", "view changes from other controls also invalidate stale stats intent");
  assert.deepEqual(eventNavigation.replays, []);

  const staleFailure = createHarness();
  staleFailure.click("result");
  await flush();
  staleFailure.click("prediction");
  staleFailure.pendingStats.reject(new Error("fixture stats failure"));
  await flush();
  assert.equal(staleFailure.currentView, "prediction");
  assert.equal(staleFailure.status.textContent, "unchanged", "stale stats failure does not replace another view's status");
  assert.equal(staleFailure.errors.length, 1, "stale failure remains available in diagnostic logging");

  const currentFailure = createHarness();
  currentFailure.click("result");
  await flush();
  currentFailure.pendingStats.reject(new Error("fixture stats failure"));
  await flush();
  assert.match(currentFailure.status.textContent, /fixture stats failure/, "current runtime failure remains visible");

  const action = createHarness();
  action.clickAction("fetchRaceBtn");
  action.click("prediction");
  await flush();
  assert.deepEqual(action.replays, ["fetchRaceBtn"], "unrelated action invocation retains its replay contract");
  assert.equal(action.currentView, "prediction");

  console.log("stats runtime navigation intent regression: passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
