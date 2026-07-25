// js/venue-frame-data-quality-trend-loader.js
// データ品質トレンド本体を自動接続する補助ローダー。
(function () {
  "use strict";

  const SCRIPT_ID = "venue-frame-data-quality-trend-script";
  const SCRIPT_SRC = "js/venue-frame-data-quality-trend.js";

  function install() {
    if (document.getElementById(SCRIPT_ID) || window.ChappyVenueFrameDataQualityTrend) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.defer = true;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();