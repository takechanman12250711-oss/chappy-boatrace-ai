// 結果画面を開くまで、結果照合・集計・表示モジュールを取得しない。
// 予想ロジック・印・配点・買い目には接続しない。
(function (root) {
  "use strict";
  if (root.ChappyStatsRuntime) return;
  const VERSION = "20260828-ui-audit-display1-outer-attack-central-report1";
  const SCRIPT_LOAD_TIMEOUT_MS = 15000;
  const scripts = [
    "js/boat-identity.js",
    "js/collection-health.js",
    "js/prediction-verification.js",
    "js/prediction-index-loader.js",
    "js/auto-stats.js",
    "js/verification-readiness.js",
    "js/improvement-suggestions.js",
    "js/stats.js",
    "js/result-ui-phase5.js"
  ];
  const optionalScripts = [
    "js/reference-tag-report.js",
    "js/outer-attack-ticket-shadow.js",
    "js/outer-attack-ticket-settlement.js",
    "js/outer-attack-ticket-decision-gate.js",
    "js/outer-attack-ticket-central-report-loader.js",
    "js/outer-attack-ticket-progress-panel.js"
  ];
  let readyPromise = null;
  let optionalReady = false;
  let optionalPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const clean = src.split("?")[0];
      let existing = [...document.scripts].find(script => script.src && script.src.includes(clean));
      if (existing?.dataset.chappyLoadFailed === "true") { existing.remove(); existing = null; }
      if (existing?.dataset.chappyLoaded === "true") { resolve(); return; }
      const script = existing || document.createElement("script");
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.dataset.chappyLoadFailed = "true";
        script.remove();
        reject(new Error(`結果分析モジュールの読込が15秒を超えました: ${clean}`));
      }, SCRIPT_LOAD_TIMEOUT_MS);
      const finish = callback => () => {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        callback();
      };
      script.async = false;
      script.dataset.chappyStatsModule = clean;
      script.addEventListener("load", finish(() => { script.dataset.chappyLoaded = "true"; resolve(); }), { once: true });
      script.addEventListener("error", finish(() => { script.dataset.chappyLoadFailed = "true"; script.remove(); reject(new Error(`結果分析モジュールを読み込めません: ${clean}`)); }), { once: true });
      if (!existing) { script.src = `${clean}?v=${VERSION}`; document.head.appendChild(script); }
    });
  }
  function preloadScripts() {
    if (typeof document.querySelectorAll !== "function") return;
    [...scripts, ...optionalScripts].forEach(src => {
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
  function showStatus(message) {
    const area = document.getElementById("statsArea");
    const status = document.getElementById("resultSyncStatus");
    if (area) area.innerHTML = `<div class="result-empty-state">${String(message || "")}</div>`;
    if (status) { status.hidden = false; status.textContent = String(message || ""); }
  }
  function isResultActive() {
    const section = document.getElementById("resultSection");
    return Boolean(section && section.hidden === false);
  }
  function requestIfActive() {
    if (!isResultActive()) return false;
    root.dispatchEvent(new CustomEvent("chappy:stats-requested"));
    return true;
  }
  function ensureOptionalScripts() {
    if (optionalReady) return Promise.resolve(true);
    if (!optionalPromise) {
      optionalPromise = (async () => {
        for (const src of optionalScripts) await loadScript(src);
        optionalReady = true;
        return true;
      })().catch(error => {
        console.warn("[stats-runtime-loader:optional]", error);
        return false;
      }).finally(() => {
        if (!optionalReady) optionalPromise = null;
      });
    }
    return optionalPromise;
  }
  function ensureReady() {
    if (!readyPromise) {
      preloadScripts();
      showStatus("結果分析を読み込んでいます…");
      readyPromise = (async () => {
        for (const src of scripts) await loadScript(src);
        root.dispatchEvent(new CustomEvent("chappy:stats-runtime-ready", { detail: { version: VERSION } }));
        void ensureOptionalScripts();
        return true;
      })().catch(error => { readyPromise = null; showStatus("結果分析を読み込めませんでした。通信状態を確認して、もう一度開いてください。"); console.error("[stats-runtime-loader]", error); throw error; });
    }
    return readyPromise.then(value => {
      void ensureOptionalScripts();
      requestIfActive();
      return value;
    });
  }
  function requestStats() { void ensureReady().catch(() => {}); }
  function isStatsHash() { return String(root.location?.hash || "") === "#resultSection"; }
  function installTriggers() {
    document.querySelector('a[href="#resultSection"]')?.addEventListener("click", requestStats);
    root.addEventListener("hashchange", () => { if (isStatsHash()) requestStats(); });
    if (isStatsHash()) requestStats();
  }
  root.ChappyStatsRuntime = Object.freeze({
    version: VERSION,
    scripts: scripts.slice(),
    optionalScripts: optionalScripts.slice(),
    ensureReady,
    requestIfActive
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installTriggers, { once: true }); else installTriggers();
})(window);
