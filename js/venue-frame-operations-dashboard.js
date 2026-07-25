// js/venue-frame-operations-dashboard.js
// 場別枠傾向の運用状況を継続・観察・保留・停止で一覧化する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const RECHECK_KEY = "chappy_venue_frame_comment_recheck_v1";
  const HISTORY_KEY = "chappy_venue_frame_status_history_v1";

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalize(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      if (Array.isArray(value.items)) return value.items;
      return Object.values(value).filter(Boolean);
    }
    return [];
  }

  function statusOf(item) {
    const raw = String(item?.status || item?.decision || item?.grade?.key || "observing");
    if (raw === "high") return "continue";
    if (raw === "medium") return "hold";
    if (raw === "low") return "stop";
    return raw;
  }

  function label(status) {
    return ({
      continue: "連携継続",
      observing: "継続観察",
      hold: "連携保留",
      stop: "連携停止"
    })[status] || "未判定";
  }

  function summarize() {
    const current = normalize(read(RECHECK_KEY, []));
    const history = normalize(read(HISTORY_KEY, []));
    const counts = { continue: 0, observing: 0, hold: 0, stop: 0 };
    current.forEach(item => {
      const status = statusOf(item);
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return {
      current,
      history,
      counts,
      total: current.length,
      recentChanges: history.slice(0, 8)
    };
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameOperationsDashboard");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameStatusHistory") || document.getElementById("venueFrameCommentAudit") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameOperationsDashboard";
    holder.className = "venue-frame-operations-dashboard";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function dateLabel(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const summary = summarize();
    const cards = [
      ["continue", "✅", "連携継続"],
      ["observing", "👀", "継続観察"],
      ["hold", "⏸️", "連携保留"],
      ["stop", "⛔", "連携停止"]
    ];

    holder.innerHTML = `
      <div class="venue-frame-operations-head">
        <div><h3>📊 場別枠傾向 運用状況</h3><p>コメント連携中の傾向を状態別に確認します。</p></div>
        <strong>合計 ${summary.total}傾向</strong>
      </div>
      <div class="venue-frame-operations-grid">
        ${cards.map(([key, icon, text]) => `
          <div class="operation-card operation-${key}">
            <span>${icon} ${text}</span>
            <b>${summary.counts[key]}</b>
            <small>${summary.total ? Math.round(summary.counts[key] * 100 / summary.total) : 0}%</small>
          </div>`).join("")}
      </div>
      <div class="venue-frame-operations-health">
        <b>運用健全度</b>
        <span>${summary.total ? Math.round((summary.counts.continue + summary.counts.observing * 0.5) * 100 / summary.total) : 0}点</span>
        <small>継続を1、観察を0.5として算出した表示用指標です。</small>
      </div>
      ${summary.recentChanges.length ? `
        <div class="venue-frame-operations-recent">
          <h4>直近の状態変更</h4>
          ${summary.recentChanges.map(row => `
            <div>
              <b>${row.place || row.jcd} ${row.frameNo}枠</b>
              <span>${row.type === "rise" ? "浮上" : "沈下"}</span>
              <strong>${row.fromStatus ? `${label(row.fromStatus)} → ` : ""}${label(row.toStatus)}</strong>
              <small>${row.samples || 0}件・${row.rate || 0}%・${dateLabel(row.changedAt)}</small>
            </div>`).join("")}
        </div>` : `<small>状態変更が発生すると直近履歴を表示します。</small>`}
      <p class="venue-frame-operations-note">このダッシュボードは運用監視専用です。予想ロジック・印・配点・買い目には反映しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-operations-dashboard-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-operations-dashboard-style";
    style.textContent = `
      .venue-frame-operations-dashboard{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-operations-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.venue-frame-operations-head h3{margin:0 0 4px;font-size:17px}.venue-frame-operations-head p{margin:0;color:#64748b;font-size:12px}.venue-frame-operations-head>strong{padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px;white-space:nowrap}
      .venue-frame-operations-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.operation-card{padding:11px;border-radius:12px;border:1px solid #e2e8f0}.operation-card span,.operation-card b,.operation-card small{display:block}.operation-card b{margin:4px 0;font-size:24px}.operation-card small{color:#64748b}.operation-continue{background:#f2fbf6}.operation-observing{background:#f8fafc}.operation-hold{background:#fffaf0}.operation-stop{background:#fff7f7}
      .venue-frame-operations-health{margin-top:10px;padding:10px;border-radius:12px;background:#f8fafc}.venue-frame-operations-health b,.venue-frame-operations-health span,.venue-frame-operations-health small{display:block}.venue-frame-operations-health span{font-size:22px;font-weight:700;margin:3px 0}.venue-frame-operations-health small{color:#64748b;font-size:11px}
      .venue-frame-operations-recent{margin-top:12px}.venue-frame-operations-recent h4{margin:0 0 8px}.venue-frame-operations-recent>div{display:grid;grid-template-columns:1.2fr .7fr 1.5fr 1.4fr;gap:8px;padding:8px 0;border-top:1px solid #eef2f7;font-size:12px}.venue-frame-operations-recent small{color:#64748b}.venue-frame-operations-note{margin:12px 0 0;color:#64748b;font-size:11px;line-height:1.5}
      @media(max-width:640px){.venue-frame-operations-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.venue-frame-operations-head{display:block}.venue-frame-operations-head>strong{display:inline-block;margin-top:8px}.venue-frame-operations-recent>div{grid-template-columns:1fr}.venue-frame-operations-recent>div>*{display:block}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    window.addEventListener("storage", render);
    document.getElementById("placeSelect")?.addEventListener("change", render);
    setInterval(render, 60000);
  }

  window.ChappyVenueFrameOperationsDashboard = { summarize, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
