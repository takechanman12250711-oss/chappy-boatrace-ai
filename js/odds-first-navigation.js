/* =========================================================
  チャッピーボートレースAI
  ホーム選択直後のレース・オッズ先行取得

  重い予想ランタイムを読み込む前に、選択レースの出走データと
  公式3連単オッズを開始する。予想・買い目・選定条件は変更しない。
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
  const RESULT_PANEL_IDLE_TIMEOUT_MS = 8000;
  const INTENT_TIMEOUT_MS = 30000;
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

  function resolveParams(root, button) {
    const place = String(button?.dataset?.place || "").trim();
    const rno = Number(button?.dataset?.race || 0);
    const schedule = root?.ChappyHomeDashboardV2?.getSchedule?.() || [];
    const venue = (Array.isArray(schedule) ? schedule : []).find(item =>
      String(item?.place || "").trim() === place
    );
    const jcd = normalizeJcd(
      button?.dataset?.jcd || venue?.jcd,
      place
    );
    const date = normalizeDate(
      root?.ChappyHomeDashboardV2?.getDate?.() ||
      root?.document?.getElementById?.("dateInput")?.value
    );

    if (!place || !/^\d{2}$/.test(jcd) || rno < 1 || rno > 12 || !/^\d{8}$/.test(date)) {
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

  function install(root) {
    const requests = new Map();
    let activeKey = "";
    let navigationPending = false;
    let intentTimer = 0;
    let originalResultsLoad = null;
    let latestPredictionDetail = null;
    let resultPanelScheduled = false;

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
      status.textContent = `オッズ${count}通り先行取得済み・AI解析中`;
      status.dataset.state = "loading";
      return true;
    }

    function startPrefetch(button) {
      const params = resolveParams(root, button);
      if (!params) return null;

      activeKey = params.key;
      setNavigationPending(true, params.key);

      const current = requests.get(params.key);
      if (current) return current;

      const racePromise = Promise.resolve()
        .then(() => root.ChappyAPI?.prefetchRace?.(params) || null)
        .catch(error => {
          console.warn("レースデータ先行取得エラー", error?.message || error);
          return null;
        });

      const oddsPromise = Promise.resolve()
        .then(() => root.ChappyOddsFetchCache?.fetchData?.(params) || null)
        .then(data => {
          updateOddsStatus(params, data);
          return data;
        })
        .catch(error => {
          console.warn("オッズ先行取得エラー", error?.message || error);
          return null;
        });

      const record = Object.freeze({
        params,
        racePromise,
        oddsPromise
      });
      requests.set(params.key, record);

      Promise.allSettled([racePromise, oddsPromise])
        .finally(() => {
          root.setTimeout(() => {
            if (requests.get(params.key) === record) {
              requests.delete(params.key);
            }
          }, 15000);
        });

      return record;
    }

    function selectedButton(event) {
      return event?.target?.closest?.(HOME_RACE_SELECTOR) || null;
    }

    function handleRaceIntent(event) {
      const button = selectedButton(event);
      if (button && button.disabled !== true) startPrefetch(button);
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

    installDeferredResultPanel();

    return {
      startPrefetch,
      resolveParams: button => resolveParams(root, button),
      getActiveKey: () => activeKey,
      getPendingRequests: () => requests.size,
      isNavigationPending: () => navigationPending,
      installDeferredResultPanel,
      scheduleResultPanelLoad
    };
  }

  return {
    HOME_RACE_SELECTOR,
    RESULT_PANEL_IDLE_TIMEOUT_MS,
    INTENT_TIMEOUT_MS,
    PLACE_CODE_MAP,
    normalizeJcd,
    normalizeDate,
    resolveParams,
    positiveOddsCount,
    install
  };
});
