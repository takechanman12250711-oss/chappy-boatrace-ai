// チャッピーボートレースAI
// AI Coreの展開シナリオ由来の印・買い目を、最終prediction出力へ統一して接続する。
(function () {
  "use strict";

  if (window.__CHAPPY_SCENARIO_OUTPUT_BRIDGE_INSTALLED__) return;
  window.__CHAPPY_SCENARIO_OUTPUT_BRIDGE_INSTALLED__ = true;

  function boatFromMark(mark, fallback) {
    if (!mark) return fallback || null;
    if (typeof mark === "number") return { boatNo: mark };
    return mark;
  }

  function buildMainSheet(prediction, core) {
    const marks = core?.marks || {};
    const formations = core?.formations || {};
    const current = prediction?.mainSheet || {};

    return {
      ...current,
      honmei: boatFromMark(marks.honmei, current.honmei),
      taikou: boatFromMark(marks.taikou, current.taikou),
      ana: boatFromMark(marks.ana, current.ana),
      osae: boatFromMark(marks.osae, current.osae),
      tickets: Array.isArray(formations.main) ? formations.main.slice() : (current.tickets || []),
      coverTickets: Array.isArray(formations.safety) ? formations.safety.slice() : (current.coverTickets || []),
      flowTickets: Array.isArray(formations.flow) ? formations.flow.slice() : (current.flowTickets || []),
      scenario: marks.scenario || core?.raceScenarios?.mainScenario?.label || current.scenario || "",
      confidence: marks.confidence ?? core?.raceScenarios?.confidence ?? current.confidence,
      evidence: marks.evidence || current.evidence || null,
      source: "ai-core-race-scenarios"
    };
  }

  function buildManshuSheet(prediction, core) {
    const formations = core?.formations || {};
    const current = prediction?.manshuSheet || {};
    return {
      ...current,
      tickets: Array.isArray(formations.longshot) ? formations.longshot.slice() : (current.tickets || []),
      source: "ai-core-race-scenarios"
    };
  }

  function buildFormation(prediction, core) {
    const formations = core?.formations || {};
    const current = prediction?.formation || {};
    return {
      ...current,
      main: Array.isArray(formations.main) ? formations.main.slice() : (current.main || []),
      cover: Array.isArray(formations.safety) ? formations.safety.slice() : (current.cover || []),
      nagashi: Array.isArray(formations.flow) ? formations.flow.slice() : (current.nagashi || []),
      hole: Array.isArray(formations.longshot) ? formations.longshot.slice() : (current.hole || []),
      axis: formations.axis || current.axis || null,
      mainEstablished: formations.mainEstablished ?? current.mainEstablished,
      evidence: formations.evidence || current.evidence || null,
      source: "ai-core-race-scenarios"
    };
  }

  function enhance(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const core = prediction.aiCore || {};
    if (!core.raceScenarios && !core.marks && !core.formations) return prediction;

    return {
      ...prediction,
      raceScenarios: core.raceScenarios || prediction.raceScenarios,
      marks: core.marks || prediction.marks,
      formations: core.formations || prediction.formations,
      mainSheet: buildMainSheet(prediction, core),
      manshuSheet: buildManshuSheet(prediction, core),
      formation: buildFormation(prediction, core),
      predictionSource: "ai-core-race-scenarios"
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappyScenarioOutputBridgeWrapped) return false;

    function wrappedCreatePrediction(data) {
      return enhance(base(data));
    }

    wrappedCreatePrediction.__chappyScenarioOutputBridgeWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  const api = { enhance, buildMainSheet, buildManshuSheet, buildFormation, install };
  window.ChappyPredictionScenarioOutputBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (!install()) {
    document.addEventListener("DOMContentLoaded", install, { once: true });
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
  }
})();
