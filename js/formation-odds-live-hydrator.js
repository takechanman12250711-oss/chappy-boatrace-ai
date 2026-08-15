/* =========================================================
  チャッピーボートレースAI
  フォーメーション全点オッズの表示補強

  予想表示後、共有済みの公式オッズ120通りを表示用データへ接続する。
  予想・買い目・購入対象・選定条件は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyFormationOddsLiveHydrator = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const INSTALL_FLAG = "__chappyFormationOddsLiveHydratorInstalled";
  const WRAPPED_FLAG = "__chappyFormationOddsLiveHydratorWrapped";
  const inFlightByPrediction = new WeakMap();

  function digits(value) {
    return String(value ?? "").replace(/\D/g, "");
  }

  function paramsFromPrediction(prediction, root = null) {
    const race = prediction?.race || {};
    const rawRace = prediction?.rawRaceData || prediction?.raceData || {};
    const documentObject = root?.document || null;
    const selectedPlaceOption = documentObject
      ?.getElementById?.("placeSelect")
      ?.selectedOptions?.[0];
    const selectedRaceOption = documentObject
      ?.getElementById?.("raceSelect")
      ?.selectedOptions?.[0];

    const jcd = digits(
      race.stadiumCode ||
      race.jcd ||
      rawRace.stadiumCode ||
      rawRace.jcd ||
      prediction?.stadiumCode ||
      prediction?.jcd ||
      selectedPlaceOption?.dataset?.jcd ||
      ""
    ).padStart(2, "0").slice(-2);
    const raceNo = Number(
      race.raceNo ||
      race.rno ||
      rawRace.raceNo ||
      rawRace.rno ||
      prediction?.raceNo ||
      prediction?.rno ||
      selectedRaceOption?.dataset?.rno ||
      digits(documentObject?.getElementById?.("raceSelect")?.value) ||
      0
    );
    const date = digits(
      race.date ||
      rawRace.date ||
      prediction?.date ||
      documentObject?.getElementById?.("dateInput")?.value ||
      ""
    ).slice(0, 8);

    if (
      !/^\d{2}$/.test(jcd) ||
      raceNo < 1 ||
      raceNo > 12 ||
      !/^\d{8}$/.test(date)
    ) {
      return null;
    }
    return { jcd, rno: raceNo, date };
  }

  function hasUsableOdds(oddsData) {
    if (
      !oddsData ||
      oddsData.available === false ||
      !oddsData.byTicket ||
      typeof oddsData.byTicket !== "object"
    ) {
      return false;
    }
    return Object.values(oddsData.byTicket).some(value => {
      const odds = Number(value);
      return Number.isFinite(odds) && odds > 0;
    });
  }

  function attachDisplayOdds(prediction, oddsData) {
    if (!prediction || typeof prediction !== "object" || !hasUsableOdds(oddsData)) {
      return false;
    }
    prediction.odds = {
      ...(prediction.odds && typeof prediction.odds === "object"
        ? prediction.odds
        : {}),
      ...oddsData,
      byTicket: { ...oddsData.byTicket },
      displayOnly: true
    };
    return true;
  }

  function applyFormationDisplay(prediction, root) {
    const display = root?.ChappyFormationOddsDisplay;
    if (!display || typeof display.apply !== "function") return false;
    return display.apply(prediction, root.document);
  }

  function hydrate(prediction, root) {
    if (!prediction || typeof prediction !== "object" || !root) {
      return Promise.resolve(false);
    }

    if (hasUsableOdds(prediction.odds)) {
      return Promise.resolve(applyFormationDisplay(prediction, root));
    }

    const existing = inFlightByPrediction.get(prediction);
    if (existing) return existing;

    const params = paramsFromPrediction(prediction, root);
    const requestCache = root.ChappyOddsRequestCache;
    if (!params || typeof requestCache?.getOdds !== "function") {
      return Promise.resolve(false);
    }

    const promise = requestCache.getOdds(params)
      .then(oddsData => {
        if (!attachDisplayOdds(prediction, oddsData)) return false;
        const applied = applyFormationDisplay(prediction, root);
        root.dispatchEvent?.(new CustomEvent(
          "chappy:formation-odds-hydrated",
          {
            detail: {
              ...params,
              count: Number(oddsData.count || 0)
            }
          }
        ));
        return applied;
      })
      .catch(error => {
        console.warn(
          "フォーメーション全点オッズの表示補強に失敗",
          error?.message || error
        );
        return false;
      })
      .finally(() => {
        if (inFlightByPrediction.get(prediction) === promise) {
          inFlightByPrediction.delete(prediction);
        }
      });

    inFlightByPrediction.set(prediction, promise);
    return promise;
  }

  function install(root) {
    if (!root || root[INSTALL_FLAG]) return false;
    root[INSTALL_FLAG] = true;

    const wrap = name => {
      const original = root[name];
      if (typeof original !== "function" || original[WRAPPED_FLAG]) return false;
      const wrapped = function (prediction, ...args) {
        const result = original.call(this, prediction, ...args);
        const run = () => void hydrate(prediction, root);
        if (typeof root.queueMicrotask === "function") root.queueMicrotask(run);
        else Promise.resolve().then(run);
        return result;
      };
      wrapped[WRAPPED_FLAG] = true;
      root[name] = wrapped;
      return true;
    };

    const wrapped = wrap("renderAll");
    root.addEventListener?.("chappy:prediction-runtime-ready", () => {
      wrap("renderAll");
    });
    return wrapped;
  }

  return {
    digits,
    paramsFromPrediction,
    hasUsableOdds,
    attachDisplayOdds,
    applyFormationDisplay,
    hydrate,
    install
  };
});
