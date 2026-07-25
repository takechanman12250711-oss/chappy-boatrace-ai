// js/hiyori-shadow-validation-dashboard.js
// シャドー検証の件数・改善・悪化・中立を表示する。実予想へは影響しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_hiyori_shadow_validation_v1";

  function read() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function getSummary() {
    if (window.ChappyHiyoriShadowValidation?.summary) {
      return window.ChappyHiyoriShadowValidation.summary();
    }
    const rows = read();
    const evaluated = rows.filter(row => row.evaluated);
    return {
      total: rows.length,
      evaluated: evaluated.length,
      improved: evaluated.filter(row => row.effect === "improved").length,
      worsened: evaluated.filter(row => row.effect === "worsened").length,
      neutral: evaluated.filter(row => row.effect === "neutral").length,
      netEffect: evaluated.filter(row => row.effect === "improved").length - evaluated.filter(row => row.effect === "worsened").length
    };
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriShadowValidationDashboard");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriProposalApproval") ||
      document.getElementById("hiyoriChangeProposals") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriShadowValidationDashboard";
    holder.className = "hiyori-shadow-validation-dashboard";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const summary = getSummary();
    const rows = read().slice(0, 10);
    holder.innerHTML = `
      <div class="hsv-head">
        <div><h3>🪞 シャドー検証</h3><p>承認済み提案を実予想へ反映せず、仮補正の結果だけ比較します。</p></div>
        <strong>実予想への影響 0</strong>
      </div>
      <div class="hsv-summary">
        <span>記録 ${summary.total}</span>
        <span>照合 ${summary.evaluated}</span>
        <span>改善 ${summary.improved}</span>
        <span>悪化 ${summary.worsened}</span>
        <span>中立 ${summary.neutral}</span>
        <span>差引 ${summary.netEffect >= 0 ? "+" : ""}${summary.netEffect}</span>
      </div>
      <div class="hsv-list">
        ${rows.length ? rows.map(row => `
          <div class="hsv-row effect-${row.effect || "waiting"}">
            <div><b>${row.raceKey || "-"}</b><small>${row.createdAt ? new Date(row.createdAt).toLocaleString("ja-JP") : ""}</small></div>
            <span>実 ${Array.isArray(row.baseOrder) ? row.baseOrder.join("-") : "-"}</span>
            <span>仮 ${Array.isArray(row.shadowOrder) ? row.shadowOrder.join("-") : "-"}</span>
            <strong>${row.evaluated ? ({ improved: "改善", worsened: "悪化", neutral: "中立" }[row.effect] || "照合済") : "結果待ち"}</strong>
          </div>`).join("") : `<p class="hsv-empty">承認済み提案のシャドー記録はまだありません。</p>`}
      </div>
      <p class="hsv-note">シャドー結果は参考記録です。印・順位・買い目・資金配分を変更しません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-shadow-validation-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-shadow-validation-style";
    style.textContent = `.hiyori-shadow-validation-dashboard{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hsv-head{display:flex;justify-content:space-between;gap:12px}.hsv-head h3{margin:0 0 4px;font-size:17px}.hsv-head p{margin:0;color:#64748b;font-size:12px}.hsv-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#fef3c7;font-size:12px}.hsv-summary{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.hsv-summary span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px}.hsv-list{display:grid;gap:7px}.hsv-row{display:grid;grid-template-columns:1.3fr .8fr .8fr .6fr;gap:8px;align-items:center;padding:9px;border:1px solid #e2e8f0;border-radius:11px;font-size:12px}.hsv-row small{display:block;color:#64748b;font-size:10px;margin-top:2px}.effect-improved{background:#f0fdf4}.effect-worsened{background:#fef2f2}.effect-neutral{background:#f8fafc}.effect-waiting{background:#fffbeb}.hsv-empty,.hsv-note{margin:8px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hsv-head{display:block}.hsv-head>strong{display:inline-block;margin-top:8px}.hsv-row{grid-template-columns:1fr 1fr}.hsv-row>div{grid-column:1/-1}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    ["chappy:hiyori-shadow-simulated", "chappy:hiyori-shadow-evaluated", "storage"].forEach(name => window.addEventListener(name, render));
    setInterval(render, 60000);
  }

  window.ChappyHiyoriShadowValidationDashboard = { render, getSummary };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();