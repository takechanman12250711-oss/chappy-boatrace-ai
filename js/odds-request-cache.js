/* =========================================================
  チャッピーボートレースAI
  公式オッズ通信の重複防止

  同じレースの /api/odds が同時に複数箇所から要求されても、
  1回の通信結果を共有する。予想・買い目・選定条件は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    const runtime = api.install(root);
    root.ChappyOddsRequestCache = Object.freeze({
      ...api,
      ...runtime
    });
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const API_HOST = "chappy-boatrace-api.vercel.app";
  const ODDS_PATH = "/api/odds";
  const AVAILABLE_TTL_MS = 15000;
  const EMPTY_TTL_MS = 3000;
  const INSTALL_FLAG = "__chappyOddsRequestCacheRuntime";

  function methodOf(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function urlOf(input, baseUrl = "https://localhost/") {
    const raw = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input?.url || "");
    try {
      return new URL(raw, baseUrl);
    } catch (_) {
      return null;
    }
  }

  function isOddsRequest(input, init, baseUrl) {
    if (methodOf(input, init) !== "GET") return false;
    const url = urlOf(input, baseUrl);
    return Boolean(
      url &&
      url.hostname === API_HOST &&
      url.pathname === ODDS_PATH
    );
  }

  function requestKey(input, init, baseUrl) {
    const url = urlOf(input, baseUrl);
    if (!url) return "";
    const sorted = [...url.searchParams.entries()]
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
      );
    url.search = "";
    sorted.forEach(([key, value]) => url.searchParams.append(key, value));
    return `${methodOf(input, init)} ${url.toString()}`;
  }

  function ttlFor(snapshot) {
    if (!snapshot || snapshot.status < 200 || snapshot.status >= 300) return 0;
    try {
      const data = JSON.parse(snapshot.body || "null");
      if (data?.ok === false) return 0;
      const available =
        data?.available !== false &&
        data?.byTicket &&
        typeof data.byTicket === "object" &&
        Object.keys(data.byTicket).length > 0;
      return available ? AVAILABLE_TTL_MS : EMPTY_TTL_MS;
    } catch (_) {
      return 0;
    }
  }

  function createResponse(snapshot, ResponseCtor = globalThis.Response) {
    if (typeof ResponseCtor !== "function") {
      throw new Error("Response APIを利用できません");
    }
    return new ResponseCtor(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    });
  }

  function install(root) {
    if (!root || typeof root.fetch !== "function") {
      return Object.freeze({
        installed: false,
        getOdds: async () => {
          throw new Error("公式オッズ通信を利用できません");
        },
        clear: () => false,
        size: () => 0
      });
    }
    if (root[INSTALL_FLAG]) return root[INSTALL_FLAG];

    const originalFetch = root.fetch.bind(root);
    const cache = new Map();
    const baseUrl = String(root.location?.href || "https://localhost/");
    const ResponseCtor = root.Response || globalThis.Response;

    const cachedFetch = (input, init) => {
      if (!isOddsRequest(input, init, baseUrl)) {
        return originalFetch(input, init);
      }

      const key = requestKey(input, init, baseUrl);
      const now = Date.now();
      const cached = cache.get(key);

      if (cached?.snapshot && cached.expiresAt > now) {
        return Promise.resolve(createResponse(cached.snapshot, ResponseCtor));
      }
      if (cached?.promise) {
        return cached.promise.then(snapshot =>
          createResponse(snapshot, ResponseCtor)
        );
      }

      const promise = originalFetch(input, init)
        .then(async response => {
          const snapshot = {
            body: await response.text(),
            status: Number(response.status || 0),
            statusText: String(response.statusText || ""),
            headers: [...response.headers.entries()]
          };
          const ttl = ttlFor(snapshot);
          if (ttl > 0) {
            cache.set(key, {
              snapshot,
              expiresAt: Date.now() + ttl,
              promise: null
            });
          } else {
            cache.delete(key);
          }
          return snapshot;
        })
        .catch(error => {
          if (cache.get(key)?.promise === promise) cache.delete(key);
          throw error;
        });

      cache.set(key, {
        snapshot: null,
        expiresAt: 0,
        promise
      });

      return promise.then(snapshot => createResponse(snapshot, ResponseCtor));
    };

    async function getOdds({ jcd, rno, raceNo, date } = {}) {
      const stadiumCode = String(jcd || "").replace(/\D/g, "").padStart(2, "0");
      const selectedRaceNo = Number(rno ?? raceNo ?? 0);
      const selectedDate = String(date || "").replace(/\D/g, "").slice(0, 8);
      if (
        !/^\d{2}$/.test(stadiumCode) ||
        selectedRaceNo < 1 ||
        selectedRaceNo > 12 ||
        !/^\d{8}$/.test(selectedDate)
      ) {
        throw new Error("公式オッズのレース情報が不足しています");
      }

      const url =
        `https://${API_HOST}${ODDS_PATH}` +
        `?jcd=${encodeURIComponent(stadiumCode)}` +
        `&rno=${encodeURIComponent(selectedRaceNo)}` +
        `&date=${encodeURIComponent(selectedDate)}`;
      const response = await cachedFetch(url);
      const data = await response.json();
      if (!response.ok || !data || data.ok === false) {
        throw new Error(data?.error || `オッズAPIエラー：${response.status}`);
      }
      return data;
    }

    const runtime = Object.freeze({
      installed: true,
      fetch: cachedFetch,
      getOdds,
      clear() {
        cache.clear();
        return true;
      },
      size: () => cache.size
    });

    root.fetch = cachedFetch;
    root[INSTALL_FLAG] = runtime;
    return runtime;
  }

  return {
    API_HOST,
    ODDS_PATH,
    AVAILABLE_TTL_MS,
    EMPTY_TTL_MS,
    methodOf,
    urlOf,
    isOddsRequest,
    requestKey,
    ttlFor,
    createResponse,
    install
  };
});
