// 予想ボタンを押すまで、大きな予想エンジンと詳細表示を読み込まない。
(function (root) {
  "use strict";

  if (root.ChappyPredictionRuntime) return;

  const VERSION = "20260728-scenarios1";
  const scripts = [
    "js/theory.js",
    "js/history-insights-base.js",
    "js/motor-maintenance-insights.js",
    "js/theory-input.js",
    "js/race-history.js",
    "js/odds-insights.js",
    "js/evaluated-scenario-candidates.js",
    "js/ai-core.js",
    "js/prediction.js",
    "js/practical-selection.js",
    "js/note-generator.js",
    "js/render.js"
  ];
  let readyPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const clean = src.split("?")[0];
      const existing = [...document.scripts].find(
        script =>
          script.src &&
          script.src.includes(clean)
      );

      if (existing?.dataset.chappyLoaded === "true") {
        resolve();
        return;
      }

      const script = existing || document.createElement("script");
      script.async = false;
      script.dataset.chappyPredictionModule = clean;
      script.addEventListener(
        "load",
        () => {
          script.dataset.chappyLoaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => reject(
          new Error(`予想モジュールを読み込めません: ${clean}`)
        ),
        { once: true }
      );

      if (!existing) {
        script.src = `${clean}?v=${VERSION}`;
        document.head.appendChild(script);
      }
    });
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      for (const src of scripts) {
        await loadScript(src);
      }
      root.dispatchEvent(
        new CustomEvent(
          "chappy:prediction-runtime-ready",
          { detail: { version: VERSION } }
        )
      );
      return true;
    })().catch(error => {
      readyPromise = null;
      throw error;
    });

    return readyPromise;
  }

  root.ChappyPredictionRuntime = Object.freeze({
    version: VERSION,
    scripts: scripts.slice(),
    ensureReady
  });
})(window);
