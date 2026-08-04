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

  function normalizeTicket(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function ticketOf(item) {
    return normalizeTicket(
      typeof item === "string"
        ? item
        : item?.ticket || item?.line || item?.formation
    );
  }

  function mergeDisplayRows(sourceRows, existingRows) {
    const existingByTicket = new Map(
      rows(existingRows)
        .map(item => [ticketOf(item), item])
        .filter(([ticket]) => ticket)
    );

    return rows(sourceRows).map(item => {
      const ticket = ticketOf(item);
      const existing = existingByTicket.get(ticket);

      if (!existing || typeof existing !== "object") {
        return item;
      }

      if (typeof item === "string") {
        return {
          ...existing,
          ticket: item
        };
      }

      if (!item || typeof item !== "object") {
        return item;
      }

      return {
        ...existing,
        ...item,
        odds:
          Number.isFinite(Number(item.odds)) && Number(item.odds) > 0
            ? item.odds
            : existing.odds,
        oddsText:
          item.oddsText && item.oddsText !== "オッズ未取得"
            ? item.oddsText
            : existing.oddsText,
        oddsSource: item.oddsSource || existing.oddsSource,
        isFinalRetrievedOdds:
          item.isFinalRetrievedOdds || existing.isFinalRetrievedOdds || false
      };
    });
  }

  function prepare(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const ticketSheets = prediction.ticketSheets || {};
    const mainRows = rows(ticketSheets.main);
    const coverRows = rows(ticketSheets.cover);

    if (!mainRows.length && !coverRows.length) return prediction;

    const mainSheet = prediction.mainSheet || {};

    return {
      ...prediction,
      mainSheet: {
        ...mainSheet,
        ...(mainRows.length
          ? {
              tickets: mergeDisplayRows(
                mainRows,
                mainSheet.tickets
              )
            }
          : {}),
        ...(coverRows.length
          ? {
              coverTickets: mergeDisplayRows(
                coverRows,
                mainSheet.coverTickets
              )
            }
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
