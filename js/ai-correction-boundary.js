/* =========================================================
  チャッピーボートレースAI
  AI補正境界

  ボートレース理論で確定した印・買い目を保護し、
  AI補正は信頼度・危険度・注意情報だけに限定する。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyAICorrectionBoundary = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const ALLOWED_FIELDS = Object.freeze([
    "confidence",
    "danger",
    "dangerScore",
    "warnings",
    "reasons",
    "dataStatus",
    "summary"
  ]);

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotTheory(prediction) {
    return {
      marks: clone(prediction?.marks || null),
      formations: clone({
        axis: prediction?.formations?.axis || null,
        main: prediction?.formations?.main || [],
        safety: prediction?.formations?.safety || [],
        flow: prediction?.formations?.flow || [],
        longshot: prediction?.formations?.longshot || [],
        flowFormations: prediction?.formations?.flowFormations || [],
        evidence: prediction?.formations?.evidence || null,
        mainEstablished: Boolean(prediction?.formations?.mainEstablished)
      })
    };
  }

  function sameTheory(prediction, snapshot) {
    return JSON.stringify(snapshotTheory(prediction)) === JSON.stringify(snapshot);
  }

  function sanitizeCorrection(correction) {
    const source = correction && typeof correction === "object"
      ? correction
      : {};
    const result = {};

    ALLOWED_FIELDS.forEach(key => {
      if (source[key] !== undefined) result[key] = clone(source[key]);
    });

    return result;
  }

  function protect(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const snapshot = snapshotTheory(prediction);
    Object.defineProperty(prediction, "theoryBoundary", {
      value: Object.freeze({
        source: "raceScenarios",
        protectedFields: Object.freeze([
          "marks",
          "formations.axis",
          "formations.main",
          "formations.safety",
          "formations.flow",
          "formations.longshot",
          "formations.flowFormations"
        ]),
        snapshot
      }),
      enumerable: true,
      configurable: true,
      writable: false
    });

    return prediction;
  }

  function restoreTheory(prediction, snapshot) {
    prediction.marks = clone(snapshot.marks);
    prediction.formations = {
      ...(prediction.formations || {}),
      ...clone(snapshot.formations)
    };
    return prediction;
  }

  function apply(prediction, correction) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const protectedPrediction = prediction.theoryBoundary
      ? prediction
      : protect(prediction);
    const snapshot = protectedPrediction.theoryBoundary.snapshot;

    protectedPrediction.aiCorrection = Object.freeze({
      role: "audit-only",
      allowedFields: ALLOWED_FIELDS,
      ...sanitizeCorrection(correction)
    });

    if (!sameTheory(protectedPrediction, snapshot)) {
      restoreTheory(protectedPrediction, snapshot);
    }

    return protectedPrediction;
  }

  function install(root) {
    const core = root?.ChappyAICore;
    if (!core || core.__theoryBoundaryInstalled) return false;
    if (typeof core.buildPredictionData !== "function") return false;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    const wrapped = function (...args) {
      return protect(originalBuildPredictionData(...args));
    };

    const patched = {
      ...core,
      buildPredictionData: wrapped,
      applyAiCorrection: apply,
      protectTheoryPrediction: protect,
      __theoryBoundaryInstalled: true
    };

    root.ChappyAICore = Object.freeze(patched);
    return true;
  }

  return {
    allowedFields: ALLOWED_FIELDS,
    snapshotTheory,
    sameTheory,
    sanitizeCorrection,
    protect,
    apply,
    install
  };
});
