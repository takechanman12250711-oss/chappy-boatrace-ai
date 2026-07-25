// js/hiyori-learning-loader.js
// 日和互換学習スナップショットとダッシュボードを自動接続する。
(function () {
  "use strict";

  const scripts = [
    ["hiyori-learning-snapshot-script", "js/hiyori-learning-snapshot.js"],
    ["hiyori-learning-dashboard-script", "js/hiyori-learning-dashboard.js"]
  ];

  function add(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  function install() {
    scripts.forEach(([id, src]) => add(id, src));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
