// js/hiyori-runtime-loader.js
// 日和学習・検証・承認系モジュールを既存アプリへ接続する。
// 予想ロジック・印・配点・買い目には直接書き込まない。
(function () {
  "use strict";

  const SCRIPT_ID = "chappy-hiyori-runtime-loader";
  if (window.__CHAPPY_HIYORI_RUNTIME_LOADED__) return;
  window.__CHAPPY_HIYORI_RUNTIME_LOADED__ = true;

  const scripts = [
    "js/hiyori-shadow-validation-loader.js",
    "js/hiyori-shadow-performance-loader.js",
    "js/hiyori-production-readiness-loader.js",
    "js/hiyori-final-approval-package-loader.js",
    "js/hiyori-production-rollback.js",
    "js/hiyori-production-rollback-panel.js",
    "js/hiyori-production-checklist.js",
    "js/hiyori-production-simulator.js",
    "js/hiyori-final-presentation.js",
    "js/hiyori-final-approval-ui.js",
    "js/hiyori-runtime-diagnostics.js"
  ];

  const styles = [
    "css/hiyori-production-rollback.css",
    "css/hiyori-final-approval.css"
  ];

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function syncCompatibilityKeys() {
    const productionSnapshots = read("chappy_hiyori_production_snapshots_v1", []);
    if (Array.isArray(productionSnapshots)) {
      write("chappy_hiyori_rollback_snapshots_v1", productionSnapshots);
    }

    const productionChecklist = read("chappy_hiyori_production_checklist_v1", []);
    if (Array.isArray(productionChecklist)) {
      write("chappy_hiyori_final_checklist_v1", productionChecklist.map(row => ({
        ...row,
        allPassed: row.readyForPresentation === true,
        status: row.readyForPresentation === true ? "passed" : "blocked"
      })));
    }
  }

  function ensureStyle(href) {
    if ([...document.styleSheets].some(sheet => sheet.href && sheet.href.includes(href))) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.chappyHiyoriStyle = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(resolve => {
      if ([...document.scripts].some(script => script.src && script.src.includes(src))) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.chappyHiyoriModule = src;
      script.onload = resolve;
      script.onerror = () => {
        console.warn("[hiyori-runtime-loader] load failed:", src);
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  async function install() {
    syncCompatibilityKeys();
    styles.forEach(ensureStyle);
    for (const src of scripts) await loadScript(src);
    syncCompatibilityKeys();
    window.dispatchEvent(new CustomEvent("chappy:hiyori-runtime-ready", {
      detail: {
        connected: true,
        productionApplied: false,
        appliedToPrediction: false,
        globalProductionLock: true
      }
    }));
    window.ChappyHiyoriRuntimeDiagnostics?.run?.();
  }

  window.addEventListener("chappy:hiyori-snapshot-created", syncCompatibilityKeys);
  window.addEventListener("chappy:hiyori-production-checklist-updated", syncCompatibilityKeys);
  window.addEventListener("storage", event => {
    if (event.key && event.key.startsWith("chappy_hiyori_")) syncCompatibilityKeys();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.ChappyHiyoriRuntimeLoader = {
    id: SCRIPT_ID,
    install,
    syncCompatibilityKeys,
    scripts: scripts.slice()
  };
})();
