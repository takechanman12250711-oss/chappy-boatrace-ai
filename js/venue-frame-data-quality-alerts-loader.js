// js/venue-frame-data-quality-alerts-loader.js
// データ品質アラート本体を自動接続する補助ローダー。
(function () {
  "use strict";

  const SCRIPT_ID = "venue-frame-data-quality-alerts-script";
  const SCRIPT_SRC = "js/venue-frame-data-quality-alerts.js";

  function install() {
    if (document.getElementById(SCRIPT_ID) || window.ChappyVenueFrameDataQualityAlerts) return;
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
