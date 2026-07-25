// js/hiyori-production-readiness-loader.js
// 最終判定ゲート本体を重複なく読み込む。
(function () {
  "use strict";

  const SCRIPT_ID = "hiyori-production-readiness-script";
  const SRC = "./js/hiyori-production-readiness-gate.js";

  function load() {
    if (window.ChappyHiyoriProductionReadiness || document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SRC;
    script.defer = true;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();