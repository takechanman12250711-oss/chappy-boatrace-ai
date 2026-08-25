/* =========================================================
  チャッピーボートレースAI
  公式結果APIの永久待機防止

  振り返り予想は予想本体を先に描画する。
  その後の公式結果取得だけに上限時間を設け、APIが応答しない時も
  「予想表示済み・公式結果取得失敗」の終端状態へ必ず移行させる。
  予想ロジック・配点・買い目・オッズ・UI構成は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (!root || root.ChappyResultRequestTimeout) return;

  root.ChappyResultRequestTimeout = Object.freeze({
    ...api,
    ...api.install(root)
  });
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "20260825-mobile-startup-terminal1";
  const API_ORIGIN = "https://chappy-boatrace-api.vercel.app";
  const RESULT_API_PATH = "/api/result";
  const RESULT_REQUEST_TIMEOUT_MS = 12000;

  function resultRequestParams(root, input) {
    const URLCtor = root?.URL ||
      (typeof URL === "function" ? URL : null);
    if (!URLCtor) return null;

    const raw =
      typeof input === "string" ||
      input instanceof URLCtor
        ? String(input)
        : String(input?.url || "");
    if (!raw) return null;

    let parsed;
    try {
      parsed = new URLCtor(
        raw,
        root?.location?.href || `${API_ORIGIN}/`
      );
    } catch (_) {
      return null;
    }

    if (
      parsed.origin !== API_ORIGIN ||
      parsed.pathname !== RESULT_API_PATH
    ) {
      return null;
    }

    return {
      date:
        parsed.searchParams.get("date") ||
        parsed.searchParams.get("hd") ||
        "",
      jcd:
        parsed.searchParams.get("jcd") ||
        "",
      rno:
        parsed.searchParams.get("rno") ||
        ""
    };
  }

  function createTimeoutError(timeoutMs) {
    const error = new Error(
      `公式結果APIの応答が${Math.round(timeoutMs / 1000)}秒を超えました`
    );
    error.name = "ResultTimeoutError";
    error.code = "CHAPPY_RESULT_TIMEOUT";
    error.timeoutMs = timeoutMs;
    return error;
  }

  function copyFetchMarkers(source, target) {
    [
      "__chappyOddsFirstBridge",
      "__chappyOddsFetchCachePatched"
    ].forEach(key => {
      if (source?.[key] !== true) return;
      try {
        Object.defineProperty(target, key, {
          configurable: true,
          value: true
        });
      } catch (_) {}
    });
  }

  function install(
    root,
    {
      timeoutMs = RESULT_REQUEST_TIMEOUT_MS
    } = {}
  ) {
    if (!root || typeof root.fetch !== "function") {
      return {
        installed: false,
        timeoutMs
      };
    }

    if (root.fetch.__chappyResultRequestTimeoutPatched === true) {
      return {
        installed: false,
        timeoutMs
      };
    }

    const currentFetch = root.fetch;
    const downstreamFetch = currentFetch.bind(root);
    const AbortControllerCtor = root.AbortController ||
      (typeof AbortController === "function"
        ? AbortController
        : null);

    const patchedFetch = function (input, init = {}) {
      const method = String(
        init?.method || input?.method || "GET"
      ).toUpperCase();
      const params = resultRequestParams(root, input);

      if (
        !params ||
        method !== "GET" ||
        init?.chappySkipResultTimeout === true
      ) {
        if (init?.chappySkipResultTimeout === true) {
          const nextInit = { ...init };
          delete nextInit.chappySkipResultTimeout;
          return downstreamFetch(input, nextInit);
        }
        return downstreamFetch(input, init);
      }

      const controller = AbortControllerCtor
        ? new AbortControllerCtor()
        : null;
      const callerSignal = init?.signal || input?.signal || null;
      const networkInit = { ...init };
      let removeCallerAbort = null;

      if (controller) {
        if (callerSignal?.aborted) {
          controller.abort();
        } else if (callerSignal?.addEventListener) {
          const onCallerAbort = () => controller.abort();
          callerSignal.addEventListener("abort", onCallerAbort, {
            once: true
          });
          removeCallerAbort = () =>
            callerSignal.removeEventListener?.("abort", onCallerAbort);
        }
        networkInit.signal = controller.signal;
      }

      let timer = 0;
      let timedOut = false;
      const timeout = new Promise((_, reject) => {
        timer = root.setTimeout(() => {
          timedOut = true;
          // WebKitではabort()自体が戻らない場合があるため、
          // 終端保証は中断通知に依存させない。
          reject(createTimeoutError(timeoutMs));
        }, Math.max(1, Number(timeoutMs) || RESULT_REQUEST_TIMEOUT_MS));
      });

      const network = Promise.resolve(
        downstreamFetch(input, networkInit)
      ).catch(error => {
        if (
          timedOut &&
          error?.name === "AbortError"
        ) {
          throw createTimeoutError(timeoutMs);
        }
        throw error;
      });

      return Promise.race([network, timeout])
        .finally(() => {
          if (timer) root.clearTimeout(timer);
          removeCallerAbort?.();
        });
    };

    copyFetchMarkers(currentFetch, patchedFetch);
    Object.defineProperty(
      patchedFetch,
      "__chappyResultRequestTimeoutPatched",
      {
        configurable: true,
        value: true
      }
    );

    root.fetch = patchedFetch;

    return {
      installed: true,
      timeoutMs
    };
  }

  return {
    version: VERSION,
    apiOrigin: API_ORIGIN,
    resultApiPath: RESULT_API_PATH,
    timeoutMs: RESULT_REQUEST_TIMEOUT_MS,
    resultRequestParams,
    createTimeoutError,
    install
  };
});
