// 結果画面を開くまで、結果照合・集計・表示モジュールを取得しない。
// 予想ロジック・印・配点・買い目には接続しない。
(function (root) {
  "use strict";

  if (root.ChappyStatsRuntime) {
    return;
  }

  const VERSION =
    "20260802-theory-dashboard1";
  const scripts = [
    "js/boat-identity.js",
    "js/collection-health.js",
    "js/prediction-verification.js",
    "js/auto-stats.js",
    "js/verification-readiness.js",
    "js/improvement-suggestions.js",
    "js/stats.js",
    "js/theory-improvement-dashboard.js"
  ];
  let readyPromise = null;

  function loadScript(src) {
    return new Promise(
      (resolve, reject) => {
        const clean =
          src.split("?")[0];
        let existing = [
          ...document.scripts
        ].find(
          script =>
            script.src &&
            script.src.includes(clean)
        );
        if (
          existing?.dataset
            .chappyLoadFailed === "true"
        ) {
          existing.remove();
          existing = null;
        }

        if (
          existing?.dataset
            .chappyLoaded === "true"
        ) {
          resolve();
          return;
        }

        const script =
          existing ||
          document.createElement(
            "script"
          );
        script.async = false;
        script.dataset
          .chappyStatsModule =
          clean;
        script.addEventListener(
          "load",
          () => {
            script.dataset
              .chappyLoaded =
              "true";
            resolve();
          },
          { once: true }
        );
        script.addEventListener(
          "error",
          () => {
            script.dataset
              .chappyLoadFailed =
              "true";
            script.remove();
            reject(
              new Error(
                `結果分析モジュールを読み込めません: ${clean}`
              )
            );
          },
          { once: true }
        );

        if (!existing) {
          script.src =
            `${clean}?v=${VERSION}`;
          document.head
            .appendChild(script);
        }
      }
    );
  }

  function showStatus(message) {
    const area =
      document.getElementById(
        "statsArea"
      );
    const status =
      document.getElementById(
        "resultSyncStatus"
      );

    if (area) {
      area.innerHTML =
        `<div class="result-empty-state">` +
        `${String(message || "")}` +
        `</div>`;
    }
    if (status) {
      status.hidden = false;
      status.textContent =
        String(message || "");
    }
  }

  function ensureReady() {
    if (readyPromise) {
      return readyPromise;
    }

    showStatus(
      "結果分析を読み込んでいます…"
    );
    readyPromise =
      (async () => {
        for (const src of scripts) {
          await loadScript(src);
        }
        root.dispatchEvent(
          new CustomEvent(
            "chappy:stats-requested"
          )
        );
        root.dispatchEvent(
          new CustomEvent(
            "chappy:stats-runtime-ready",
            {
              detail: {
                version: VERSION
              }
            }
          )
        );
        return true;
      })().catch(error => {
        readyPromise = null;
        showStatus(
          "結果分析を読み込めませんでした。通信状態を確認して、もう一度開いてください。"
        );
        console.error(
          "[stats-runtime-loader]",
          error
        );
        throw error;
      });

    return readyPromise;
  }

  function requestStats() {
    void ensureReady().catch(
      () => {}
    );
  }

  function isStatsHash() {
    return (
      String(
        root.location?.hash || ""
      ) === "#resultSection"
    );
  }

  function installTriggers() {
    document
      .querySelector(
        'a[href="#resultSection"]'
      )
      ?.addEventListener(
        "click",
        requestStats
      );
    root.addEventListener(
      "hashchange",
      () => {
        if (isStatsHash()) {
          requestStats();
        }
      }
    );
    if (isStatsHash()) {
      requestStats();
    }
  }

  root.ChappyStatsRuntime =
    Object.freeze({
      version: VERSION,
      scripts:
        scripts.slice(),
      ensureReady
    });

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      installTriggers,
      { once: true }
    );
  } else {
    installTriggers();
  }
})(window);
