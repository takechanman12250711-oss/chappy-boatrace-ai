// js/hiyori-learning-correlation-loader.js
// 日和データ結果相関分析を自動接続する。
(function () {
  "use strict";
  const SCRIPT_ID = "hiyori-learning-correlation-script";
  const SCRIPT_SRC = "js/hiyori-learning-correlation.js";

  function install() {
    if (document.getElementById(SCRIPT_ID) || window.ChappyHiyoriLearningCorrelation) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.defer = true;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();