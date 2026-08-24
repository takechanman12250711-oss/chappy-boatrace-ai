/* =========================================================
  チャッピーボートレースAI
  開催中レース選択の終端保証

  - JST当日と違うホームキャッシュを使用しない
  - ホーム／開催場一覧からレースを押す前に選択日をJST当日へ固定
  - 予想表示にもエラー表示にも到達しない永久ローディングを終端

  予想ロジック・配点・買い目・オッズ計算・画面構成は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (
    !root ||
    !root.document ||
    root.ChappyLiveRaceSelectionTerminalGuard
  ) {
    return;
  }

  root.ChappyLiveRaceSelectionTerminalGuard = Object.freeze({
    ...api,
    ...api.install(root)
  });
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "20260825-live-selection-terminal1";
  const HOME_CACHE_KEY = "chappy-home-v2-cache";
  const DEFAULT_WATCHDOG_MS = 75_000;
  const RACE_INTENT_SELECTOR = [
    "button[data-flow-place][data-flow-race]",
    "button[data-place][data-race]"
  ].join(",");

  function normalizeDate(value) {
    const digits = String(value || "")
      .replace(/\D/g, "")
      .slice(0, 8);
    return /^\d{8}$/.test(digits) ? digits : "";
  }

  function jstDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);
    const byType = Object.fromEntries(
      parts.map(part => [part.type, part.value])
    );
    return `${byType.year}${byType.month}${byType.day}`;
  }

  function inputDate(value) {
    const date = normalizeDate(value);
    if (!date) return "";
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }

  function storageList(root) {
    return ["sessionStorage", "localStorage"]
      .map(key => {
        try {
          return root[key] || null;
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  }

  function purgeStaleHomeCache(root, today = jstDate()) {
    let removed = 0;

    storageList(root).forEach(storage => {
      let raw = "";
      try {
        raw = storage.getItem(HOME_CACHE_KEY) || "";
      } catch (_) {
        return;
      }
      if (!raw) return;

      let cached = null;
      try {
        cached = JSON.parse(raw);
      } catch (_) {}

      const cachedDate = normalizeDate(
        cached?.scheduleDate || cached?.date || ""
      );

      if (cachedDate === today) return;

      try {
        storage.removeItem(HOME_CACHE_KEY);
        removed += 1;
      } catch (_) {}
    });

    return removed;
  }

  function currentHomeDate(root, today = jstDate()) {
    const homeDate = normalizeDate(
      root.ChappyHomeDashboardV2?.getDate?.()
    );
    if (homeDate === today) return homeDate;

    const inputValue = normalizeDate(
      root.document.getElementById("dateInput")?.value
    );
    if (inputValue === today) return inputValue;

    return today;
  }

  function setLiveDateInput(root, date) {
    const normalized = normalizeDate(date);
    const value = inputDate(normalized);
    const dateInput = root.document.getElementById("dateInput");
    const modeSelect = root.document.getElementById("raceModeSelect");

    if (!normalized || !value || !dateInput) return "";

    // 手動の振り返り日付は変更しない。
    if (modeSelect?.value === "review") return normalized;

    dateInput.value = value;
    dateInput.max = value;
    root.__CHAPPY_LIVE_RACE_SELECTION_DATE__ = normalized;
    return normalized;
  }

  function raceIntent(target) {
    if (!target?.closest) return null;
    const button = target.closest(RACE_INTENT_SELECTOR);
    if (!button || button.disabled) return null;

    const place = String(
      button.dataset.flowPlace ||
      button.dataset.place ||
      ""
    ).trim();
    const raceNo = Number(
      button.dataset.flowRace ||
      button.dataset.race ||
      0
    );

    if (!place || raceNo < 1 || raceNo > 12) return null;

    return {
      button,
      place,
      raceNo,
      jcd: String(button.dataset.flowJcd || "")
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
    );
  }

  function renderTerminalError(root, message) {
    const home = root.ChappyHomeDashboardV2;
    if (typeof home?.showPredictionError === "function") {
      home.showPredictionError(message);
    } else {
      const resultArea = root.document.getElementById("resultArea");
      if (resultArea) {
        resultArea.dataset.raceLoading = "error";
        resultArea.innerHTML =
          '<div class="prediction-loading-state is-error" role="alert">' +
          "<strong>レースを読み込めませんでした</strong>" +
          `<small>${escapeHtml(message)}</small>` +
          "</div>";
      }

      const oddsStatus = root.document.getElementById(
        "predictionOddsStatus"
      );
      if (oddsStatus) {
        oddsStatus.textContent = "取得失敗";
        oddsStatus.dataset.state = "error";
      }
    }

    const status = root.document.getElementById("statusArea");
    if (status) {
      status.textContent =
        "レースの読み込みを終了しました。更新後に選び直してください";
    }
  }

  function install(
    root,
    {
      watchdogMs = DEFAULT_WATCHDOG_MS,
      nowProvider = () => new Date()
    } = {}
  ) {
    if (!root || !root.document) {
      return {
        installed: false,
        version: VERSION,
        watchdogMs
      };
    }

    if (root.__CHAPPY_LIVE_RACE_SELECTION_TERMINAL_INSTALLED__) {
      return {
        installed: false,
        version: VERSION,
        watchdogMs
      };
    }
    root.__CHAPPY_LIVE_RACE_SELECTION_TERMINAL_INSTALLED__ = true;

    const state = {
      timer: 0,
      generation: 0,
      lastIntent: null,
      staleCacheRemoved: 0
    };

    const today = () => jstDate(nowProvider());

    function clearWatchdog() {
      if (state.timer) {
        root.clearTimeout(state.timer);
      }
      state.timer = 0;
    }

    function startWatchdog(intent) {
      clearWatchdog();
      const generation = ++state.generation;
      state.lastIntent = {
        ...intent,
        date: currentHomeDate(root, today()),
        startedAt: Date.now()
      };

      state.timer = root.setTimeout(() => {
        state.timer = 0;
        if (generation !== state.generation) return;

        const resultArea = root.document.getElementById("resultArea");
        if (resultArea?.dataset?.raceLoading !== "true") return;

        const seconds = Math.round(watchdogMs / 1000);
        const message =
          `レースの読み込みが${seconds}秒を超えました。` +
          "ホームの更新後、レースを選び直してください。";

        renderTerminalError(root, message);
        root.dispatchEvent?.(new root.CustomEvent(
          "chappy:live-race-selection-timeout",
          {
            detail: {
              ...state.lastIntent,
              timeoutMs: watchdogMs
            }
          }
        ));
      }, Math.max(1, Number(watchdogMs) || DEFAULT_WATCHDOG_MS));
    }

    state.staleCacheRemoved = purgeStaleHomeCache(root, today());
    setLiveDateInput(root, today());

    root.document.addEventListener(
      "click",
      event => {
        const intent = raceIntent(event.target);
        if (!intent) return;

        const date = currentHomeDate(root, today());
        setLiveDateInput(root, date);
        root.__CHAPPY_LIVE_RACE_SELECTION_INTENT__ = {
          ...intent,
          button: undefined,
          date,
          selectedAt: Date.now()
        };

        // 既存ハンドラーが同期的にloadingへ移した後で監視を開始する。
        root.setTimeout(() => {
          const resultArea = root.document.getElementById("resultArea");
          if (resultArea?.dataset?.raceLoading === "true") {
            startWatchdog(intent);
          }
        }, 0);
      },
      true
    );

    root.addEventListener?.(
      "chappy:home-schedule",
      event => {
        const scheduleDate = normalizeDate(event?.detail?.date);
        const currentToday = today();
        setLiveDateInput(
          root,
          scheduleDate === currentToday
            ? scheduleDate
            : currentToday
        );
      }
    );

    root.addEventListener?.(
      "chappy:prediction-rendered",
      clearWatchdog
    );
    root.addEventListener?.(
      "chappy:view-changed",
      event => {
        if (event?.detail?.view !== "prediction") {
          clearWatchdog();
        }
      }
    );
    root.addEventListener?.("pagehide", clearWatchdog);

    const resultArea = root.document.getElementById("resultArea");
    if (resultArea && typeof root.MutationObserver === "function") {
      const observer = new root.MutationObserver(() => {
        if (resultArea.dataset.raceLoading !== "true") {
          clearWatchdog();
        }
      });
      observer.observe(resultArea, {
        attributes: true,
        attributeFilter: ["data-race-loading"],
        childList: true,
        subtree: true
      });
    }

    return {
      installed: true,
      version: VERSION,
      watchdogMs,
      staleCacheRemoved: state.staleCacheRemoved,
      getState: () => ({
        timerActive: Boolean(state.timer),
        generation: state.generation,
        lastIntent: state.lastIntent
          ? { ...state.lastIntent }
          : null,
        staleCacheRemoved: state.staleCacheRemoved
      })
    };
  }

  return {
    version: VERSION,
    cacheKey: HOME_CACHE_KEY,
    watchdogMs: DEFAULT_WATCHDOG_MS,
    normalizeDate,
    jstDate,
    inputDate,
    purgeStaleHomeCache,
    currentHomeDate,
    setLiveDateInput,
    raceIntent,
    renderTerminalError,
    install
  };
});
