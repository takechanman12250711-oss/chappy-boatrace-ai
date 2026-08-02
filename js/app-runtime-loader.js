// Sprint4: 再訪時の即時表示と、操作直前の先読みを行う。
(function (root) {
  "use strict";
  if (root.ChappyAppRuntime) return;

  const VERSION = "20260802-sprint4";
  const HOME_CACHE_KEY = "chappy-home-v2-cache";
  const HOME_CACHE_TTL = 300000;
  const loaded = new Map();
  const groupReady = new Map();
  const groups = {
    race: [
      "js/utils.js",
      "js/storage.js",
      "js/prediction-conditions.js",
      "js/api.js",
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
      script.async = false;
      script.dataset.chappyRuntimeModule = clean;
      script.addEventListener("load", () => {
        script.dataset.chappyLoaded = "true";
        resolve(true);
      }, { once: true });
      script.addEventListener("error", () => {
        loaded.delete(clean);
        script.remove();
        reject(new Error(`モジュールを読み込めません: ${clean}`));
      }, { once: true });
      if (!existing) {
        script.src = `${clean}?v=${VERSION}`;
        document.head.appendChild(script);
      }
    });
    loaded.set(clean, promise);
    return promise;
  }

  function ensure(group) {
    if (groupReady.has(group)) return groupReady.get(group);
    const promise = (async () => {
      const scripts = groups[group] || [];
      for (const src of scripts) await loadScript(src);
      if (group === "race") {
        document.dispatchEvent(new Event("DOMContentLoaded"));
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
    const raceCard = target.matches("[data-place][data-race]");
    const view = target.dataset.view || "";
    if (view === "result" || target.getAttribute("href") === "#resultSection") return "stats";
    if (raceCard || view === "race" || view === "prediction" || target.id === "fetchRaceBtn" || target.id === "reloadRaceBtn" || target.id === "refreshOddsBtn") return "race";
    return "";
  }

  function replay(target) {
    target.dataset.chappyRuntimeReady = "true";
    target.click();
    delete target.dataset.chappyRuntimeReady;
  }

  document.addEventListener("pointerdown", event => {
    const target = event.target.closest("button,a");
    const group = requiredGroup(target);
    if (group) void ensure(group).catch(() => {});
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

  root.ChappyAppRuntime = Object.freeze({ ensure, groups, persistHomeCache });
})(window);
