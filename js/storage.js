/* =========================================================
  チャッピーボートレースAI
  js/storage.js

  ・結果データ保存
  ・設定保存
  ・レース単位の予想履歴保存
========================================================= */

(function () {
  "use strict";

  const RESULT_KEY =
    "chappy_results_v1";

  const SETTING_KEY =
    "chappy_settings_v1";

  const PREDICTION_HISTORY_KEY =
    "chappy_prediction_history_v2";

  const LEGACY_LATEST_PREDICTION_KEY =
    "chappy_latest_prediction_v1";


  /* =====================================================
    共通
  ===================================================== */

  function readJson(
    key,
    fallback
  ) {
    try {
      const raw =
        localStorage.getItem(key);

      if (!raw) {
        return fallback;
      }

      return JSON.parse(raw);

    } catch (error) {
      console.error(
        `[ChappyStorage] ${key} の読み込みに失敗`,
        error
      );

      return fallback;
    }
  }

  function writeJson(
    key,
    value
  ) {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );

    return value;
  }

  function buildRaceKey(source) {
    if (
      typeof source === "string"
    ) {
      return source.trim();
    }

    if (
      !source ||
      typeof source !== "object"
    ) {
      return "";
    }

    const savedRaceKey =
      String(
        source.raceKey ||
        source.predictionRaceKey ||
        ""
      ).trim();

    if (savedRaceKey) {
      return savedRaceKey;
    }

    const date =
      String(
        source.date ||
        source.predictionDate ||
        ""
      )
        .replace(/\D/g, "")
        .slice(0, 8);

    const rawJcd =
      String(
        source.jcd ||
        source.predictionJcd ||
        ""
      )
        .replace(/\D/g, "");

    const jcd = rawJcd
      ? rawJcd
          .padStart(2, "0")
          .slice(-2)
      : "";

    const raceNo =
      Number(
        source.raceNo ??
        source.rno ??
        source.predictionRaceNo ??
        0
      );

    if (
      date.length !== 8 ||
      !jcd ||
      raceNo < 1 ||
      raceNo > 12
    ) {
      return "";
    }

    return (
      `${date}-${jcd}-${raceNo}`
    );
  }


  /* =====================================================
    結果データ
  ===================================================== */

  function loadResults() {
    const results = readJson(
      RESULT_KEY,
      []
    );

    return Array.isArray(results)
      ? results
      : [];
  }

  function saveResults(results) {
    const list =
      Array.isArray(results)
        ? results
        : [];

    return writeJson(
      RESULT_KEY,
      list
    );
  }

  function addResult(result) {
    const list = loadResults();

    list.unshift({
      ...result,

      savedAt:
        result?.savedAt ||
        new Date().toISOString()
    });

    saveResults(list);

    return list;
  }

  function upsertResult(result) {
    if (
      !result ||
      typeof result !== "object"
    ) {
      return null;
    }

    const raceKey =
      buildRaceKey(result);

    if (!raceKey) {
      addResult(result);
      return result;
    }

    const list = loadResults();

    const index =
      list.findIndex(
        item =>
          buildRaceKey(item) ===
          raceKey
      );

    const existing =
      index >= 0
        ? list[index]
        : null;

    const now =
      new Date().toISOString();

    const merged = {
      ...(existing || {}),
      ...result,
      raceKey,

      savedAt:
        existing?.savedAt ||
        result.savedAt ||
        now,

      updatedAt: now
    };

    if (index >= 0) {
      list[index] = merged;
    } else {
      list.unshift(merged);
    }

    saveResults(list);

    return merged;
  }

  function findResultByRaceKey(
    raceKey
  ) {
    const normalizedKey =
      buildRaceKey(raceKey);

    if (!normalizedKey) {
      return null;
    }

    return (
      loadResults().find(
        item =>
          buildRaceKey(item) ===
          normalizedKey
      ) || null
    );
  }

  function removeLatestResult() {
    const list = loadResults();

    list.shift();
    saveResults(list);

    return list;
  }

  function removeResultByRaceKey(
    raceKey
  ) {
    const normalizedKey =
      buildRaceKey(raceKey);

    const list =
      loadResults().filter(
        item =>
          buildRaceKey(item) !==
          normalizedKey
      );

    saveResults(list);

    return list;
  }

  function clearResults() {
    localStorage.removeItem(
      RESULT_KEY
    );
  }


  /* =====================================================
    レース単位の予想履歴
  ===================================================== */

  function loadPredictionHistory() {
    const history = readJson(
      PREDICTION_HISTORY_KEY,
      []
    );

    if (
      Array.isArray(history) &&
      history.length > 0
    ) {
      return history;
    }

    const legacyLatest = readJson(
      LEGACY_LATEST_PREDICTION_KEY,
      null
    );

    if (
      legacyLatest &&
      typeof legacyLatest === "object" &&
      buildRaceKey(legacyLatest)
    ) {
      return [legacyLatest];
    }

    return [];
  }

  function savePredictionHistory(
    predictions
  ) {
    const list =
      Array.isArray(predictions)
        ? predictions
        : [];

    return writeJson(
      PREDICTION_HISTORY_KEY,
      list
    );
  }

  function upsertPrediction(
    prediction
  ) {
    if (
      !prediction ||
      typeof prediction !== "object"
    ) {
      return null;
    }

    const raceKey =
      buildRaceKey(prediction);

    if (!raceKey) {
      throw new Error(
        "予想保存に必要な日付・場コード・レース番号がありません"
      );
    }

    const list =
      loadPredictionHistory();

    const index =
      list.findIndex(
        item =>
          buildRaceKey(item) ===
          raceKey
      );

    const existing =
      index >= 0
        ? list[index]
        : null;

    const now =
      new Date().toISOString();

    const merged = {
      ...(existing || {}),
      ...prediction,
      raceKey,

      savedAt:
        existing?.savedAt ||
        prediction.savedAt ||
        now,

      updatedAt: now
    };

    if (
      existing &&
      (
        !Array.isArray(
          prediction.ticketRanks
        ) ||
        prediction.ticketRanks
          .length === 0
      )
    ) {
      merged.ticketRanks =
        Array.isArray(
          existing.ticketRanks
        )
          ? existing.ticketRanks
          : [];
    }

    if (index >= 0) {
      list[index] = merged;
    } else {
      list.unshift(merged);
    }

    list.sort(
      (a, b) =>
        String(
          b.updatedAt ||
          b.savedAt ||
          ""
        ).localeCompare(
          String(
            a.updatedAt ||
            a.savedAt ||
            ""
          )
        )
    );

    savePredictionHistory(list);

    writeJson(
      LEGACY_LATEST_PREDICTION_KEY,
      merged
    );

    return merged;
  }

  function findPredictionByRaceKey(
    raceKey
  ) {
    const normalizedKey =
      buildRaceKey(raceKey);

    if (!normalizedKey) {
      return null;
    }

    return (
      loadPredictionHistory().find(
        item =>
          buildRaceKey(item) ===
          normalizedKey
      ) || null
    );
  }

  function loadLatestPrediction() {
    const legacyLatest = readJson(
      LEGACY_LATEST_PREDICTION_KEY,
      null
    );

    if (legacyLatest) {
      return legacyLatest;
    }

    return (
      loadPredictionHistory()[0] ||
      null
    );
  }

  function removePredictionByRaceKey(
    raceKey
  ) {
    const normalizedKey =
      buildRaceKey(raceKey);

    const list =
      loadPredictionHistory().filter(
        item =>
          buildRaceKey(item) !==
          normalizedKey
      );

    savePredictionHistory(list);

    const latest =
      list[0] || null;

    if (latest) {
      writeJson(
        LEGACY_LATEST_PREDICTION_KEY,
        latest
      );
    } else {
      localStorage.removeItem(
        LEGACY_LATEST_PREDICTION_KEY
      );
    }

    return list;
  }

  function clearPredictionHistory() {
    localStorage.removeItem(
      PREDICTION_HISTORY_KEY
    );

    localStorage.removeItem(
      LEGACY_LATEST_PREDICTION_KEY
    );
  }


  /* =====================================================
    設定
  ===================================================== */

  function loadSettings() {
    const settings = readJson(
      SETTING_KEY,
      {}
    );

    return (
      settings &&
      typeof settings === "object"
    )
      ? settings
      : {};
  }

  function saveSettings(settings) {
    return writeJson(
      SETTING_KEY,
      settings || {}
    );
  }


  /* =====================================================
    公開
  ===================================================== */

  window.ChappyStorage = {
    buildRaceKey,

    loadResults,
    saveResults,
    addResult,
    upsertResult,
    findResultByRaceKey,
    removeLatestResult,
    removeResultByRaceKey,
    clearResults,

    loadPredictionHistory,
    savePredictionHistory,
    upsertPrediction,
    findPredictionByRaceKey,
    loadLatestPrediction,
    removePredictionByRaceKey,
    clearPredictionHistory,

    loadSettings,
    saveSettings
  };
  /* =====================================================
    実購入データ
  ===================================================== */

  const ACTUAL_PURCHASE_KEY =
    "chappy_actual_purchases_v1";

  function normalizeActualTicket(
    value
  ) {
    return (
      String(value || "")
        .match(/[1-6]/g) || []
    )
      .slice(0, 3)
      .join("-");
  }

  function buildActualPurchaseKey(
    source
  ) {
    if (
      typeof source === "string"
    ) {
      return source.trim();
    }

    if (
      !source ||
      typeof source !== "object"
    ) {
      return "";
    }

    const savedKey =
      String(
        source.purchaseKey ||
        ""
      ).trim();

    if (savedKey) {
      return savedKey;
    }

    const raceKey =
      buildRaceKey(source);

    const ticket =
      normalizeActualTicket(
        source.ticket
      );

    if (
      !raceKey ||
      !ticket
    ) {
      return "";
    }

    return (
      raceKey + "-" + ticket
    );
  }

  function loadActualPurchases() {
    const purchases =
      readJson(
        ACTUAL_PURCHASE_KEY,
        []
      );

    return Array.isArray(
      purchases
    )
      ? purchases
      : [];
  }

  function saveActualPurchases(
    purchases
  ) {
    const list =
      Array.isArray(purchases)
        ? purchases
        : [];

    return writeJson(
      ACTUAL_PURCHASE_KEY,
      list
    );
  }

  function upsertActualPurchase(
    purchase
  ) {
    if (
      !purchase ||
      typeof purchase !== "object"
    ) {
      return null;
    }

    const raceKey =
      buildRaceKey(purchase);

    const ticket =
      normalizeActualTicket(
        purchase.ticket
      );

    const amount =
      Number(purchase.amount);

    if (
      !raceKey ||
      !ticket ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "実購入保存に必要なレース情報・買い目・購入額がありません"
      );
    }

    const purchaseKey =
      raceKey + "-" + ticket;

    const list =
      loadActualPurchases();

    const index =
      list.findIndex(
        item =>
          buildActualPurchaseKey(
            item
          ) === purchaseKey
      );

    const existing =
      index >= 0
        ? list[index]
        : null;

    const now =
      new Date().toISOString();

    const merged = {
      ...(existing || {}),
      ...purchase,
      purchaseKey,
      raceKey,
      ticket,
      amount,

      savedAt:
        existing?.savedAt ||
        purchase.savedAt ||
        now,

      updatedAt: now
    };

    if (index >= 0) {
      list[index] = merged;
    } else {
      list.unshift(merged);
    }

    list.sort(
      (a, b) =>
        String(
          b.updatedAt ||
          b.savedAt ||
          ""
        ).localeCompare(
          String(
            a.updatedAt ||
            a.savedAt ||
            ""
          )
        )
    );

    saveActualPurchases(list);

    return merged;
  }

  function findActualPurchasesByRaceKey(
    raceKey
  ) {
    const normalizedKey =
      buildRaceKey(raceKey);

    if (!normalizedKey) {
      return [];
    }

    return loadActualPurchases()
      .filter(
        purchase =>
          buildRaceKey(
            purchase
          ) === normalizedKey
      );
  }

  function removeLatestActualPurchase() {
    const list =
      loadActualPurchases();

    list.shift();

    saveActualPurchases(list);

    return list;
  }

  function clearActualPurchases() {
    localStorage.removeItem(
      ACTUAL_PURCHASE_KEY
    );
  }

  Object.assign(
    window.ChappyStorage,
    {
      buildActualPurchaseKey,
      loadActualPurchases,
      saveActualPurchases,
      upsertActualPurchase,
      findActualPurchasesByRaceKey,
      removeLatestActualPurchase,
      clearActualPurchases
    }
  );
})();