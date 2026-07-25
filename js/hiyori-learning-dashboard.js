// js/hiyori-learning-dashboard.js
// 日和互換学習スナップショットの蓄積状況を表示する。予想には使わない。
(function () {
  "use strict";

  const KEY = "chappy_hiyori_learning_snapshots_v1";

  function read() {
    try {
      const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function countComplete(rows, field) {
    return rows.filter(row => {
      if (field === "weather") {
        const weather = row?.weather || {};
        return Boolean(weather.weather || weather.windDirection || weather.windSpeed || weather.waveHeight);
      }
      if (field === "newMode") return row?.isNewEngine || row?.isNewFuel;
      return Array.isArray(row?.[field]) && row[field].length > 0;
    }).length;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriLearningDashboard");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameDataQualityWeekly") ||
      document.getElementById("venueFrameDataQualityTrend") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriLearningDashboard";
    holder.className = "hiyori-learning-dashboard";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = read();
    const matched = rows.filter(row => row?.status === "matched" && row?.result).length;
    const waiting = rows.filter(row => row?.status !== "matched").length;

    const cards = [
      ["展示", countComplete(rows, "exhibition")],
      ["一周", countComplete(rows, "lapTimes")],
      ["合成オッズ", countComplete(rows, "combinedOdds")],
      ["ST展示", countComplete(rows, "startExhibition")],
      ["気象・水面", countComplete(rows, "weather")],
      ["新エンジン等", countComplete(rows, "newMode")]
    ];

    holder.innerHTML = `
      <div class="hiyori-learning-head">
        <div><h3>📚 日和データ学習状況</h3><p>展示・一周・合成オッズ・気象などを結果と照合するための蓄積状況です。</p></div>
        <strong>${rows.length}レース</strong>
      </div>
      <div class="hiyori-learning-summary">
        <span>結果照合済み ${matched}件</span>
        <span>結果待ち ${waiting}件</span>
        <span>保存上限 3,000件</span>
      </div>
      <div class="hiyori-learning-grid">
        ${cards.map(([label, value]) => `<div><b>${label}</b><strong>${value}</strong><small>蓄積レース数</small></div>`).join("")}
      </div>
      <p class="hiyori-learning-note">現在は学習用の保存・照合だけです。予想ロジック、印、配点、買い目には反映していません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-learning-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-learning-dashboard-style";
    style.textContent = `
      .hiyori-learning-dashboard{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .hiyori-learning-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.hiyori-learning-head h3{margin:0 0 4px;font-size:17px}.hiyori-learning-head p{margin:0;color:#64748b;font-size:12px}.hiyori-learning-head>strong{padding:5px 9px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;white-space:nowrap}
      .hiyori-learning-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.hiyori-learning-summary span{padding:5px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}
      .hiyori-learning-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.hiyori-learning-grid>div{padding:10px;border:1px solid #e2e8f0;border-radius:11px;background:#fafcff}.hiyori-learning-grid b,.hiyori-learning-grid strong,.hiyori-learning-grid small{display:block}.hiyori-learning-grid strong{font-size:22px;margin-top:3px}.hiyori-learning-grid small{color:#64748b;font-size:11px}.hiyori-learning-note{margin:10px 0 0;color:#64748b;font-size:11px;line-height:1.6}
      @media(max-width:640px){.hiyori-learning-head{display:block}.hiyori-learning-head>strong{display:inline-block;margin-top:8px}.hiyori-learning-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    ["chappy:hiyori-learning-snapshot-saved", "chappy:hiyori-learning-result-matched"].forEach(name => window.addEventListener(name, render));
    window.addEventListener("storage", render);
    setInterval(render, 60000);
  }

  window.ChappyHiyoriLearningDashboard = { render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
