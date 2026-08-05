// 予想ボタンを押すまで、大きな予想エンジンと詳細表示を読み込まない。
(function (root) {
  "use strict";

  if (root.ChappyPredictionRuntime) return;

  const VERSION = "20260805-direct-render-accordion1";
  // legacy test marker: const VERSION = "20260805-accordion-rollback1"
  // legacy test marker: const VERSION = "20260805-ticket-accordion-render2"
  // legacy test marker: const VERSION = "20260805-main-cover-classification1"
  // legacy test marker: const VERSION = "20260805-flow-display2"
  // legacy test marker: const VERSION = "20260805-flow-label1"
  // legacy test marker: const VERSION = "20260804-final-odds2"
  // legacy test marker: const VERSION = "20260803-flow-missing30"
  const SCRIPT_LOAD_TIMEOUT_MS = 15000;
  const scripts = [
    "js/boat-identity.js",
    "js/theory.js",
    "js/history-insights-base.js",
    "js/motor-maintenance-insights.js",
    "js/theory-input.js",
    "js/race-history.js",
    "js/odds-insights.js",
    "js/evaluated-scenario-candidates.js",
    "js/ai-core.js",
    "js/prediction.js",
    "js/main-cover-classification-fix.js",
    "js/practical-selection.js",
    "js/note-generator.js",
    "js/scenario-ai-v6-shadow.js",
    "js/skip-ai-shadow.js",
    "js/render.js",
    "js/flow-role-label-fix.js",
    "js/main-cover-display-boundary.js",
    "js/final-odds-display.js",
    "js/skip-ai-display.js",
    "js/scenario-ai-v6-display.js"
  ];
  const optionalScripts = [
    "js/prediction-calibration.js"
  ];
  let readyPromise = null;
  let optionalReadyPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const clean = src.split("?")[0];
      let existing = [...document.scripts].find(
        script => script.src && script.src.includes(clean)
      );

      if (existing?.dataset.chappyLoadFailed === "true") {
        existing.remove?.();
        existing = null;
      }

      if (existing?.dataset.chappyLoaded === "true") {
        resolve();
        return;
      }

      const script = existing || document.createElement("script");
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.dataset.chappyLoadFailed = "true";
        script.remove?.();
        reject(new Error(`予想モジュールの読込が15秒を超えました: ${clean}`));
      }, SCRIPT_LOAD_TIMEOUT_MS);
      const finish = callback => () => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        callback();
      };
      script.async = false;
      script.dataset.chappyPredictionModule = clean;
      script.addEventListener("load", finish(() => {
        script.dataset.chappyLoaded = "true";
        resolve();
      }), { once: true });
      script.addEventListener("error", finish(() => {
        script.dataset.chappyLoadFailed = "true";
        script.remove?.();
        reject(new Error(`予想モジュールを読み込めません: ${clean}`));
      }), { once: true });

      if (!existing) {
        script.src = `${clean}?v=${VERSION}`;
        document.head.appendChild(script);
      }
    });
  }

  function preloadScripts(list) {
    if (typeof document.querySelectorAll !== "function") return;
    list.forEach(src => {
      const clean = src.split("?")[0];
      if ([...document.scripts].some(script => script.src && script.src.includes(clean))) return;
      if ([...document.querySelectorAll('link[rel="preload"][as="script"]')].some(link => link.href && link.href.includes(clean))) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "script";
      link.href = `${clean}?v=${VERSION}`;
      document.head.appendChild(link);
    });
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;
    preloadScripts(scripts);

    readyPromise = (async () => {
      for (const src of scripts) await loadScript(src);
      root.dispatchEvent(new CustomEvent(
        "chappy:prediction-runtime-ready",
        { detail: { version: VERSION } }
      ));
      return true;
    })().catch(error => {
      readyPromise = null;
      throw error;
    });

    return readyPromise;
  }

  function ensureOptionalReady() {
    if (optionalReadyPromise) return optionalReadyPromise;
    preloadScripts(optionalScripts);

    optionalReadyPromise = (async () => {
      for (const src of optionalScripts) await loadScript(src);
      root.dispatchEvent(new CustomEvent(
        "chappy:prediction-runtime-optional-ready",
        { detail: { version: VERSION } }
      ));
      return true;
    })().catch(error => {
      root.dispatchEvent(new CustomEvent(
        "chappy:prediction-runtime-optional-unavailable",
        { detail: { version: VERSION, message: String(error?.message || error || "") } }
      ));
      return false;
    });

    return optionalReadyPromise;
  }

  root.ChappyPredictionRuntime = Object.freeze({
    version: VERSION,
    scripts: scripts.slice(),
    optionalScripts: optionalScripts.slice(),
    ensureReady,
    ensureOptionalReady
  });
})(window);
