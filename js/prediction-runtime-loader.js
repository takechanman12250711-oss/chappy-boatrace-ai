// 予想ボタンを押すまで、大きな予想エンジンと詳細表示を読み込まない。
(function (root) {
  "use strict";
  if (root.ChappyPredictionRuntime) return;

  const VERSION = "20260828-ui-audit-display1";
  const SCRIPT_LOAD_TIMEOUT_MS = 12000;
  const RUNTIME_TOTAL_TIMEOUT_MS = 45000;
  const ODDS_PRIORITY_WAIT_MS = 2500;
  const PRELOAD_LOOKAHEAD = 2;
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
    "js/ai-core-assignment-compat.js",
    "js/local-water-v2-tiebreak.js",
    "js/third-six-rescue-fixed5.js",
    "js/escape-outer-second-rescue-fixed5.js",
    "js/third-place-rescue-14-fixed5.js",
    "js/third-place-rescue-12-4-fixed5.js",
    "js/pair-31-rescue-fixed5.js",
    "js/pair-32-rescue-fixed5.js",
    "js/prediction.js",
    "js/racer-skill-core-integration.js",
    "js/main-cover-classification-fix.js",
    "js/practical-selection.js",
    "js/three-course-escape-rescue-fixed5.js",
    "js/four-kado-escape-rescue-fixed5.js",
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
  const optionalScripts = ["js/prediction-calibration.js"];

  let readyPromise = null;
  let optionalReadyPromise = null;

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = root.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) root.clearTimeout(timer);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const clean = src.split("?")[0];
      let existing = [...document.scripts].find(script => script.src && script.src.includes(clean));
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
      const finish = callback => () => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        callback();
      };
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.dataset.chappyLoadFailed = "true";
        script.remove?.();
        reject(new Error(`予想モジュールの読込が${Math.round(SCRIPT_LOAD_TIMEOUT_MS / 1000)}秒を超えました: ${clean}`));
      }, SCRIPT_LOAD_TIMEOUT_MS);

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

  function preloadNext(list, startIndex, count = PRELOAD_LOOKAHEAD) {
    if (typeof document.querySelectorAll !== "function") return;
    list.slice(startIndex, startIndex + Math.max(1, count)).forEach(src => {
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
      console.warn("[prediction-runtime-loader] オッズ先行取得の待機を継続できませんでした", error?.message || error);
      return null;
    }
  }

  async function loadRequiredScripts() {
    for (let index = 0; index < scripts.length; index += 1) {
      preloadNext(scripts, index, PRELOAD_LOOKAHEAD);
      await loadScript(scripts[index]);
    }
    return true;
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const prioritizedOdds = await waitForOddsPriority();
      await withTimeout(
        loadRequiredScripts(),
        RUNTIME_TOTAL_TIMEOUT_MS,
        `予想ランタイム全体の準備が${Math.round(RUNTIME_TOTAL_TIMEOUT_MS / 1000)}秒を超えました`
      );
      root.dispatchEvent(new CustomEvent("chappy:prediction-runtime-ready", {
        detail: { version: VERSION, oddsPrioritized: Boolean(prioritizedOdds) }
      }));
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
      for (const src of optionalScripts) await loadScript(src);
      root.dispatchEvent(new CustomEvent("chappy:prediction-runtime-optional-ready", { detail: { version: VERSION } }));
      return true;
    })().catch(error => {
      root.dispatchEvent(new CustomEvent("chappy:prediction-runtime-optional-unavailable", {
        detail: { version: VERSION, message: String(error?.message || error || "") }
      }));
      return false;
    });
    return optionalReadyPromise;
  }

  root.ChappyPredictionRuntime = Object.freeze({
    version: VERSION,
    oddsPriorityWaitMs: ODDS_PRIORITY_WAIT_MS,
    runtimeTotalTimeoutMs: RUNTIME_TOTAL_TIMEOUT_MS,
    scripts: scripts.slice(),
    optionalScripts: optionalScripts.slice(),
    ensureReady,
    ensureOptionalReady
  });
})(window);
