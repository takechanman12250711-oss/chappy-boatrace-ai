// js/hiyori-runtime-diagnostics.js
// 日和学習・検証・承認パイプラインの接続・起動状態を自己診断する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const STATUS_KEY = "chappy_hiyori_runtime_diagnostics_v1";
  const REQUIRED = [
    { name: "learningSnapshot", globalName: "ChappyHiyoriLearningSnapshot", outputKeys: ["chappy_hiyori_learning_snapshots_v1"] },
    { name: "learningCorrelation", globalName: "ChappyHiyoriLearningCorrelation", outputKeys: ["chappy_hiyori_learning_correlation_v1"] },
    { name: "correlationConfidence", globalName: "ChappyHiyoriCorrelationConfidence", outputKeys: ["chappy_hiyori_correlation_confidence_v1"] },
    { name: "adoptionCandidates", globalName: "ChappyHiyoriLearningAdoptionCandidates", outputKeys: ["chappy_hiyori_learning_adoption_candidates_v1", "chappy_hiyori_adoption_candidates_v1"] },
    { name: "adoptionProposals", globalName: "ChappyHiyoriAdoptionProposals", outputKeys: ["chappy_hiyori_adoption_proposals_v1", "chappy_hiyori_change_proposals_v1"] },
    { name: "proposalApproval", globalName: "ChappyHiyoriProposalApproval", outputKeys: ["chappy_hiyori_proposal_approvals_v1"] },
    { name: "shadowValidation", globalName: "ChappyHiyoriShadowValidation", outputKeys: ["chappy_hiyori_shadow_validation_v1"] },
    { name: "shadowPerformance", globalName: "ChappyHiyoriShadowPerformance", outputKeys: ["chappy_hiyori_shadow_performance_grade_v1", "chappy_hiyori_shadow_performance_v1"] },
    { name: "productionReadiness", globalName: "ChappyHiyoriProductionReadiness", outputKeys: ["chappy_hiyori_production_readiness_v1"] },
    { name: "finalPackage", globalName: "ChappyHiyoriFinalApprovalPackage", outputKeys: ["chappy_hiyori_final_approval_packages_v1"] },
    { name: "rollback", globalName: "ChappyHiyoriProductionRollback", outputKeys: ["chappy_hiyori_rollback_snapshots_v1", "chappy_hiyori_production_snapshots_v1"] },
    { name: "checklist", globalName: "ChappyHiyoriProductionChecklist", outputKeys: ["chappy_hiyori_production_checklist_v1", "chappy_hiyori_final_checklist_v1"] },
    { name: "simulator", globalName: "ChappyHiyoriProductionSimulator", outputKeys: [] },
    { name: "presentation", globalName: "ChappyHiyoriFinalPresentation", outputKeys: ["chappy_hiyori_final_presentations_v1"] },
    { name: "finalApproval", globalName: "ChappyHiyoriFinalApproval", outputKeys: ["chappy_hiyori_final_approvals_v1"] }
  ];

  function keyExists(key) {
    try { return localStorage.getItem(key) !== null; } catch (_) { return false; }
  }

  function run() {
    const modules = {};
    const activation = {};
    const missing = [];

    REQUIRED.forEach(item => {
      const loaded = Boolean(window[item.globalName]);
      const existingKeys = item.outputKeys.filter(keyExists);
      modules[item.name] = loaded;
      activation[item.name] = {
        loaded,
        globalName: item.globalName,
        expectedOutputKeys: item.outputKeys,
        existingOutputKeys: existingKeys,
        outputDetected: item.outputKeys.length === 0 ? null : existingKeys.length > 0
      };
      if (!loaded) missing.push(item.name);
    });

    const rollback = window.ChappyHiyoriProductionRollback;
    const config = rollback?.currentConfig?.() || {};
    const loadedCount = Object.values(modules).filter(Boolean).length;
    const result = {
      checkedAt: new Date().toISOString(),
      connected: missing.length === 0,
      loadedCount,
      requiredCount: REQUIRED.length,
      modules,
      activation,
      missing,
      productionApplied: config.productionApplied === true,
      appliedToPrediction: config.appliedToPrediction === true,
      globalProductionLock: config.globalProductionLock !== false,
      safe: missing.length === 0 && config.productionApplied !== true && config.appliedToPrediction !== true && config.globalProductionLock !== false
    };

    localStorage.setItem(STATUS_KEY, JSON.stringify(result));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-runtime-diagnostics", { detail: result }));
    if (!result.safe) console.warn("[hiyori-runtime-diagnostics]", result);
    else console.info("[hiyori-runtime-diagnostics] OK", result);
    return result;
  }

  window.ChappyHiyoriRuntimeDiagnostics = {
    run,
    required: () => REQUIRED.map(item => ({ ...item, outputKeys: item.outputKeys.slice() })),
    status: () => JSON.parse(localStorage.getItem(STATUS_KEY) || "null")
  };
  window.addEventListener("chappy:hiyori-runtime-ready", () => setTimeout(run, 0));
  window.addEventListener("storage", event => {
    if (event.key && event.key.startsWith("chappy_hiyori_")) setTimeout(run, 0);
  });
  if (document.readyState === "complete") setTimeout(run, 0);
})();