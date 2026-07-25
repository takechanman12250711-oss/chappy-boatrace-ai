// js/hiyori-correlation-confidence-loader.js
// 相関サンプル信頼度本体を自動接続する補助ローダー。
(function () {
  "use strict";

  const SCRIPT_ID = "hiyori-correlation-confidence-script";
  const SCRIPT_SRC = "js/hiyori-correlation-confidence.js";

  function install() {
    if (document.getElementById(SCRIPT_ID) || window.ChappyHiyoriCorrelationConfidence) return;
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