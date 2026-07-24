/* =========================================================
  履歴・当地水面・モーター理論 同期ローダー
  既存本体は history-insights-base.js に保持する。
========================================================= */
(function (root) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = require("./history-insights-base.js");
    return;
  }

  if (typeof document !== "undefined" && typeof document.write === "function") {
    document.write('<script src="js/history-insights-base.js?v=20260724-integration1"><\/script>');
    document.write('<script src="js/motor-maintenance-insights.js?v=20260724-integration1"><\/script>');
  }
})(typeof window !== "undefined" ? window : globalThis);
