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

    (Array.isArray(data?.predictions) ? data.predictions : []).forEach(item => {
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
        predictionSource: "automatic"
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
          officialCheckedAt: item?.result?.settledAt || "",
          automaticResult: true
        });
      }
    });

    const runs = (Array.isArray(data?.runs) ? data.runs : []).map(run => ({ ...run }));
    return { predictions, results, runs };
  }

  return { normalizeTicket, normalizeIndex };
});
