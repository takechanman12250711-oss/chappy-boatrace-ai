/* =========================================================
  シャドー予想の検証件数・点数帯判定

  重要：検証状態を返すだけで、70点基準・予想ロジック・
  重み・買い目を変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyVerificationReadiness = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MILESTONES = Object.freeze([30, 50, 100]);
  const SCORE_BANDS = Object.freeze([
    Object.freeze({ key: "80_plus", label: "80点以上", min: 80, max: Infinity }),
    Object.freeze({ key: "70_79", label: "70〜79点", min: 70, max: 79.999 }),
    Object.freeze({ key: "60_69", label: "60〜69点", min: 60, max: 69.999 }),
    Object.freeze({ key: "50_59", label: "50〜59点", min: 50, max: 59.999 }),
    Object.freeze({ key: "under_50", label: "50点未満", min: -Infinity, max: 49.999 })
  ]);

  function normalizeCount(value) {
    const count = Math.floor(Number(value || 0));
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function getSampleStage(value) {
    const count = normalizeCount(value);

    if (count < 30) {
      return {
        key: "accumulating",
        label: "蓄積中",
        count,
        nextTarget: 30,
        remaining: 30 - count,
        referenceOnly: true,
        stable: false,
        message: `30Rまであと${30 - count}R。数値は参考表示のみです。`
      };
    }

    if (count < 50) {
      return {
        key: "initial",
        label: "初期比較",
        count,
        nextTarget: 50,
        remaining: 50 - count,
        referenceOnly: true,
        stable: false,
        message: `50Rまであと${50 - count}R。点数帯の初期比較段階です。`
      };
    }

    if (count < 100) {
      return {
        key: "trend",
        label: "傾向確認",
        count,
        nextTarget: 100,
        remaining: 100 - count,
        referenceOnly: true,
        stable: false,
        message: `100Rまであと${100 - count}R。傾向は表示しますが変更判断は保留します。`
      };
    }

    return {
      key: "reviewable",
      label: "改善検討可能",
      count,
      nextTarget: null,
      remaining: 0,
      referenceOnly: false,
      stable: true,
      message: "100R到達。改善候補を比較できますが、自動反映はしません。"
    };
  }

  function findScoreBand(value) {
    if (value === null || value === undefined || value === "") return null;
    const score = Number(value);
    if (!Number.isFinite(score)) return null;
    return SCORE_BANDS.find(band => score >= band.min && score <= band.max) || null;
  }

  function buildScoreBands(rows) {
    const source = Array.isArray(rows) ? rows : [];
    return SCORE_BANDS.map(band => {
      const records = source.filter(row => findScoreBand(row?.automaticScore)?.key === band.key);
      return {
        ...band,
        rows: records,
        readiness: getSampleStage(records.length)
      };
    });
  }

  return {
    MILESTONES,
    SCORE_BANDS,
    getSampleStage,
    findScoreBand,
    buildScoreBands
  };
});
