// js/hiyori-shadow-performance-loader.js
// シャドー成績判定本体とダッシュボードを順番に読み込む。
(function () {
  "use strict";

  const files = [
    "js/hiyori-shadow-performance-grade.js",
    "js/hiyori-shadow-performance-dashboard.js"
  ];

  function loadSequentially(index) {
    if (index >= files.length) return;
    const src = files[index];
    if ([...document.scripts].some(script => script.src && script.src.includes(src))) {
      loadSequentially(index + 1);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.onload = () => loadSequentially(index + 1);
    script.onerror = () => console.warn("Shadow performance script load failed:", src);
    document.head.appendChild(script);
  }

  loadSequentially(0);
})();
