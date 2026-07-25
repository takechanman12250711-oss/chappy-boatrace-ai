// js/hiyori-runtime-diagnostics.js
// 日和学習・検証・承認パイプラインの接続状態を自己診断する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const STATUS_KEY = "chappy_hiyori_runtime_diagnostics_v1";
  const REQUIRED = [
    ["shadowValidation", "ChappyHiyoriShadowValidation"],
    ["shadowPerformance", "ChappyHiyoriShadowPerformance"],
    ["productionReadiness", "ChappyHiyoriProductionReadiness"],
    ["finalPackage", "ChappyHiyoriFinalApprovalPackage"],
    ["rollback", "ChappyHiyoriProductionRollback"],
    ["checklist", "ChappyHiyoriProductionChecklist"],
    ["simulator", "ChappyHiyoriProductionSimulator"],
    ["presentation", "ChappyHiyoriFinalPresentation"],
    ["finalApproval", "ChappyHiyoriFinalApproval"]
  ];

  function run() {
    const modules = Object.fromEntries(REQUIRED.map(([name, globalName]) => [name, Boolean(window[globalName])]));
    const missing = Object.entries(modules).filter(([, loaded]) => !loaded).map(([name]) => name);
    const rollback = window.ChappyHiyoriProductionRollback;
    const config = rollback?.currentConfig?.() || {};
    const result = {
      checkedAt: new Date().toISOString(),
      connected: missing.length === 0,
      modules,
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

  window.ChappyHiyoriRuntimeDiagnostics = { run, status: () => JSON.parse(localStorage.getItem(STATUS_KEY) || "null") };
  window.addEventListener("chappy:hiyori-runtime-ready", () => setTimeout(run, 0));
  if (document.readyState === "complete") setTimeout(run, 0);
})();
