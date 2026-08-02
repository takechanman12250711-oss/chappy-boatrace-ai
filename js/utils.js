/* =========================================================
  チャッピーボートレースAI
  js/utils.js 完全版
========================================================= */

(function installStartupGate(root) {
  "use strict";

  if (!root.document || root.ChappyStartupGate) return;

  const originalAdd = document.addEventListener.bind(document);
  const queuedRaceStarts = [];
  let raceStarted = false;

  document.addEventListener = function gatedAddEventListener(type, listener, options) {
    const currentSource = String(document.currentScript?.src || "");
    if (
      type === "DOMContentLoaded" &&
      currentSource.includes("/js/script.js") &&
      typeof listener === "function"
    ) {
      queuedRaceStarts.push(listener);
      return;
    }
    return originalAdd(type, listener, options);
  };

  function activateRace() {
    if (raceStarted) return;
    raceStarted = true;
    const event = new Event("DOMContentLoaded");
    queuedRaceStarts.splice(0).forEach(listener => {
      try {
        listener.call(document, event);
      } catch (error) {
        console.error("レース画面初期化エラー", error);
      }
    });
  }

  root.ChappyStartupGate = Object.freeze({
    activateRace,
    get raceStarted() {
      return raceStarted;
    }
  });
})(window);

(function () {
  "use strict";

  function isNil(value) {
    return value === null || value === undefined || value === "";
  }

  function safeText(value, fallback = "-") {
    if (isNil(value)) return fallback;
    return String(value).trim() || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digit = 1) {
    const n = safeNumber(value, 0);
    const p = Math.pow(10, digit);
    return Math.round(n * p) / p;
  }

  function formatPercent(value, fallback = "-") {
    if (isNil(value)) return fallback;
    const n = safeNumber(value, null);
    if (n === null) return fallback;
    return `${round(n, 1)}%`;
  }

  function formatOdds(value, fallback = "-") {
    if (isNil(value)) return fallback;
    const n = safeNumber(value, null);
    if (n === null || n <= 0) return fallback;
    return `${round(n, 1)}倍`;
  }

  function formatMoney(value) {
    const n = safeNumber(value, 0);
    return `${Math.floor(n).toLocaleString()}円`;
  }

  function escapeHtml(value) {
    return safeText(value, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setHtml(id, html) {
    const el = byId(id);
    if (!el) return;
    el.innerHTML = html;
  }

  function setText(id, text) {
    const el = byId(id);
    if (!el) return;
    el.textContent = safeText(text, "");
  }

  function clearArea(id) {
    setHtml(id, "");
  }

  function showEmpty(message = "表示できるデータがありません") {
    return `<div class="empty-box">${escapeHtml(message)}</div>`;
  }

  function showError(message = "エラーが発生しました") {
    return `<div class="error-box">${escapeHtml(message)}</div>`;
  }

  function getBoatColor(num) {
    const colors = {
      1: { bg: "#ffffff", text: "#111111", border: "#bdbdbd", name: "白" },
      2: { bg: "#111111", text: "#ffffff", border: "#111111", name: "黒" },
      3: { bg: "#e53935", text: "#ffffff", border: "#e53935", name: "赤" },
      4: { bg: "#1565c0", text: "#ffffff", border: "#1565c0", name: "青" },
      5: { bg: "#fdd835", text: "#111111", border: "#fbc02d", name: "黄" },
      6: { bg: "#43a047", text: "#ffffff", border: "#43a047", name: "緑" }
    };

    return colors[num] || colors[1];
  }

  function boatBadge(num, size = "") {
    const n = safeNumber(num, 0);
    const c = getBoatColor(n);
    const cls = size ? ` v3-boat-${size}` : "";

    return `
      <span
        class="v3-boat-badge${cls}"
        style="background:${c.bg};color:${c.text};border-color:${c.border};"
      >
        ${n}
      </span>
    `;
  }

  window.ChappyUtils = {
    isNil,
    safeText,
    safeNumber,
    clamp,
    round,
    formatPercent,
    formatOdds,
    formatMoney,
    escapeHtml,
    byId,
    setHtml,
    setText,
    clearArea,
    showEmpty,
    showError,
    getBoatColor,
    boatBadge
  };
})();