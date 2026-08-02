// Sprint3: ホーム初期表示ではホーム専用コードだけを読み込む。
(function (root) {
  "use strict";
  if (root.ChappyAppRuntime) return;

  const VERSION = "20260802-sprint3";
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

  function replay(target) {
    target.dataset.chappyRuntimeReady = "true";
    target.click();
    delete target.dataset.chappyRuntimeReady;
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("button,a");
    if (!target || target.dataset.chappyRuntimeReady === "true") return;

    const raceCard = target.matches("[data-place][data-race]");
    const view = target.dataset.view || "";
    const needsRace = raceCard || view === "race" || view === "prediction" || target.id === "fetchRaceBtn" || target.id === "reloadRaceBtn" || target.id === "refreshOddsBtn";
    const needsStats = view === "result" || target.getAttribute("href") === "#resultSection";

    if (!needsRace && !needsStats) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    ensure(needsStats ? "stats" : "race")
      .then(() => replay(target))
      .catch(error => {
        console.error("[app-runtime-loader]", error);
        const status = document.getElementById("statusArea") || document.getElementById("resultSyncStatus");
        if (status) status.textContent = "読み込みに失敗しました。通信状態を確認してください。";
      });
  }, true);

  root.ChappyAppRuntime = Object.freeze({ ensure, groups });
})(window);
