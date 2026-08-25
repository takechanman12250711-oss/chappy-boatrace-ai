/* =========================================================
  チャッピーボートレースAI
  iPhone向け予想起動・終端保証

  - 配信世代を1つに固定
  - 古いタブの「更新」をアプリ本体の再読込へ変更
  - レース選択／予想ランタイムの欠損を無言で終了しない
  - 起動中の例外を理由付きエラーへ変換し、永久loadingを防ぐ

  予想ロジック・配点・買い目・オッズ計算・UI構成は変更しない。
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
    root.ChappyMobilePredictionStartupTerminal
  ) {
    return;
  }

  root.ChappyMobilePredictionStartupTerminal = Object.freeze({
    ...api,
    ...api.install(root)
  });
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const BUILD = "20260825-mobile-startup-terminal1";
  const HOME_CACHE_KEY = "chappy-home-v2-cache";
  const RACE_INTENT_SELECTOR = [
    "button[data-flow-place][data-flow-race]",
    "button[data-place][data-race]"
  ].join(",");

  function startupError(code, message) {
    const normalizedCode = String(code || "STARTUP_ERROR")
      .replace(/[^A-Z0-9_]/gi, "_")
      .toUpperCase();
    const error = new Error(
      `${String(message || "AI予想の起動に失敗しました")} [${normalizedCode}]`
    );
    error.name = "ChappyStartupError";
    error.code = normalizedCode;
    return error;
  }

  function errorText(error) {
    if (!error) return "AI予想の起動に失敗しました [STARTUP_ERROR]";
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function isPredictionLoading(root) {
    return root?.document?.getElementById?.("resultArea")
      ?.dataset?.raceLoading === "true";
  }

  function renderStartupError(root, error) {
    if (!root?.document) return false;

    const message = errorText(error);
    const home = root.ChappyHomeDashboardV2;

    if (typeof home?.showPredictionError === "function") {
      home.showPredictionError(message);
    } else {
      const resultArea = root.document.getElementById("resultArea");
      if (resultArea) {
        resultArea.dataset.raceLoading = "error";
        resultArea.innerHTML =
          '<div class="prediction-loading-state is-error" role="alert">' +
          "<strong>AI予想を開始できませんでした</strong>" +
          `<small>${String(message)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</small>` +
          "</div>";
      }
    }

    const errorArea = root.document.getElementById("errorArea");
    if (errorArea) {
      errorArea.style.whiteSpace = "pre-wrap";
      errorArea.textContent = message;
    }

    const status = root.document.getElementById("statusArea");
    if (status) {
      status.textContent = `AI予想の起動を終了しました：${message}`;
    }

    const oddsStatus = root.document.getElementById(
      "predictionOddsStatus"
    );
    if (oddsStatus) {
      oddsStatus.textContent = "起動失敗";
      oddsStatus.dataset.state = "error";
    }

    try {
      root.dispatchEvent?.(new root.CustomEvent(
        "chappy:prediction-startup-error",
        {
          detail: {
            build: BUILD,
            code: error?.code || "STARTUP_ERROR",
            message
          }
        }
      ));
    } catch (_) {}

    return true;
  }

  function replaceGlobal(root, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(root, key);

    try {
      if (!descriptor || descriptor.writable === true) {
        root[key] = value;
        return root[key] === value;
      }

      if (descriptor.configurable === true) {
        Object.defineProperty(root, key, {
          configurable: true,
          enumerable: descriptor.enumerable !== false,
          writable: true,
          value
        });
        return root[key] === value;
      }
    } catch (_) {}

    return false;
  }

  function validateRaceRuntime(root) {
    const fetchButton = root?.document?.getElementById?.("fetchRaceBtn");

    if (!fetchButton) {
      throw startupError(
        "FETCH_BUTTON_MISSING",
        "AI予想開始ボタンを確認できません"
      );
    }

    if (typeof root.ChappyRaceControls?.initialize !== "function") {
      throw startupError(
        "RACE_CONTROLS_MISSING",
        "レース操作モジュールを準備できません"
      );
    }

    root.ChappyRaceControls.initialize();

    if (typeof root.ChappyRaceSelection?.select !== "function") {
      throw startupError(
        "RACE_SELECTION_MISSING",
        "レース選択モジュールを準備できません"
      );
    }

    return true;
  }

  function validatePredictionRuntime(root) {
    const missing = [];
    const core = root?.ChappyAICore;

    if (!core || !["object", "function"].includes(typeof core)) {
      missing.push("AI_CORE");
    }
    if (typeof root?.createPrediction !== "function") {
      missing.push("CREATE_PREDICTION");
    }
    if (typeof root?.renderAll !== "function") {
      missing.push("RENDER_ALL");
    }

    if (missing.length) {
      throw startupError(
        "PREDICTION_RUNTIME_INCOMPLETE",
        `予想ランタイムの準備が不完全です：${missing.join(",")}`
      );
    }

    return true;
  }

  function wrapAppRuntime(root) {
    const runtime = root?.ChappyAppRuntime;

    if (
      !runtime ||
      typeof runtime.ensure !== "function" ||
      runtime.__mobileStartupTerminalWrapped === true
    ) {
      return runtime?.__mobileStartupTerminalWrapped === true;
    }

    const originalEnsure = runtime.ensure.bind(runtime);
    const wrapped = Object.freeze({
      ...runtime,
      version: BUILD,
      legacyVersion: runtime.version || "",
      __mobileStartupTerminalWrapped: true,
      ensure(group) {
        return Promise.resolve(originalEnsure(group))
          .then(result => {
            if (group === "race") validateRaceRuntime(root);
            return result;
          })
          .catch(error => {
            if (group === "race") renderStartupError(root, error);
            throw error;
          });
      }
    });

    return replaceGlobal(root, "ChappyAppRuntime", wrapped);
  }

  function wrapPredictionRuntime(root) {
    const runtime = root?.ChappyPredictionRuntime;

    if (
      !runtime ||
      typeof runtime.ensureReady !== "function" ||
      runtime.__mobileStartupTerminalWrapped === true
    ) {
      return runtime?.__mobileStartupTerminalWrapped === true;
    }

    const originalEnsureReady = runtime.ensureReady.bind(runtime);
    const wrapped = Object.freeze({
      ...runtime,
      version: BUILD,
      legacyVersion: runtime.version || "",
      __mobileStartupTerminalWrapped: true,
      ensureReady() {
        return Promise.resolve(originalEnsureReady())
          .then(result => {
            validatePredictionRuntime(root);
            return result;
          })
          .catch(error => {
            renderStartupError(root, error);
            throw error;
          });
      }
    });

    return replaceGlobal(root, "ChappyPredictionRuntime", wrapped);
  }

  function clearHomeCache(root) {
    let removed = 0;

    ["sessionStorage", "localStorage"].forEach(key => {
      try {
        const storage = root?.[key];
        if (!storage) return;
        if (storage.getItem(HOME_CACHE_KEY) !== null) {
          removed += 1;
        }
        storage.removeItem(HOME_CACHE_KEY);
      } catch (_) {}
    });

    return removed;
  }

  function reloadWithBuild(root, now = Date.now()) {
    clearHomeCache(root);

    const URLCtor = root?.URL ||
      (typeof URL === "function" ? URL : null);
    if (!URLCtor || !root?.location?.href) {
      throw startupError(
        "RELOAD_UNAVAILABLE",
        "アプリを再読み込みできません"
      );
    }

    const url = new URLCtor(root.location.href);
    url.searchParams.set("appBuild", BUILD);
    url.searchParams.set("reload", String(now));

    if (typeof root.location.replace === "function") {
      root.location.replace(url.toString());
    } else {
      root.location.href = url.toString();
    }

    return url.toString();
  }

  function install(root) {
    if (!root?.document) {
      return {
        installed: false,
        build: BUILD
      };
    }

    if (root.__CHAPPY_MOBILE_STARTUP_TERMINAL_INSTALLED__) {
      return {
        installed: false,
        build: BUILD
      };
    }
    root.__CHAPPY_MOBILE_STARTUP_TERMINAL_INSTALLED__ = true;
    root.CHAPPY_APP_BUILD = BUILD;

    if (root.document.documentElement?.dataset) {
      root.document.documentElement.dataset.chappyBuild = BUILD;
    }

    const appRuntimeWrapped = wrapAppRuntime(root);
    const predictionRuntimeWrapped = wrapPredictionRuntime(root);

    root.document.addEventListener(
      "click",
      event => {
        const refresh = event.target?.closest?.("#homeRefreshBtn");
        if (refresh) {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          try {
            reloadWithBuild(root);
          } catch (error) {
            renderStartupError(root, error);
          }
          return;
        }

        const raceButton = event.target?.closest?.(RACE_INTENT_SELECTOR);
        if (!raceButton || raceButton.disabled) return;

        if (typeof root.ChappyAppRuntime?.ensure !== "function") {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          renderStartupError(
            root,
            startupError(
              "APP_RUNTIME_MISSING",
              "アプリ起動モジュールを確認できません"
            )
          );
          return;
        }

        root.setTimeout?.(() => {
          wrapAppRuntime(root);
          wrapPredictionRuntime(root);
        }, 0);
      },
      true
    );

    root.addEventListener?.(
      "chappy:prediction-runtime-ready",
      () => {
        wrapPredictionRuntime(root);
        try {
          validatePredictionRuntime(root);
        } catch (error) {
          if (isPredictionLoading(root)) {
            renderStartupError(root, error);
          }
        }
      }
    );

    root.addEventListener?.("unhandledrejection", event => {
      if (!isPredictionLoading(root)) return;
      const reason = event?.reason;
      const message = errorText(reason);
      if (/AbortError|新しいレース選択/.test(message)) return;
      renderStartupError(
        root,
        reason instanceof Error
          ? reason
          : startupError("UNHANDLED_REJECTION", message)
      );
    });

    root.addEventListener?.("error", event => {
      if (!isPredictionLoading(root)) return;
      const message = String(event?.message || "");
      if (!message || /ResizeObserver loop|favicon/i.test(message)) return;
      renderStartupError(
        root,
        event?.error instanceof Error
          ? event.error
          : startupError("STARTUP_SCRIPT_ERROR", message)
      );
    });

    return {
      installed: true,
      build: BUILD,
      appRuntimeWrapped,
      predictionRuntimeWrapped,
      clearHomeCache: () => clearHomeCache(root),
      reload: () => reloadWithBuild(root),
      validateRaceRuntime: () => validateRaceRuntime(root),
      validatePredictionRuntime: () => validatePredictionRuntime(root),
      renderStartupError: error => renderStartupError(root, error)
    };
  }

  return {
    build: BUILD,
    cacheKey: HOME_CACHE_KEY,
    raceIntentSelector: RACE_INTENT_SELECTOR,
    startupError,
    errorText,
    isPredictionLoading,
    renderStartupError,
    validateRaceRuntime,
    validatePredictionRuntime,
    wrapAppRuntime,
    wrapPredictionRuntime,
    clearHomeCache,
    reloadWithBuild,
    install
  };
});
