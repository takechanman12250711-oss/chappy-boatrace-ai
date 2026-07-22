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
    const candidatePredictions = [];
    const candidateResults = [];
    const shadowPredictions = [];
    const shadowResults = [];

    function normalizeRecords(source, predictionTarget, resultTarget, sourceLabel) {
      (Array.isArray(source) ? source : []).forEach(item => {
      const raceKey = String(item?.raceKey || "");
      if (!raceKey) return;

      predictionTarget.push({
        ...(item?.prediction || {}),
        raceKey,
        date: item?.date || "",
        jcd: item?.jcd || "",
        place: item?.place || "",
        raceNo: item?.raceNo || 0,
        savedAt: item?.selectedAt || item?.capturedAt || "",
        automaticSelection: item?.selection || null,
        predictionSource: sourceLabel,
        verificationOnly: Boolean(item?.verificationOnly),
        automaticResult: item?.result || null
      });

      const resultTicket = normalizeTicket(item?.result?.resultTicket);
      if (item?.result?.settled && resultTicket) {
        resultTarget.push({
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
          automaticVerification:
            item?.result?.verification || item?.result || null
        });
      }
      });
    }

    normalizeRecords(data?.predictions, predictions, results, "automatic");
    normalizeRecords(
      data?.candidatePredictions,
      candidatePredictions,
      candidateResults,
      "automatic_candidate"
    );
    normalizeRecords(
      data?.shadowPredictions,
      shadowPredictions,
      shadowResults,
      "automatic_shadow"
    );

    const runs = (Array.isArray(data?.runs) ? data.runs : []).map(run => ({ ...run }));
    return {
      predictions,
      results,
      candidatePredictions,
      candidateResults,
      shadowPredictions,
      shadowResults,
      runs
    };
  }

  return { normalizeTicket, normalizeIndex };
});
