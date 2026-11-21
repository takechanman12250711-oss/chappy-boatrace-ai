"use strict";
const path = require("node:path");
const {Worker, isMainThread, parentPort} = require("node:worker_threads");
const monitor = require("./build-strong-escape-post-adoption-monitor");

if (!isMainThread) {
  parentPort.on("message", message => {
    if (message.type === "finish") {
      parentPort.postMessage({type: "done"});
      parentPort.close();
      return;
    }
    try {
      parentPort.postMessage({type: "result", id: message.id, sample: monitor.evaluateComparison(message.event)});
    } catch (error) {
      parentPort.postMessage({type: "result", id: message.id, error: error?.stack || String(error)});
    }
  });
  parentPort.postMessage({type: "ready"});
}

function validSample(sample, payout) {
  const fields = ["settledPostAdoptionRaces", "comparable", "changed", "trimApplied", "veryStrongTrim", "productionHit", "counterfactualHit", "productionStake", "counterfactualStake", "productionTicketCount", "counterfactualTicketCount", "payout"];
  if (!sample || typeof sample !== "object" || Object.keys(sample).sort().join("|") !== fields.sort().join("|")) return false;
  if (sample.settledPostAdoptionRaces !== 1 || sample.comparable !== true || !Object.is(sample.payout, payout)) return false;
  if (!["changed", "trimApplied", "veryStrongTrim", "productionHit", "counterfactualHit"].every(key => typeof sample[key] === "boolean")) return false;
  if ((sample.changed || sample.veryStrongTrim) && !sample.trimApplied) return false;
  return ["production", "counterfactual"].every(prefix => Number.isInteger(sample[prefix + "TicketCount"]) && sample[prefix + "TicketCount"] >= 0 && sample[prefix + "Stake"] === sample[prefix + "TicketCount"] * 100);
}

async function buildParallel({workerFile = __filename} = {}) {
  const state = monitor.createAccumulator();
  const slots = [];
  let aborting = false, failure = null, nextId = 0;
  function fail(error) {
    failure ||= error;
    for (const slot of slots) {
      if (!slot.ready) slot.rejectReady(failure);
      if (slot.active) {slot.active.reject(failure); slot.active = null;}
    }
  }
  function observed(promise) {promise.catch(() => {}); return promise;}
  function submit(event) {
    if (failure) return observed(Promise.reject(failure));
    const slot = slots.find(value => value.ready && !value.active && !value.finishing);
    if (!slot) return observed(Promise.reject(new Error("strong monitor worker capacity exceeded")));
    return observed(new Promise((resolve, reject) => {
      const id = ++nextId;
      slot.active = {id, date: event.date, payout: event.payout, resolve, reject};
      try {slot.worker.postMessage({type: "job", id, event});} catch (error) {fail(error);}
    }));
  }
  try {
    // The parent alone scans canonical sources and decides deduplication.
    // At most two comparisons run, each retaining both original generations.
    for (let index = 0; index < 2; index += 1) {
      const worker = new Worker(path.resolve(workerFile));
      const slot = {worker, active: null, ready: false, finishing: false, done: false};
      slot.readyPromise = new Promise((resolve, reject) => {slot.resolveReady = resolve; slot.rejectReady = reject;});
      observed(slot.readyPromise);
      slot.exitPromise = new Promise(resolve => {slot.resolveExit = resolve;});
      slots.push(slot);
      worker.on("message", response => {
        if (response?.type === "ready" && !slot.ready && !slot.finishing) {
          slot.ready = true; slot.resolveReady(); return;
        }
        if (response?.type === "done" && slot.finishing && !slot.active && !slot.done) {
          slot.done = true; return;
        }
        if (response?.type !== "result" || !slot.ready || slot.finishing || !slot.active || response.id !== slot.active.id) {
          fail(new Error("strong monitor worker response identity or phase mismatch")); return;
        }
        const active = slot.active; slot.active = null;
        if (response.error) {active.reject(new Error(response.error)); fail(new Error(response.error));}
        else if (!validSample(response.sample, active.payout)) {
          const error = new Error("strong monitor worker sample contract mismatch"); active.reject(error); fail(error);
        } else active.resolve({type: "sample", date: active.date, sample: response.sample});
      });
      worker.on("error", fail);
      worker.on("exit", code => {
        if (!aborting && (!slot.done || code !== 0)) fail(new Error("strong monitor worker exited before completion: " + code));
        slot.resolveExit();
      });
    }
    await Promise.all(slots.map(slot => slot.readyPromise));
    if (failure) throw failure;
    let pending = [], comparisons = 0;
    async function flush() {
      const events = await Promise.all(pending);
      if (failure) throw failure;
      // Date, observation and comparison results reduce in original serial order.
      for (const event of events) monitor.applyEvent(state, event);
      pending = []; comparisons = 0;
    }
    for (const event of monitor.comparisonEvents()) {
      if (failure) throw failure;
      if (event.type === "comparison") {pending.push(submit(event)); comparisons += 1;}
      else pending.push(Promise.resolve(event));
      if (comparisons === 2 || pending.length >= 256) await flush();
    }
    if (pending.length) await flush();
    if (failure) throw failure;
    for (const slot of slots) {slot.finishing = true; slot.worker.postMessage({type: "finish"});}
    await Promise.all(slots.map(slot => slot.exitPromise));
    if (failure || slots.some(slot => !slot.done)) throw failure || new Error("strong monitor workers did not complete");
    return monitor.saveReport(state);
  } finally {
    aborting = true;
    await Promise.allSettled(slots.map(slot => slot.worker.terminate()));
  }
}

module.exports = {buildParallel};
