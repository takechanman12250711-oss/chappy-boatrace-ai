/* =========================================================
  自動収集の保存漏れ・結果照合状況

  監視結果を集計するだけで、予想基準・重み・買い目は変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyCollectionHealth = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function percentage(value, total) {
    return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
  }

  function buildReport(data) {
    const runs = Array.isArray(data?.runs) ? data.runs : [];
    const latestTargets = new Map();

    runs.forEach(run => {
      const health = run?.collectionHealth;
      const checkedAt = String(health?.checkedAt || run?.checkedAt || "");
      (Array.isArray(health?.targets) ? health.targets : []).forEach(target => {
        const raceKey = String(target?.raceKey || "");
        if (!raceKey) return;
        const previous = latestTargets.get(raceKey);
        if (!previous || checkedAt >= previous.checkedAt) {
          latestTargets.set(raceKey, { ...target, checkedAt });
        }
      });
    });

    const monitored = [...latestTargets.values()];
    const saved = monitored.filter(item => item.status === "saved");
    const insufficient = monitored.filter(item => item.status === "insufficient_data");
    const failed = monitored.filter(item =>
      ["fetch_failed", "prediction_failed", "not_attempted"].includes(item.status)
    );
    const missing = monitored.filter(item => item.status !== "saved");
    const predictionKeys = new Set(
      (Array.isArray(data?.predictions) ? data.predictions : [])
        .map(item => String(item?.raceKey || ""))
        .filter(Boolean)
    );
    const settledKeys = new Set(
      (Array.isArray(data?.results) ? data.results : [])
        .map(item => String(item?.raceKey || ""))
        .filter(Boolean)
    );
    const venues = new Map();

    monitored.forEach(item => {
      const key = String(item?.jcd || "");
      if (!venues.has(key)) {
        venues.set(key, {
          jcd: key,
          place: String(item?.place || key),
          targetCount: 0,
          savedCount: 0,
          missingCount: 0,
          failedCount: 0
        });
      }
      const venue = venues.get(key);
      venue.targetCount += 1;
      if (item.status === "saved") venue.savedCount += 1;
      else venue.missingCount += 1;
      if (["fetch_failed", "prediction_failed", "not_attempted"].includes(item.status)) {
        venue.failedCount += 1;
      }
    });

    const lastCheckedAt = monitored.reduce(
      (latest, item) => item.checkedAt > latest ? item.checkedAt : latest,
      ""
    );

    return {
      monitoredCount: monitored.length,
      savedCount: saved.length,
      missingCount: missing.length,
      insufficientDataCount: insufficient.length,
      failedCount: failed.length,
      coverageRate: percentage(saved.length, monitored.length),
      predictionCount: predictionKeys.size,
      settledCount: settledKeys.size,
      resultWaitingCount: Math.max(0, predictionKeys.size - settledKeys.size),
      lastCheckedAt,
      healthy: monitored.length > 0 && missing.length === 0,
      venues: [...venues.values()].sort((a, b) =>
        b.missingCount - a.missingCount || b.targetCount - a.targetCount || a.jcd.localeCompare(b.jcd)
      )
    };
  }

  return { buildReport };
});
