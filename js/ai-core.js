/* =========================================================
  チャッピーボートレースAI
  ai-core.js 完全版 Part 1 / 5

  役割：
  - AI指数計算の中核
  - 展示 / ST / 当地 / 道中 / 攻め / 展開 / モーターを数値化
  - prediction.js に渡せるAI評価データを作る

  公開：
  - window.ChappyAICore
========================================================= */

(function () {
  "use strict";

  const CORE_VERSION = "ai-core-v2.0.0";

  /* ===============================
    安全関数
  =============================== */

  function isNil(value) {
    return value === null || value === undefined || value === "";
  }

  function safeText(value, fallback = "-") {
    if (isNil(value)) return fallback;
    return String(value).trim();
  }

  function toNumber(value, fallback = 0) {
    if (isNil(value)) return fallback;

    const text = String(value)
      .replace("%", "")
      .replace("％", "")
      .replace("F", "")
      .replace("L", "")
      .replace(/[^\d.-]/g, "");

    const num = Number(text);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp(value, min = 0, max = 100) {
    const num = toNumber(value, min);
    return Math.max(min, Math.min(max, num));
  }

  function round(value, digit = 1) {
    const num = toNumber(value, 0);
    const p = Math.pow(10, digit);
    return Math.round(num * p) / p;
  }

  function average(values, fallback = 0) {
    const nums = values
      .map((v) => toNumber(v, null))
      .filter((v) => Number.isFinite(v));

    if (!nums.length) return fallback;

    return nums.reduce((sum, v) => sum + v, 0) / nums.length;
  }

  function normalize(value, min, max, reverse = false) {
    const num = toNumber(value, null);
    if (!Number.isFinite(num)) return 50;
    if (max === min) return 50;

    let score = ((num - min) / (max - min)) * 100;
    if (reverse) score = 100 - score;

    return clamp(round(score, 1));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /* ===============================
    艇データ抽出
  =============================== */

  function getEntries(data) {
    return (
      safeArray(data?.entries) ||
      safeArray(data?.racers) ||
      safeArray(data?.boats) ||
      safeArray(data?.entryList)
    );
  }

  function getBoatNo(entry, index) {
    return toNumber(
      entry?.boatNo ??
      entry?.waku ??
      entry?.frame ??
      entry?.course ??
      entry?.number ??
      index + 1,
      index + 1
    );
  }

  function getRacerName(entry) {
    return safeText(
      entry?.name ??
      entry?.racerName ??
      entry?.playerName ??
      entry?.racer ??
      entry?.選手名,
      "選手名不明"
    );
  }

  function getClass(entry) {
    return safeText(
      entry?.class ??
      entry?.rank ??
      entry?.grade ??
      entry?.級別,
      "-"
    );
  }

  function getBaseEntry(entry, index) {
    const boatNo = getBoatNo(entry, index);

    return {
      boatNo,
      name: getRacerName(entry),
      class: getClass(entry),

      raw: entry
    };
  }

  function buildBaseEntries(data) {
    return getEntries(data).map((entry, index) => {
      return getBaseEntry(entry, index);
    });
  }

  /* ===============================
    公開API
  =============================== */

  const ChappyAICore = {
    version: CORE_VERSION,

    utils: {
      isNil,
      safeText,
      toNumber,
      clamp,
      round,
      average,
      normalize,
      safeArray
    },

    entries: {
      getEntries,
      getBoatNo,
      getRacerName,
      getClass,
      getBaseEntry,
      buildBaseEntries
    }
  };

  window.ChappyAICore = ChappyAICore;

})();