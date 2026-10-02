/* =========================================================
  チャッピーボートレースAI
  ホーム選択直後のレース・オッズ先行取得

  重い予想ランタイムを読み込む前に、選択レースの出走データと
  公式3連単オッズを開始する。取得済みオッズは通常予想へそのまま
  引き渡し、同じレースを二重取得しない。
  予想・買い目・選定条件は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (!root || root.ChappyOddsFirstNavigation) return;
  root.ChappyOddsFirstNavigation = Object.freeze({
    ...api,
    ...api.install(root)
  });
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const HOME_RACE_SELECTOR = "[data-place][data-race]";
  const FLOW_RACE_SELECTOR = "[data-flow-place][data-flow-race]";
  const RACE_INTENT_SELECTOR = `${HOME_RACE_SELECTOR},${FLOW_RACE_SELECTOR}`;
  const API_ORIGIN = "https://chappy-boatrace-api.vercel.app";
  const ODDS_API_PATH = "/api/odds";
  const RESULT_PANEL_IDLE_TIMEOUT_MS = 8000;
  const INTENT_TIMEOUT_MS = 30000;
  const PREFETCH_RETENTION_MS = 120000;
  const ODDS_PRIORITY_WAIT_MS = 2500;
  const PLACE_CODE_MAP = Object.freeze({
    桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04",
    多摩川: "05", 浜名湖: "06", 蒲郡: "07", 常滑: "08",
    津: "09", 三国: "10", びわこ: "11", 住之江: "12",
    尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16",
    宮島: "17", 徳山: "18", 下関: "19", 若松: "20",
    芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
  });

  function normalizeJcd(value, place = "") {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits) return digits.padStart(2, "0").slice(-2);
    return PLACE_CODE_MAP[String(place || "").trim()] || "";
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function normalizeParams(value = {}) {
    const place = String(
      value?.place || value?.flowPlace || ""
    ).trim();
    const jcd = normalizeJcd(
      value?.jcd ?? value?.stadiumCode ?? value?.flowJcd,
      place
    );
    const rno = Number(
      value?.rno ?? value?.raceNo ?? value?.race ?? value?.flowRace ?? 0
    );
    const date = normalizeDate(value?.date ?? value?.hd);

    if (!/^\d{2}$/.test(jcd) || rno < 1 || rno > 12 || !/^\d{8}$/.test(date)) {
      return null;
    }

    return {
      place,
      jcd,
      rno,
      date,
      key: `${date}:${jcd}:${rno}`
    };
  }

  function resolveParams(root, button) {
    const place = String(
      button?.dataset?.place ||
      button?.dataset?.flowPlace ||
      root?.document?.getElementById?.("placeSelect")?.value ||
      ""
    ).trim();
    const rno = Number(
      button?.dataset?.race ||
      button?.dataset?.flowRace ||
      button?.dataset?.raceNo ||
      0
    );
    const schedule = root?.ChappyHomeDashboardV2?.getSchedule?.() || [];
    const venue = (Array.isArray(schedule) ? schedule : []).find(item =>
      String(item?.place || "").trim() === place
    );
    const jcd = normalizeJcd(
      button?.dataset?.jcd ||
      button?.dataset?.flowJcd ||
      venue?.jcd,
      place
    );
    const date = normalizeDate(
      root?.ChappyHomeDashboardV2?.getDate?.() ||
      root?.document?.getElementById?.("dateInput")?.value
    );

    return normalizeParams({ place, jcd, rno, date });
  }

  function positiveOddsCount(data) {
    const byTicket = data?.byTicket;
    if (byTicket && typeof byTicket === "object") {
      return Object.values(byTicket).filter(value => {
        const odds = Number(
          value && typeof value === "object"
            ? value.odds ?? value.value
            : value
        );
        return Number.isFinite(odds) && odds > 0;
      }).length;
    }
    return Array.isArray(data?.trifecta)
      ? data.trifecta.filter(item => Number(item?.odds) > 0).length
      : 0;
  }

  function usableOddsData(data) {
    return Boolean(
      data &&
      typeof data === "object" &&
      data.ok !== false &&
      data.available !== false &&
      positiveOddsCount(data) > 0
    );
  }

  function paramsFromRequest(root, input) {
    const URLCtor = root?.URL || (typeof URL === "function" ? URL : null);
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

    if (parsed.origin !== API_ORIGIN || parsed.pathname !== ODDS_API_PATH) {
      return null;
    }

    return normalizeParams({
      jcd: parsed.searchParams.get("jcd"),
      rno: parsed.searchParams.get("rno"),
      date: parsed.searchParams.get("date") || parsed.searchParams.get("hd")
    });
  }

  function responseFromData(root, data) {
    const body = JSON.stringify(data || {});
    const ResponseCtor = root?.Response ||
      (typeof Response === "function" ? Response : null);
    if (ResponseCtor) {
      return new ResponseCtor(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-chappy-odds-prefetch": "hit"
        }
      });
    }

    const createFallback = () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get(name) {
          return String(name || "").toLowerCase() === "content-type"
            ? "application/json; charset=utf-8"
            : null;
        },
        forEach(callback) {
          callback("application/json; charset=utf-8", "content-type");
          callback("hit", "x-chappy-odds-prefetch");
        }
      },
      async json() {
        return JSON.parse(body);
      },
      async text() {
        return body;
      },
      clone: createFallback
    });
    return createFallback();
  }

  function install(root) {
    const requests = new Map();
    let activeKey = "";
    let navigationPending = false;
    let intentTimer = 0;
    let originalResultsLoad = null;
    let latestPredictionDetail = null;
    let resultPanelScheduled = false;
    let statusObserver = null;
    let observedStatus = null;

    function now() {
      return Date.now();
    }

    function recordFor(value) {
      const key = typeof value === "string"
        ? value
        : normalizeParams(value)?.key || "";
      if (!key) return null;
      const record = requests.get(key) || null;
      if (!record) return null;
      if (Number(record.expiresAt || 0) <= now()) {
        requests.delete(key);
        return null;
      }
      return record;
    }

    function setNavigationPending(value, key = activeKey) {
      navigationPending = value === true;
      if (intentTimer) root.clearTimeout(intentTimer);
      intentTimer = 0;
      if (!navigationPending) return;
      intentTimer = root.setTimeout(() => {
        if (activeKey === key) navigationPending = false;
      }, INTENT_TIMEOUT_MS);
    }

    function updateOddsStatus(params, data) {
      if (!params || params.key !== activeKey) return false;
      const count = Number(data?.count || positiveOddsCount(data));
      if (count <= 0) return false;
      const status = root.document?.getElementById?.("predictionOddsStatus");
      if (!status) return false;
      status.dataset.prefetchedOddsKey = params.key;
      status.dataset.prefetchedOddsCount = String(count);
      status.textContent = `オッズ${count}通り取得済み・AI解析中`;
      status.dataset.state = "loading";
      return true;
    }

    function keepPrefetchedStatusVisible() {
      if (!navigationPending) return;
      const record = recordFor(activeKey);
      if (!usableOddsData(record?.oddsData)) return;
      const status = root.document?.getElementById?.("predictionOddsStatus");
      if (!status) return;
      const text = String(status.textContent || "");
      if (
        status.dataset.state === "loading" &&
        /オッズ(?:取得中|待機中)|オッズ取得中/.test(text) &&
        !/取得済み|反映済み/.test(text)
      ) {
        updateOddsStatus(record.params, record.oddsData);
      }
    }

    function ensureStatusObserver() {
      const status = root.document?.getElementById?.("predictionOddsStatus");
      if (!status || typeof root.MutationObserver !== "function") return false;
      if (observedStatus === status && statusObserver) return true;
      statusObserver?.disconnect?.();
      observedStatus = status;
      statusObserver = new root.MutationObserver(() => {
        const queue = typeof root.queueMicrotask === "function"
          ? root.queueMicrotask.bind(root)
          : callback => root.setTimeout(callback, 0);
        queue(keepPrefetchedStatusVisible);
      });
      statusObserver.observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state"]
      });
      return true;
    }

    function dispatchPrefetched(params, data) {
      if (!root.dispatchEvent || !root.CustomEvent || !usableOddsData(data)) return;
      root.dispatchEvent(new root.CustomEvent("chappy:odds-prefetched", {
        detail: {
          ...params,
          count: Number(data?.count || positiveOddsCount(data)),
          oddsData: data,
          checkedAt: new Date().toISOString()
        }
      }));
    }

    function scheduleRecordExpiry(record) {
      const delay = Math.max(1000, Number(record.expiresAt || 0) - now());
      root.setTimeout(() => {
        if (
          requests.get(record.params.key) === record &&
          Number(record.expiresAt || 0) <= now()
        ) {
          requests.delete(record.params.key);
        }
      }, delay);
    }

    function startPrefetch(buttonOrParams) {
      const params = buttonOrParams?.dataset
        ? resolveParams(root, buttonOrParams)
        : normalizeParams(buttonOrParams);
      if (!params) return null;

      activeKey = params.key;
      setNavigationPending(true, params.key);
      ensureStatusObserver();

      const current = recordFor(params);
      if (current) {
        if (usableOddsData(current.oddsData)) {
          updateOddsStatus(params, current.oddsData);
        }
        return current;
      }

      const record = {
        params,
        createdAt: now(),
        expiresAt: now() + PREFETCH_RETENTION_MS,
        settledAt: 0,
        raceData: null,
        oddsData: null,
        racePromise: null,
        oddsPromise: null
      };
      requests.set(params.key, record);

      record.racePromise = Promise.resolve()
        .then(() => root.ChappyAPI?.prefetchRace?.(params) || null)
        .then(data => {
          record.raceData = data;
          return data;
        })
        .catch(error => {
          console.warn("レースデータ先行取得エラー", error?.message || error);
          return null;
        });

      record.oddsPromise = Promise.resolve()
        .then(() => root.ChappyOddsFetchCache?.fetchData?.(params) || null)
        .then(data => {
          if (usableOddsData(data)) {
            record.oddsData = data;
            record.expiresAt = now() + PREFETCH_RETENTION_MS;
            updateOddsStatus(params, data);
            dispatchPrefetched(params, data);
          }
          return data;
        })
        .catch(error => {
          console.warn("オッズ先行取得エラー", error?.message || error);
          return null;
        });

      Promise.allSettled([record.racePromise, record.oddsPromise])
        .finally(() => {
          record.settledAt = now();
          scheduleRecordExpiry(record);
        });

      return record;
    }

    function getPrefetchedOdds(value = activeKey) {
      const record = recordFor(value);
      return usableOddsData(record?.oddsData) ? record.oddsData : null;
    }

    function getPrefetchedRace(value = activeKey) {
      return recordFor(value)?.raceData || null;
    }

    function getPrefetchRecord(value = activeKey) {
      return recordFor(value);
    }

    function waitForActiveOdds(timeoutMs = ODDS_PRIORITY_WAIT_MS) {
      const record = recordFor(activeKey);
      if (!record) return Promise.resolve(null);
      if (usableOddsData(record.oddsData)) return Promise.resolve(record.oddsData);
      if (!record.oddsPromise) return Promise.resolve(null);

      return new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          if (timer) root.clearTimeout(timer);
          resolve(usableOddsData(value) ? value : null);
        };
        const timer = root.setTimeout(
          () => finish(null),
          Math.max(0, Number(timeoutMs || 0))
        );
        record.oddsPromise.then(finish, () => finish(null));
      });
    }

    function clearPrefetch(value = activeKey) {
      const record = recordFor(value);
      const key = record?.params?.key ||
        (typeof value === "string" ? value : normalizeParams(value)?.key || "");
      if (record?.params) {
        root.ChappyOddsFetchCache?.clear?.(record.params);
      }
      if (key) requests.delete(key);
      if (!key || key === activeKey) {
        activeKey = "";
        setNavigationPending(false);
      }
      const status = root.document?.getElementById?.("predictionOddsStatus");
      if (status) {
        delete status.dataset.prefetchedOddsKey;
        delete status.dataset.prefetchedOddsCount;
      }
      return Boolean(key);
    }

    function selectedButton(event) {
      return event?.target?.closest?.(RACE_INTENT_SELECTOR) || null;
    }

    function handleRaceIntent(event) {
      const button = selectedButton(event);
      if (button && button.disabled !== true) startPrefetch(button);
    }

    function handleExplicitRefresh(event) {
      const target = event?.target?.closest?.("#refreshOddsBtn,#reloadRaceBtn");
      if (target) clearPrefetch(activeKey);
    }

    function installFetchBridge() {
      if (typeof root.fetch !== "function") return false;
      if (root.fetch.__chappyOddsFirstBridge === true) return false;

      const currentFetch = root.fetch;
      const downstreamFetch = currentFetch.bind(root);
      const bridge = function (input, init = {}) {
        const method = String(init?.method || input?.method || "GET").toUpperCase();
        const params = paramsFromRequest(root, input);
        const force =
          init?.cache === "reload" ||
          init?.cache === "no-store" ||
          init?.chappyForceOdds === true;
        if (!params || method !== "GET" || force) {
          return downstreamFetch(input, init);
        }

        const record = recordFor(params);
        if (!record) return downstreamFetch(input, init);
        const source = usableOddsData(record.oddsData)
          ? Promise.resolve(record.oddsData)
          : record.oddsPromise;
        if (!source) return downstreamFetch(input, init);

        return Promise.resolve(source)
          .then(data =>
            usableOddsData(data)
              ? responseFromData(root, data)
              : downstreamFetch(input, init)
          )
          .catch(() => downstreamFetch(input, init));
      };
      Object.defineProperty(bridge, "__chappyOddsFirstBridge", {
        value: true
      });
      if (currentFetch.__chappyOddsFetchCachePatched === true) {
        Object.defineProperty(bridge, "__chappyOddsFetchCachePatched", {
          value: true
        });
      }
      root.fetch = bridge;
      return true;
    }

    function installDeferredResultPanel() {
      const service = root.ChappyTodayResultsHome;
      if (!service || typeof service.load !== "function" || service.__oddsFirstWrapped === true) {
        return false;
      }

      originalResultsLoad = service.load.bind(service);
      root.ChappyTodayResultsHome = Object.freeze({
        ...service,
        __oddsFirstWrapped: true,
        load(...args) {
          if (navigationPending && !root.ChappyRaceFlowResultPanel) {
            return Promise.resolve(null);
          }
          return originalResultsLoad(...args);
        }
      });
      return true;
    }

    function dispatchPredictionForResultPanel(detail) {
      if (!detail || !root.CustomEvent) return;
      root.dispatchEvent(new root.CustomEvent("chappy:prediction-rendered", {
        detail: {
          ...detail,
          deferredResultPanel: true
        }
      }));
    }

    function scheduleResultPanelLoad() {
      if (
        resultPanelScheduled ||
        root.ChappyRaceFlowResultPanel ||
        typeof originalResultsLoad !== "function" ||
        !latestPredictionDetail
      ) {
        return false;
      }

      resultPanelScheduled = true;
      const run = () => {
        Promise.resolve(originalResultsLoad())
          .then(panel => {
            if (panel && latestPredictionDetail) {
              dispatchPredictionForResultPanel(latestPredictionDetail);
            }
          })
          .catch(error => {
            console.warn("結果表示の遅延読込エラー", error?.message || error);
          })
          .finally(() => {
            resultPanelScheduled = false;
          });
      };

      if (typeof root.requestIdleCallback === "function") {
        root.requestIdleCallback(run, { timeout: RESULT_PANEL_IDLE_TIMEOUT_MS });
      } else {
        root.setTimeout(run, 2500);
      }
      return true;
    }

    root.document?.addEventListener?.("pointerdown", handleRaceIntent, {
      capture: true,
      passive: true
    });
    root.document?.addEventListener?.("click", handleRaceIntent, true);
    root.document?.addEventListener?.("click", handleExplicitRefresh, true);

    root.addEventListener?.("chappy:prediction-rendered", event => {
      if (event?.detail?.deferredResultPanel === true) return;
      latestPredictionDetail = event?.detail || null;
      setNavigationPending(false);
      scheduleResultPanelLoad();
    });

    root.addEventListener?.("chappy:view-changed", event => {
      if (event?.detail?.view !== "prediction") {
        setNavigationPending(false);
      }
    });

    installFetchBridge();
    installDeferredResultPanel();

    return {
      startPrefetch,
      resolveParams: button => resolveParams(root, button),
      getActiveKey: () => activeKey,
      getPendingRequests: () => requests.size,
      getPrefetchRecord,
      getPrefetchedOdds,
      getPrefetchedRace,
      waitForActiveOdds,
      clearPrefetch,
      isNavigationPending: () => navigationPending,
      installFetchBridge,
      installDeferredResultPanel,
      scheduleResultPanelLoad
    };
  }

  return {
    HOME_RACE_SELECTOR,
    FLOW_RACE_SELECTOR,
    RACE_INTENT_SELECTOR,
    API_ORIGIN,
    ODDS_API_PATH,
    RESULT_PANEL_IDLE_TIMEOUT_MS,
    INTENT_TIMEOUT_MS,
    PREFETCH_RETENTION_MS,
    ODDS_PRIORITY_WAIT_MS,
    PLACE_CODE_MAP,
    normalizeJcd,
    normalizeDate,
    normalizeParams,
    resolveParams,
    positiveOddsCount,
    usableOddsData,
    paramsFromRequest,
    responseFromData,
    install
  };
});
