// js/venue-frame-data-quality-weekly-summary.js
// 日次品質トレンドを週単位で集計し、前週比を監査表示する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const TREND_KEY = "chappy_venue_frame_data_quality_trend_v1";
  const WEEKLY_KEY = "chappy_venue_frame_data_quality_weekly_v1";
  const MAX_WEEKS = 26;

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(rows) {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(rows.slice(0, MAX_WEEKS)));
  }

  function toDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function average(rows, key) {
    if (!rows.length) return 0;
    return Math.round((rows.reduce((sum, row) => sum + Number(row?.[key] || 0), 0) / rows.length) * 10) / 10;
  }

  function aggregateWeeks() {
    const daily = Array.isArray(read(TREND_KEY, [])) ? read(TREND_KEY, []) : [];
    const groups = new Map();

    daily.forEach(row => {
      const date = toDate(row?.date || row?.createdAt);
      if (!date) return;
      const start = startOfWeek(date);
      const key = dateKey(start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const weeks = [...groups.entries()].map(([weekStart, rows]) => ({
      weekStart,
      days: rows.length,
      quarantineRate: average(rows, "quarantineRate"),
      requarantineRate: average(rows, "requarantineRate"),
      pending: average(rows, "pending"),
      excluded: average(rows, "excluded"),
      updatedAt: new Date().toISOString()
    })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    const withComparison = weeks.map((week, index) => {
      const previous = weeks[index + 1];
      if (!previous) return { ...week, status: "collecting", changes: null };

      const changes = {
        quarantineRate: Math.round((week.quarantineRate - previous.quarantineRate) * 10) / 10,
        requarantineRate: Math.round((week.requarantineRate - previous.requarantineRate) * 10) / 10,
        pending: Math.round((week.pending - previous.pending) * 10) / 10,
        excluded: Math.round((week.excluded - previous.excluded) * 10) / 10
      };

      const worsen = (changes.quarantineRate >= 5 ? 1 : 0) +
        (changes.requarantineRate >= 10 ? 1 : 0) +
        (changes.pending >= 3 ? 1 : 0) +
        (changes.excluded >= 3 ? 1 : 0);
      const improve = (changes.quarantineRate <= -5 ? 1 : 0) +
        (changes.requarantineRate <= -10 ? 1 : 0) +
        (changes.pending <= -3 ? 1 : 0) +
        (changes.excluded <= -3 ? 1 : 0);

      const status = worsen >= 2 ? "worsening" : improve >= 2 ? "improving" : "stable";
      return { ...week, status, changes };
    });

    write(withComparison);
    return withComparison;
  }

  function label(status) {
    return status === "worsening" ? "悪化" : status === "improving" ? "改善" : status === "stable" ? "横ばい" : "蓄積中";
  }

  function signed(value, suffix = "") {
    if (value == null) return "-";
    return `${value > 0 ? "+" : ""}${value}${suffix}`;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameDataQualityWeeklySummary");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameDataQualityTrend") ||
      document.getElementById("venueFrameDataQualityAlerts") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameDataQualityWeeklySummary";
    holder.className = "venue-frame-data-quality-weekly-summary";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(weeksInput) {
    const holder = ensureHolder();
    if (!holder) return;
    const weeks = Array.isArray(weeksInput) ? weeksInput : read(WEEKLY_KEY, []);
    const latest = weeks[0];
    const status = latest?.status || "collecting";

    holder.innerHTML = `
      <div class="dq-weekly-head">
        <div><h3>📅 データ品質週次サマリー</h3><p>日次トレンドを週ごとにまとめ、前週からの変化を確認します。</p></div>
        <strong class="dq-weekly-${status}">${label(status)}</strong>
      </div>
      ${latest ? `
        <div class="dq-weekly-metrics">
          <span>隔離率 ${latest.quarantineRate}% <em>${signed(latest.changes?.quarantineRate, "pt")}</em></span>
          <span>再隔離率 ${latest.requarantineRate}% <em>${signed(latest.changes?.requarantineRate, "pt")}</em></span>
          <span>未処理 ${latest.pending}件 <em>${signed(latest.changes?.pending, "件")}</em></span>
          <span>対象外 ${latest.excluded}件 <em>${signed(latest.changes?.excluded, "件")}</em></span>
        </div>
        <div class="dq-weekly-list">
          ${weeks.slice(0, 8).map(week => `
            <div class="dq-weekly-row">
              <b>${week.weekStart}週</b>
              <strong>${label(week.status)}</strong>
              <small>隔離 ${week.quarantineRate}%／再隔離 ${week.requarantineRate}%／未処理 ${week.pending}件</small>
            </div>`).join("")}
        </div>` : `<small>週次判定に必要な日次データを蓄積中です。</small>`}
      <p class="dq-weekly-note">監査専用です。予想ロジック・印・配点・買い目には影響しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-data-quality-weekly-summary-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-data-quality-weekly-summary-style";
    style.textContent = `
      .venue-frame-data-quality-weekly-summary{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .dq-weekly-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dq-weekly-head h3{margin:0 0 4px;font-size:17px}.dq-weekly-head p{margin:0;color:#64748b;font-size:12px}.dq-weekly-head>strong{padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}
      .dq-weekly-worsening{background:#fee2e2;color:#991b1b}.dq-weekly-improving{background:#dcfce7;color:#166534}.dq-weekly-stable{background:#e0f2fe;color:#075985}.dq-weekly-collecting{background:#f1f5f9;color:#475569}
      .dq-weekly-metrics{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.dq-weekly-metrics span{padding:6px 9px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}.dq-weekly-metrics em{margin-left:4px;color:#64748b;font-style:normal}
      .dq-weekly-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dq-weekly-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px}.dq-weekly-row b,.dq-weekly-row strong,.dq-weekly-row small{display:block}.dq-weekly-row strong{margin-top:3px}.dq-weekly-row small{margin-top:4px;color:#64748b;font-size:11px}.dq-weekly-note{margin:10px 0 0;color:#64748b;font-size:11px}
      @media(max-width:640px){.dq-weekly-head{display:block}.dq-weekly-head>strong{display:inline-block;margin-top:8px}.dq-weekly-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    const weeks = aggregateWeeks();
    render(weeks);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-data-quality-weekly-updated", { detail: { weeks } }));
    return weeks;
  }

  function install() {
    ensureStyle();
    refresh();
    window.addEventListener("chappy:venue-frame-data-quality-trend-updated", refresh);
    window.addEventListener("storage", refresh);
    setInterval(refresh, 60000);
  }

  window.ChappyVenueFrameDataQualityWeeklySummary = { aggregateWeeks, refresh, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();