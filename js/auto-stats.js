/* =========================================================
  自動予想の履歴・結果を結果分析用へ変換
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyAutoStats = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];
    return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
  }

  function normalizeIndex(data) {
    const predictions = [];
    const results = [];
    const selectedRaceKeys = new Set(
      (Array.isArray(data?.predictions) ? data.predictions : [])
        .map(item => String(item?.raceKey || ""))
        .filter(Boolean)
    );

    function append(item, predictionSource) {
      const raceKey = String(item?.raceKey || "");
      if (!raceKey) return;

      predictions.push({
        ...(item?.prediction || {}),
        raceKey,
        date: item?.date || "",
        jcd: item?.jcd || "",
        place: item?.place || "",
        raceNo: item?.raceNo || 0,
        savedAt: item?.selectedAt || "",
        automaticSelection: item?.selection || null,
        verificationMode: item?.verificationMode ||
          (predictionSource === "automatic" ? "selected" : "shadow"),
        scoreBand: item?.scoreBand ||
          (Number(item?.selection?.score || 0) >= 70 ? "70_plus" : "under_70"),
        predictionSource
      });

      const resultTicket = normalizeTicket(item?.result?.resultTicket);
      if (item?.result?.settled && resultTicket) {
        results.push({
          raceKey,
          date: item?.date || "",
          jcd: item?.jcd || "",
          place: item?.place || "",
          raceNo: item?.raceNo || 0,
          recordType: "official_result",
          resultSource: "boatrace-official",
          result: resultTicket,
          officialPayoutPer100: Number(item?.result?.payout || 0),
          officialPopularity: item?.result?.popularity ?? null,
          winningMethod: item?.result?.winningMethod || "",
          finishers: item?.result?.finishers || [],
          starts: item?.result?.starts || [],
          officialCheckedAt: item?.result?.settledAt || "",
          automaticResult: true,
          verificationMode: item?.verificationMode ||
            (predictionSource === "automatic" ? "selected" : "shadow"),
          scoreBand: item?.scoreBand ||
            (Number(item?.selection?.score || 0) >= 70 ? "70_plus" : "under_70"),
          automaticVerification:
            item?.result?.verification || item?.result || null
        });
      }
    }

    (Array.isArray(data?.predictions) ? data.predictions : [])
      .forEach(item => append(item, "automatic"));

    (Array.isArray(data?.verificationPredictions)
      ? data.verificationPredictions
      : [])
      .filter(item => !selectedRaceKeys.has(String(item?.raceKey || "")))
      .forEach(item => append(item, "automatic_shadow"));

    const runs = (Array.isArray(data?.runs) ? data.runs : []).map(run => ({ ...run }));
    return {
      predictions,
      results,
      runs,
      selectedCount: selectedRaceKeys.size,
      shadowCount: predictions.filter(
        item => item.predictionSource === "automatic_shadow"
      ).length
    };
  }

  return { normalizeTicket, normalizeIndex };
});
