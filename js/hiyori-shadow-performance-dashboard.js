// js/hiyori-shadow-performance-dashboard.js
// シャドー検証の成績判定を表示する。実予想には反映しない。
(function () {
  "use strict";

  const GRADE_KEY = "chappy_hiyori_shadow_performance_grade_v1";

  function read() {
    try {
      return JSON.parse(localStorage.getItem(GRADE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriShadowPerformanceDashboard");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriShadowValidation") ||
      document.getElementById("hiyoriProposalApproval") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriShadowPerformanceDashboard";
    holder.className = "hiyori-shadow-performance-dashboard";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(result = read()) {
    const holder = ensureHolder();
    if (!holder || !result) return;
    const rows = Array.isArray(result.grades) ? result.grades : [];
    const summary = result.summary || {};

    holder.innerHTML = `
      <div class="hspd-head">
        <div>
          <h3>🧭 シャドー検証 成績判定</h3>
          <p>仮補正の効果と副作用を提案ごとに判定します。</p>
        </div>
        <strong>${result.evaluatedRows || 0}件照合</strong>
      </div>
      <div class="hspd-summary">
        <span>継続観察 ${summary.watch || 0}</span>
        <span>有望 ${summary.promising || 0}</span>
        <span>採用検討 ${summary.consider || 0}</span>
        <span>中止候補 ${summary.stop || 0}</span>
      </div>
      <div class="hspd-list">
        ${rows.length ? rows.map(row => `
          <div class="hspd-row grade-${row.grade.code}">
            <div class="hspd-title">
              <b>${row.proposalId}</b>
              <strong>${row.grade.label}</strong>
            </div>
            <div class="hspd-metrics">
              <span>${row.samples}件</span>
              <span>改善 ${row.improvementRate}%</span>
              <span>悪化 ${row.worseningRate}%</span>
              <span>差引 ${row.netRate > 0 ? "+" : ""}${row.netRate}%</span>
              <span>順位差 ${row.averageRankGain > 0 ? "+" : ""}${row.averageRankGain}</span>
              <span>評価 ${row.performanceScore}点</span>
            </div>
            <p>${row.reason}</p>
          </div>`).join("") : `<p class="hspd-empty">承認済み提案のシャドー結果を蓄積中です。</p>`}
      </div>
      <p class="hspd-note">採用検討になっても自動反映しません。実予想・印・配点・買い目は現在のままです。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-shadow-performance-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-shadow-performance-dashboard-style";
    style.textContent = `.hiyori-shadow-performance-dashboard{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hspd-head{display:flex;justify-content:space-between;gap:12px}.hspd-head h3{margin:0 0 4px;font-size:17px}.hspd-head p{margin:0;color:#64748b;font-size:12px}.hspd-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}.hspd-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.hspd-summary span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px}.hspd-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hspd-row{padding:11px;border:1px solid #e2e8f0;border-radius:12px}.hspd-title{display:flex;justify-content:space-between;gap:8px}.hspd-title b{font-size:12px;word-break:break-all}.hspd-title strong{font-size:12px;white-space:nowrap}.hspd-metrics{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.hspd-metrics span{font-size:10px;padding:3px 6px;border-radius:999px;background:#fff;border:1px solid #e2e8f0}.hspd-row p{margin:8px 0 0;color:#475569;font-size:11px}.grade-watch{background:#f8fafc}.grade-promising{background:#eff6ff}.grade-consider{background:#f0fdf4}.grade-stop{background:#fff1f2}.hspd-note,.hspd-empty{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hspd-list{grid-template-columns:1fr}.hspd-head{display:block}.hspd-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    window.addEventListener("chappy:hiyori-shadow-performance-updated", event => render(event?.detail || read()));
    window.addEventListener("storage", () => render());
    setInterval(() => render(), 60000);
  }

  window.ChappyHiyoriShadowPerformanceDashboard = { render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
