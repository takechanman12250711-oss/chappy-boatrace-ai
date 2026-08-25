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

  const BUILD = "20260825-mobile-startup-terminal3";
  const HOME_CACHE_KEY = "chappy-home-v2-cache";
  const SCRIPT_LOAD_TIMEOUT_MS = 12000;
  const RUNTIME_TOTAL_TIMEOUT_MS = 45000;
  const PRELOAD_LOOKAHEAD = 2;
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

  function withTimeout(root, promise, timeoutMs, error) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = root.setTimeout(
        () => reject(error),
        Math.max(1, Number(timeoutMs) || 1)
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) root.clearTimeout(timer);
    });
  }

  function loadScriptWithBuild(root, src) {
    const clean = String(src || "").split("?")[0];
    if (!clean) {
      return Promise.reject(startupError(
        "PREDICTION_SCRIPT_INVALID",
        "予想モジュールのパスが不正です"
      ));
    }

    let existing = [...(root.document.scripts || [])].find(script =>
      script.src && script.src.includes(clean)
    );

    if (existing?.dataset?.chappyLoadFailed === "true") {
      existing.remove?.();
      existing = null;
    }

    if (
      existing?.dataset?.chappyLoaded === "true" ||
      existing?.dataset?.chappyMobileBuild === BUILD
    ) {
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      const script = existing || root.document.createElement("script");
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
        script.dataset.chappyLoadFailed = "true";
        script.remove?.();
        reject(startupError(
          "PREDICTION_SCRIPT_TIMEOUT",
          `予想モジュールの読込が12秒を超えました：${clean}`
        ));
      }, SCRIPT_LOAD_TIMEOUT_MS);

      script.async = false;
      script.dataset.chappyPredictionModule = clean;
      script.dataset.chappyMobileBuild = BUILD;
      script.addEventListener("load", finish(() => {
        script.dataset.chappyLoaded = "true";
        resolve(true);
      }), { once: true });
      script.addEventListener("error", finish(() => {
        script.dataset.chappyLoadFailed = "true";
        script.remove?.();
        reject(startupError(
          "PREDICTION_SCRIPT_LOAD_FAILED",
          `予想モジュールを読み込めません：${clean}`
        ));
      }), { once: true });

      if (!existing) {
        script.src = `${clean}?v=${BUILD}`;
        root.document.head.appendChild(script);
      }
    });
  }

  function preloadScriptsWithBuild(
    root,
    list,
    startIndex,
    count = PRELOAD_LOOKAHEAD
  ) {
    if (typeof root?.document?.querySelectorAll !== "function") return;

    list
      .slice(startIndex, startIndex + Math.max(1, count))
      .forEach(src => {
        const clean = String(src || "").split("?")[0];
        if (!clean) return;
        const versioned = `${clean}?v=${BUILD}`;
        if ([...(root.document.scripts || [])].some(script =>
          script.src && script.src.includes(clean)
        )) return;
        if ([...root.document.querySelectorAll(
          'link[rel="preload"][as="script"]'
        )].some(link => {
          const href = link.getAttribute?.("href") || link.href || "";
          return href === versioned || href.endsWith(`/${versioned}`);
        })) return;

        const link = root.document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.href = versioned;
        root.document.head.appendChild(link);
      });
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

    const requiredScripts = Array.isArray(runtime.scripts)
      ? runtime.scripts.slice()
      : [];
    const optionalScripts = Array.isArray(runtime.optionalScripts)
      ? runtime.optionalScripts.slice()
      : [];
    let readyPromise = null;
    let optionalReadyPromise = null;

    const loadRequired = async () => {
      const odds = root.ChappyOddsFirstNavigation;
      if (typeof odds?.waitForActiveOdds === "function") {
        try {
          await odds.waitForActiveOdds(
            Number(runtime.oddsPriorityWaitMs || 2500)
          );
        } catch (_) {}
      }

      for (let index = 0; index < requiredScripts.length; index += 1) {
        preloadScriptsWithBuild(
          root,
          requiredScripts,
          index,
          PRELOAD_LOOKAHEAD
        );
        await loadScriptWithBuild(root, requiredScripts[index]);
      }
      validatePredictionRuntime(root);
      root.dispatchEvent?.(new root.CustomEvent(
        "chappy:prediction-runtime-ready",
        { detail: { version: BUILD, mobileTerminal: true } }
      ));
      return true;
    };

    const wrapped = Object.freeze({
      ...runtime,
      version: BUILD,
      legacyVersion: runtime.version || "",
      __mobileStartupTerminalWrapped: true,
      ensureReady() {
        if (readyPromise) return readyPromise;
        readyPromise = withTimeout(
          root,
          loadRequired(),
          Number(runtime.runtimeTotalTimeoutMs || RUNTIME_TOTAL_TIMEOUT_MS),
          startupError(
            "PREDICTION_RUNTIME_TIMEOUT",
            "予想ランタイム全体の準備が45秒を超えました"
          )
        ).catch(error => {
          readyPromise = null;
          renderStartupError(root, error);
          throw error;
        });
        return readyPromise;
      },
      ensureOptionalReady() {
        if (optionalReadyPromise) return optionalReadyPromise;
        optionalReadyPromise = (async () => {
          for (const src of optionalScripts) {
            await loadScriptWithBuild(root, src);
          }
          root.dispatchEvent?.(new root.CustomEvent(
            "chappy:prediction-runtime-optional-ready",
            { detail: { version: BUILD } }
          ));
          return true;
        })().catch(error => {
          root.dispatchEvent?.(new root.CustomEvent(
            "chappy:prediction-runtime-optional-unavailable",
            {
              detail: {
                version: BUILD,
                message: errorText(error)
              }
            }
          ));
          return false;
        });
        return optionalReadyPromise;
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
    loadScriptWithBuild,
    preloadScriptsWithBuild,
    wrapAppRuntime,
    wrapPredictionRuntime,
    clearHomeCache,
    reloadWithBuild,
    install
  };
});
