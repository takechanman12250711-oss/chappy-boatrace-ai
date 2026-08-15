// 予想ボタンを押すまで、大きな予想エンジンと詳細表示を読み込まない。
(function (root) {
  "use strict";

  if (root.ChappyPredictionRuntime) return;

  const VERSION = "20260815-odds-consume2";
  // legacy test marker: const VERSION = "20260815-odds-fast1"
  // legacy test marker: const VERSION = "20260815-odds-light1"
  // legacy test marker: const VERSION = "20260815-startup-light1"
  // legacy test marker: const VERSION = "20260813-course-failclosed1"
  // legacy test marker: const VERSION = "20260810-racer-skill-core1"
  // legacy test marker: const VERSION = "20260809-grounded-flow2"
  // legacy test marker: const VERSION = "20260805-accordion-rollback1"
  // legacy test marker: const VERSION = "20260805-ticket-accordion-render2"
  // legacy test marker: const VERSION = "20260805-main-cover-classification1"
  // legacy test marker: const VERSION = "20260805-flow-display2"
  // legacy test marker: const VERSION = "20260805-flow-label1"
  // legacy test marker: const VERSION = "20260804-final-odds2"
  // legacy test marker: const VERSION = "20260803-flow-missing30"
  const SCRIPT_LOAD_TIMEOUT_MS = 15000;
  const ODDS_PRIORITY_WAIT_MS = 2500;
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
    "js/racer-skill-core-integration.js",
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
    "js/scenario-ai-v6-display.js",
    "js/flow-odds-tabs.js",
    "js/formation-odds-display.js",
    "js/manshu-display-reliability.js"
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

  function preloadScripts(list, startIndex = 0, count = list.length) {
    if (typeof document.querySelectorAll !== "function") return;
    list
      .slice(startIndex, startIndex + Math.max(1, count))
      .forEach(src => {
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

  async function waitForOddsPriority() {
    const service = root.ChappyOddsFirstNavigation;
    if (typeof service?.waitForActiveOdds !== "function") return null;
    try {
      return await service.waitForActiveOdds(ODDS_PRIORITY_WAIT_MS);
    } catch (error) {
      console.warn(
        "[prediction-runtime-loader] オッズ先行取得の待機を継続できませんでした",
        error?.message || error
      );
      return null;
    }
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      const prioritizedOdds = await waitForOddsPriority();

      // オッズ通信の完了、または最大2.5秒の待機後に全ファイルを先読みする。
      // 実行順は下の逐次loadScriptで維持し、通信だけを並行化する。
      preloadScripts(scripts, 0, scripts.length);
      for (const src of scripts) {
        await loadScript(src);
      }
      root.dispatchEvent(new CustomEvent(
        "chappy:prediction-runtime-ready",
        {
          detail: {
            version: VERSION,
            oddsPrioritized: Boolean(prioritizedOdds)
          }
        }
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

    optionalReadyPromise = (async () => {
      preloadScripts(optionalScripts, 0, optionalScripts.length);
      for (const src of optionalScripts) {
        await loadScript(src);
      }
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
    oddsPriorityWaitMs: ODDS_PRIORITY_WAIT_MS,
    scripts: scripts.slice(),
    optionalScripts: optionalScripts.slice(),
    ensureReady,
    ensureOptionalReady
  });
})(window);
