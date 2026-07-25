// js/hiyori-shadow-validation-loader.js
// シャドー検証本体とダッシュボードを安全に読み込む。
(function () {
  "use strict";

  const scripts = [
    "js/hiyori-shadow-validation.js",
    "js/hiyori-shadow-validation-dashboard.js"
  ];

  function load(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(script => script.src.endsWith(src))) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`load failed: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function install() {
    for (const src of scripts) {
      try {
        await load(src);
      } catch (error) {
        console.warn("[hiyori-shadow-validation-loader]", error);
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();