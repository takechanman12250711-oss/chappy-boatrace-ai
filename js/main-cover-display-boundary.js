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

  function prepare(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const ticketSheets = prediction.ticketSheets || {};
    const mainRows = rows(ticketSheets.main);
    const coverRows = rows(ticketSheets.cover);

    if (!mainRows.length && !coverRows.length) return prediction;

    return {
      ...prediction,
      mainSheet: {
        ...(prediction.mainSheet || {}),
        ...(mainRows.length ? { tickets: mainRows } : {}),
        ...(coverRows.length ? { coverTickets: coverRows } : {})
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
