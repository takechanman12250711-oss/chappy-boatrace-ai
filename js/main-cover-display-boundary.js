/* =========================================================
  チャッピーボートレースAI
  本命・押さえ 表示境界

  表示直前だけ ticketSheets.main / cover を対応欄へ渡す。
  買い目生成、点数、順番、オッズ値は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyMainCoverDisplayBoundary = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function ticketKey(row) {
    if (typeof row === "string") return row.trim();
    if (!row || typeof row !== "object") return "";
    return String(row.ticket || row.line || row.formation || "").trim();
  }

  function enrichRows(classifiedRows, existingRows) {
    const existingByTicket = new Map(
      rows(existingRows)
        .map(row => [ticketKey(row), row])
        .filter(([key]) => key)
    );

    return rows(classifiedRows).map(row => {
      const key = ticketKey(row);
      const existing = existingByTicket.get(key);

      if (!existing || typeof existing !== "object") return row;
      if (typeof row === "string") {
        return {
          ...existing,
          ticket: key
        };
      }

      return {
        ...existing,
        ...row,
        odds: row.odds ?? existing.odds,
        oddsText: row.oddsText || existing.oddsText,
        comment: row.comment || existing.comment,
        reason: row.reason || existing.reason,
        scenarioSummary: row.scenarioSummary || existing.scenarioSummary
      };
    });
  }

  function prepare(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const ticketSheets = prediction.ticketSheets || {};
    const mainRows = rows(ticketSheets.main);
    const coverRows = rows(ticketSheets.cover);

    if (!mainRows.length && !coverRows.length) return prediction;

    const currentMainSheet = prediction.mainSheet || {};

    return {
      ...prediction,
      mainSheet: {
        ...currentMainSheet,
        ...(mainRows.length
          ? { tickets: enrichRows(mainRows, currentMainSheet.tickets) }
          : {}),
        ...(coverRows.length
          ? { coverTickets: enrichRows(coverRows, currentMainSheet.coverTickets) }
          : {})
      }
    };
  }

  function install(root) {
    if (!root || root.__mainCoverDisplayBoundaryInstalled) return false;

    ["renderAll", "renderPrediction"].forEach(name => {
      const original = root[name];
      if (typeof original !== "function") return;

      root[name] = function (prediction, ...args) {
        return original.call(this, prepare(prediction), ...args);
      };
    });

    root.__mainCoverDisplayBoundaryInstalled = true;
    return true;
  }

  return {
    prepare,
    install
  };
});
