"use strict";

require("./manshu-forecast-ledger");

const Module = require("node:module");

const originalLoad = Module._load;
const WRAPPED = Symbol.for("chappy.frameRiseFallReplayWrapped");

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function captureBasis(prediction = {}) {
  const core = prediction?.aiCore || {};
  const analyses = Array.isArray(core?.analyses) ? core.analyses : [];
  const raceScenarios = core?.raceScenarios || null;
  if (analyses.length < 6 || !raceScenarios?.mainScenario || !Array.isArray(raceScenarios?.scenarios)) {
    return null;
  }
  return {
    schemaVersion: 1,
    source: "pre-deadline-production-prediction",
    aiCoreVersion: String(core?.version || ""),
    analyses: clone(analyses),
    raceScenarios: clone(raceScenarios),
    courseMapping: clone(core?.courseMapping || null),
    raceFlow: clone(prediction?.raceFlow || null)
  };
}

function wrap(api) {
  if (!api || api[WRAPPED] || typeof api.select !== "function" || typeof api.compactAudit !== "function") {
    return api;
  }
  const originalSelect = api.select.bind(api);
  const originalCompactAudit = api.compactAudit.bind(api);
  const wrapped = { ...api };

  wrapped.select = function selectWithFrameReplayBasis(prediction) {
    const selection = originalSelect(prediction);
    const basis = captureBasis(prediction);
    return basis ? { ...selection, frameRiseFallReplayBasis: basis } : selection;
  };

  wrapped.compactAudit = function compactAuditWithFrameReplayBasis(selection) {
    const compact = originalCompactAudit(selection);
    const basis = selection?.frameRiseFallReplayBasis || null;
    return basis ? { ...compact, frameRiseFallReplayBasis: clone(basis) } : compact;
  };

  Object.defineProperty(wrapped, WRAPPED, { value: true });
  return wrapped;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (/(^|\/)practical-selection(?:\.js)?$/.test(String(request || ""))) {
    const wrapped = wrap(loaded);
    if (global.ChappyPracticalSelection === loaded || !global.ChappyPracticalSelection) {
      global.ChappyPracticalSelection = wrapped;
    }
    return wrapped;
  }
  return loaded;
};

module.exports = { captureBasis, wrap };
