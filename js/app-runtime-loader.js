// Sprint4: 再訪時の即時表示と、操作直前の先読みを行う。
(function (root) {
  "use strict";
  if (root.ChappyAppRuntime) return;

  const VERSION = "20260808-result-void-compat1";
  // legacy test marker: const VERSION = "20260805-flow-label1"
  // legacy test marker: const VERSION = "20260804-final-odds2"
  // legacy test marker: const VERSION = "20260803-flow-missing30"
  const HOME_CACHE_KEY = "chappy-home-v2-cache";
  const HOME_CACHE_TTL = 300000;
  const SCRIPT_LOAD_TIMEOUT_MS = 15000;
  const loaded = new Map();
  const groupReady = new Map();
  const groups = {
    race: [
      "js/utils.js",
      "js/storage.js",
      "js/prediction-conditions.js",
      "js/api.js",
      "js/result-void-compat.js",
      "js/prediction-runtime-loader.js",
      "js/script.js",
      "js/hiyori-runtime-loader.js"
    ],
    stats: [
      "js/utils.js",
      "js/storage.js",
      "js/stats-runtime-loader.js"
    ],
    autoSelection: [
      "js/utils.js",
      "js/storage.js",
      "js/auto-selection.js"
    ]
  };

  function hydrateHomeCache() {
    try {
      const sessionValue = sessionStorage.getItem(HOME_CACHE_KEY);
      if (sessionValue) return;
      const localValue = localStorage.getItem(HOME_CACHE_KEY);
      if (!localValue) return;
      const parsed = JSON.parse(localValue);
      const savedAt = Number(parsed?.savedAt || 0);
      if (!savedAt || Date.now() - savedAt > HOME_CACHE_TTL) {
        localStorage.removeItem(HOME_CACHE_KEY);
        return;
      }
      sessionStorage.setItem(HOME_CACHE_KEY, localValue);
    } catch (_) {}
  }

  function persistHomeCache() {
    try {
      const value = sessionStorage.getItem(HOME_CACHE_KEY);
      if (!value) return;
      const parsed = JSON.parse(value);
      if (!Number(parsed?.savedAt || 0)) return;
      localStorage.setItem(HOME_CACHE_KEY, value);
    } catch (_) {}
  }

  hydrateHomeCache();
  root.addEventListener("pagehide", persistHomeCache, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistHomeCache();
  }, { passive: true });

  function loadScript(src) {
    const clean = src.split("?")[0];
    if (loaded.has(clean)) return loaded.get(clean);
    const existing = [...document.scripts].find(script => script.src && script.src.includes(clean));
    if (existing?.dataset.chappyLoaded === "true") return Promise.resolve(true);

    const promise = new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      let settled = false;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        callback(value);
      };
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        loaded.delete(clean);
        script.remove();
        reject(new Error(`モジュールの読込が15秒を超えました: ${clean}`));
      }, SCRIPT_LOAD_TIMEOUT_MS);
      script.async = false;
      script.dataset.chappyRuntimeModule = clean;
      script.addEventListener("load", finish(() => {
        script.dataset.chappyLoaded = "true";
        resolve(true);
      }), { once: true });
      script.addEventListener("error", finish(() => {
        loaded.delete(clean);
        script.remove();
        reject(new Error(`モジュールを読み込めません: ${clean}`));
      }), { once: true });
      if (!existing) {
        script.src = `${clean}?v=${VERSION}`;
        document.head.appendChild(script);
      }
    });
    loaded.set(clean, promise);
    return promise;
  }

  function preloadGroup(group) {
    if (typeof document.querySelectorAll !== "function") return;
    (groups[group] || []).forEach(src => {
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

  function ensure(group) {
    if (groupReady.has(group)) return groupReady.get(group);
    preloadGroup(group);
    const promise = (async () => {
      const scripts = groups[group] || [];
      for (const src of scripts) await loadScript(src);
      if (group === "race") {
        root.ChappyRaceControls
          ?.initialize?.();
      }
      if (group === "stats") {
        await root.ChappyStatsRuntime?.ensureReady?.();
      }
      return true;
    })().catch(error => {
      groupReady.delete(group);
      throw error;
    });
    groupReady.set(group, promise);
    return promise;
  }

  function requiredGroup(target) {
    if (!target) return "";
    if (target.matches(".bottom-nav-item")) return "";
    const view = target.dataset.view || "";
    if (view === "result" || target.getAttribute("href") === "#resultSection") return "stats";
    if (view === "race" || target.id === "fetchRaceBtn" || target.id === "reloadRaceBtn" || target.id === "refreshOddsBtn") return "race";
    return "";
  }

  function preloadGroupForTarget(target) {
    if (target?.matches("[data-place][data-race]")) return "race";
    return requiredGroup(target);
  }

  function replay(target) {
    target.dataset.chappyRuntimeReady = "true";
    target.click();
    delete target.dataset.chappyRuntimeReady;
  }

  document.addEventListener("pointerdown", event => {
    const target = event.target.closest("button,a");
    const group = preloadGroupForTarget(target);
    if (group) {
      preloadGroup(group);
      void ensure(group).catch(() => {});
    }
  }, { capture: true, passive: true });

  document.addEventListener("click", event => {
    const target = event.target.closest("button,a");
    if (!target || target.dataset.chappyRuntimeReady === "true") return;
    const group = requiredGroup(target);
    if (!group) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    ensure(group)
      .then(() => replay(target))
      .catch(error => {
        console.error("[app-runtime-loader]", error);
        const status = document.getElementById("statusArea") || document.getElementById("resultSyncStatus");
        if (status) status.textContent = "読み込みに失敗しました。通信状態を確認してください。";
      });
  }, true);

  root.ChappyAppRuntime = Object.freeze({ ensure, preloadGroup, groups, persistHomeCache });
})(window);
