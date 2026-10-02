/* =========================================================
  チャッピーボートレースAI
  公式3連単オッズの単一リクエスト共有

  同じレースの同時取得を1通信へまとめ、取得済みの120通りを
  短時間だけ再利用する。予想・買い目・選定条件は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const moduleApi = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = moduleApi;
  }

  if (!root) return;

  const instance = moduleApi.create({
    root,
    fetchImpl: typeof root.fetch === "function" ? root.fetch.bind(root) : null
  });
  instance.install();
  root.ChappyOddsFetchCache = Object.freeze(instance);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const API_ORIGIN = "https://chappy-boatrace-api.vercel.app";
  const API_PATH = "/api/odds";
  const CACHE_TTL_MS = 5000;
  const REQUEST_TIMEOUT_MS = 12000;

  function normalizeParams(value) {
    const source = value && typeof value === "object" ? value : {};
    const jcd = String(
      source.jcd ?? source.stadiumCode ?? source.placeCode ?? ""
    )
      .replace(/\D/g, "")
      .padStart(2, "0")
      .slice(-2);
    const rno = Number(source.rno ?? source.raceNo ?? source.race ?? 0);
    const date = String(source.date ?? source.hd ?? "")
      .replace(/\D/g, "")
      .slice(0, 8);

    if (!/^\d{2}$/.test(jcd) || rno < 1 || rno > 12 || !/^\d{8}$/.test(date)) {
      return null;
    }

    return { jcd, rno, date };
  }

  function keyOf(value) {
    const params = normalizeParams(value);
    return params ? `${params.date}:${params.jcd}:${params.rno}` : "";
  }

  function urlFor(value) {
    const params = normalizeParams(value);
    if (!params) return "";
    return `${API_ORIGIN}${API_PATH}` +
      `?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;
  }

  function positiveOddsCount(byTicket) {
    if (!byTicket || typeof byTicket !== "object") return 0;
    return Object.values(byTicket).filter(value => {
      const odds = Number(value && typeof value === "object" ? value.odds ?? value.value : value);
      return Number.isFinite(odds) && odds > 0;
    }).length;
  }

  function usableData(data) {
    if (!data || typeof data !== "object" || data.ok === false || data.available === false) {
      return false;
    }
    return positiveOddsCount(data.byTicket) > 0 ||
      (Array.isArray(data.trifecta) && data.trifecta.some(item => Number(item?.odds) > 0));
  }

  function create({
    root,
    fetchImpl,
    cacheTtlMs = CACHE_TTL_MS,
    timeoutMs = REQUEST_TIMEOUT_MS,
    now = () => Date.now()
  } = {}) {
    const states = new Map();
    const stats = {
      networkRequests: 0,
      dedupedRequests: 0,
      cacheHits: 0,
      invalidResponses: 0
    };
    let installed = false;
    let nativeFetch = typeof fetchImpl === "function" ? fetchImpl : null;

    const URLCtor = root?.URL || (typeof URL === "function" ? URL : null);
    const ResponseCtor = root?.Response || (typeof Response === "function" ? Response : null);
    const AbortControllerCtor = root?.AbortController ||
      (typeof AbortController === "function" ? AbortController : null);

    function paramsFromInput(input) {
      if (!URLCtor) return null;
      const raw = typeof input === "string" || input instanceof URLCtor
        ? String(input)
        : String(input?.url || "");
      if (!raw) return null;

      let parsed;
      try {
        parsed = new URLCtor(raw, root?.location?.href || `${API_ORIGIN}/`);
      } catch (_) {
        return null;
      }

      if (parsed.origin !== API_ORIGIN || parsed.pathname !== API_PATH) return null;
      return normalizeParams({
        jcd: parsed.searchParams.get("jcd"),
        rno: parsed.searchParams.get("rno"),
        date: parsed.searchParams.get("date") || parsed.searchParams.get("hd")
      });
    }

    function headersSnapshot(headers) {
      const entries = [];
      try {
        headers?.forEach?.((value, key) => entries.push([key, value]));
      } catch (_) {}
      return entries;
    }

    async function snapshotResponse(response) {
      const body = await response.text();
      let data = null;
      try {
        data = JSON.parse(body);
      } catch (_) {}

      return {
        status: Number(response.status || 0),
        statusText: String(response.statusText || ""),
        headers: headersSnapshot(response.headers),
        body,
        data,
        ok: response.ok === true,
        valid: response.ok === true && usableData(data)
      };
    }

    function fallbackHeaders(entries) {
      const map = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), String(value)]));
      return {
        get(name) {
          return map.get(String(name || "").toLowerCase()) || null;
        },
        forEach(callback) {
          map.forEach((value, key) => callback(value, key));
        }
      };
    }

    function responseFromSnapshot(snapshot) {
      if (ResponseCtor) {
        return new ResponseCtor(snapshot.body, {
          status: snapshot.status,
          statusText: snapshot.statusText,
          headers: snapshot.headers
        });
      }

      const createFallback = () => ({
        ok: snapshot.ok,
        status: snapshot.status,
        statusText: snapshot.statusText,
        headers: fallbackHeaders(snapshot.headers),
        async json() {
          return JSON.parse(snapshot.body);
        },
        async text() {
          return snapshot.body;
        },
        clone: createFallback
      });
      return createFallback();
    }

    function abortError() {
      const DOMExceptionCtor = root?.DOMException ||
        (typeof DOMException === "function" ? DOMException : null);
      if (DOMExceptionCtor) return new DOMExceptionCtor("Aborted", "AbortError");
      const error = new Error("Aborted");
      error.name = "AbortError";
      return error;
    }

    function withCallerSignal(promise, signal) {
      if (!signal) return promise;
      if (signal.aborted) return Promise.reject(abortError());

      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => signal.removeEventListener?.("abort", onAbort);
        const onAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(abortError());
        };
        signal.addEventListener?.("abort", onAbort, { once: true });
        promise.then(
          value => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
          },
          error => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
          }
        );
      });
    }

    function dispatchUpdated(params, snapshot) {
      if (!root?.dispatchEvent || !root?.CustomEvent || !snapshot.valid) return;
      root.dispatchEvent(new root.CustomEvent("chappy:odds-cache-updated", {
        detail: {
          ...params,
          count: Number(snapshot.data?.count || positiveOddsCount(snapshot.data?.byTicket)),
          checkedAt: new Date(now()).toISOString()
        }
      }));
    }

    function getFreshSnapshot(params) {
      const key = keyOf(params);
      const state = key ? states.get(key) : null;
      if (!state?.snapshot) return null;
      if (now() - Number(state.savedAt || 0) > cacheTtlMs) {
        if (!state.promise) states.delete(key);
        return null;
      }
      return state.snapshot;
    }

    function fetchSnapshot(params, requestInput, init = {}, options = {}) {
      const normalized = normalizeParams(params);
      const key = keyOf(normalized);
      if (!normalized || !key || typeof nativeFetch !== "function") {
        return Promise.reject(new Error("オッズ取得条件を確認できません"));
      }

      const current = states.get(key);
      if (!options.force) {
        const cached = getFreshSnapshot(normalized);
        if (cached) {
          stats.cacheHits += 1;
          return Promise.resolve(cached);
        }
      }
      if (current?.promise) {
        stats.dedupedRequests += 1;
        return current.promise;
      }

      const controller = AbortControllerCtor ? new AbortControllerCtor() : null;
      let timedOut = false;
      const timer = controller
        ? root?.setTimeout?.(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : 0;
      const networkInit = { ...(init || {}) };
      delete networkInit.signal;
      if (controller) networkInit.signal = controller.signal;

      stats.networkRequests += 1;
      const promise = Promise.resolve(
        nativeFetch(requestInput || urlFor(normalized), networkInit)
      )
        .then(snapshotResponse)
        .then(snapshot => {
          if (snapshot.valid) {
            states.set(key, {
              snapshot,
              savedAt: now(),
              promise: null
            });
            dispatchUpdated(normalized, snapshot);
          } else {
            stats.invalidResponses += 1;
            states.delete(key);
          }
          return snapshot;
        })
        .catch(error => {
          states.delete(key);
          if (timedOut && error?.name === "AbortError") {
            throw new Error(`オッズAPI応答が${Math.round(timeoutMs / 1000)}秒を超えました`);
          }
          throw error;
        })
        .finally(() => {
          if (timer) root?.clearTimeout?.(timer);
        });

      states.set(key, {
        snapshot: current?.snapshot || null,
        savedAt: Number(current?.savedAt || 0),
        promise
      });
      return promise;
    }

    function fetchResponse(params, init = {}, options = {}) {
      const normalized = normalizeParams(params);
      const callerSignal = init?.signal || options?.signal || null;
      const promise = fetchSnapshot(
        normalized,
        options.requestInput || urlFor(normalized),
        init,
        options
      ).then(responseFromSnapshot);
      return withCallerSignal(promise, callerSignal);
    }

    function fetchData(params, options = {}) {
      const normalized = normalizeParams(params);
      const promise = fetchSnapshot(
        normalized,
        urlFor(normalized),
        {},
        options
      ).then(snapshot => snapshot.valid ? snapshot.data : null);
      return withCallerSignal(promise, options.signal || null);
    }

    function getCachedData(params) {
      return getFreshSnapshot(params)?.data || null;
    }

    function clear(params) {
      const key = keyOf(params);
      if (key) states.delete(key);
      else states.clear();
    }

    function install() {
      if (installed || !root || typeof root.fetch !== "function") return false;
      if (root.fetch.__chappyOddsFetchCachePatched === true) {
        installed = true;
        return false;
      }

      if (!nativeFetch) nativeFetch = root.fetch.bind(root);
      const originalFetch = root.fetch.bind(root);
      const patchedFetch = function (input, init = {}) {
        const params = paramsFromInput(input);
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        if (!params || method !== "GET") return originalFetch(input, init);

        const force = init?.cache === "no-store" || init?.cache === "reload";
        return fetchResponse(params, init, {
          force,
          requestInput: input
        });
      };
      Object.defineProperty(patchedFetch, "__chappyOddsFetchCachePatched", {
        value: true
      });
      root.fetch = patchedFetch;
      installed = true;
      return true;
    }

    return {
      version: "odds-fetch-cache-v1",
      install,
      normalizeParams,
      paramsFromInput,
      keyOf,
      urlFor,
      usableData,
      fetchResponse,
      fetchData,
      getCachedData,
      clear,
      getStats: () => ({ ...stats })
    };
  }

  return {
    API_ORIGIN,
    API_PATH,
    CACHE_TTL_MS,
    REQUEST_TIMEOUT_MS,
    normalizeParams,
    keyOf,
    urlFor,
    positiveOddsCount,
    usableData,
    create
  };
});
