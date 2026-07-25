// js/venue-frame-data-quality-trend.js
// 場別枠データ品質の推移を日次保存し、悪化傾向を監査表示する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const APPROVAL_KEY = "chappy_venue_frame_restore_approval_v1";
  const TREND_KEY = "chappy_venue_frame_data_quality_trend_v1";
  const MAX_DAYS = 90;

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(rows) {
    localStorage.setItem(TREND_KEY, JSON.stringify(rows.slice(0, MAX_DAYS)));
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function collectSnapshot() {
    const validation = Array.isArray(read(VALIDATION_KEY, [])) ? read(VALIDATION_KEY, []) : [];
    const quarantine = Array.isArray(read(QUARANTINE_KEY, [])) ? read(QUARANTINE_KEY, []) : [];
    const approvals = Array.isArray(read(APPROVAL_KEY, [])) ? read(APPROVAL_KEY, []) : [];
    const restored = approvals.filter(row => row?.status === "restored" || row?.action === "restored").length;
    const requarantined = approvals.filter(row => row?.status === "requarantined" || row?.action === "requarantined").length;
    const pending = quarantine.filter(row => row?.restoreStatus === "review" || row?.restoreStatus === "restorable").length;

    return {
      day: dayKey(),
      recordedAt: new Date().toISOString(),
      total: validation.length,
      quarantined: quarantine.length,
      quarantineRate: pct(quarantine.length, validation.length),
      requarantineRate: pct(requarantined, Math.max(1, restored + requarantined)),
      pending,
      excluded: quarantine.filter(row => row?.severity === "exclude").length
    };
  }

  function saveDailySnapshot(snapshot) {
    const history = Array.isArray(read(TREND_KEY, [])) ? read(TREND_KEY, []) : [];
    const next = [snapshot, ...history.filter(row => row?.day !== snapshot.day)];
    write(next);
    return next.slice(0, MAX_DAYS);
  }

  function average(rows, field) {
    if (!rows.length) return 0;
    return Math.round((rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0) / rows.length) * 10) / 10;
  }

  function analyze(history) {
    const recent = history.slice(0, 3);
    const previous = history.slice(3, 6);
    if (recent.length < 2) {
      return { status: "collecting", label: "蓄積中", reasons: ["2日分以上の履歴が必要です"] };
    }

    const currentQ = average(recent, "quarantineRate");
    const previousQ = average(previous, "quarantineRate");
    const currentR = average(recent, "requarantineRate");
    const previousR = average(previous, "requarantineRate");
    const currentP = average(recent, "pending");
    const previousP = average(previous, "pending");
    const reasons = [];

    if (previous.length && currentQ - previousQ >= 5) reasons.push(`隔離率が平均 ${Math.round((currentQ - previousQ) * 10) / 10}pt悪化`);
    if (previous.length && currentR - previousR >= 10) reasons.push(`再隔離率が平均 ${Math.round((currentR - previousR) * 10) / 10}pt悪化`);
    if (previous.length && currentP - previousP >= 3) reasons.push(`未処理件数が平均 ${Math.round((currentP - previousP) * 10) / 10}件増加`);

    if (reasons.length >= 2) return { status: "critical", label: "悪化", reasons };
    if (reasons.length === 1) return { status: "warning", label: "注意", reasons };
    return { status: "stable", label: "安定", reasons: ["直近の品質指標に大きな悪化はありません"] };
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameDataQualityTrend");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameDataQualityAlerts") ||
      document.getElementById("venueFrameRecoveryAuditReport") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameDataQualityTrend";
    holder.className = "venue-frame-data-quality-trend";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(history, analysis) {
    const holder = ensureHolder();
    if (!holder) return;
    const recent = history.slice(0, 7);
    holder.innerHTML = `
      <div class="dq-trend-head">
        <div><h3>📈 データ品質トレンド</h3><p>隔離率・再隔離率・未処理件数の日次推移を監査します。</p></div>
        <strong class="dq-trend-${analysis.status}">${analysis.label}</strong>
      </div>
      <div class="dq-trend-reasons">${analysis.reasons.map(reason => `<span>${reason}</span>`).join("")}</div>
      ${recent.length ? `<div class="dq-trend-list">${recent.map(row => `
        <div class="dq-trend-row">
          <b>${row.day}</b>
          <span>隔離率 ${row.quarantineRate}%</span>
          <span>再隔離率 ${row.requarantineRate}%</span>
          <span>未処理 ${row.pending}件</span>
        </div>`).join("")}</div>` : `<small>履歴はまだありません。</small>`}
      <p class="dq-trend-note">最大90日分を端末内に保存します。監査専用で、予想処理には影響しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-data-quality-trend-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-data-quality-trend-style";
    style.textContent = `
      .venue-frame-data-quality-trend{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .dq-trend-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dq-trend-head h3{margin:0 0 4px;font-size:17px}.dq-trend-head p{margin:0;color:#64748b;font-size:12px}.dq-trend-head>strong{padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}
      .dq-trend-stable{background:#dcfce7;color:#166534}.dq-trend-warning{background:#fef3c7;color:#92400e}.dq-trend-critical{background:#fee2e2;color:#991b1b}.dq-trend-collecting{background:#e2e8f0;color:#475569}
      .dq-trend-reasons{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.dq-trend-reasons span{padding:5px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}
      .dq-trend-list{display:grid;gap:7px}.dq-trend-row{display:grid;grid-template-columns:110px repeat(3,minmax(0,1fr));gap:8px;padding:9px;border:1px solid #e2e8f0;border-radius:11px;font-size:12px}.dq-trend-row span{color:#475569}.dq-trend-note{margin:10px 0 0;color:#64748b;font-size:11px}
      @media(max-width:640px){.dq-trend-head{display:block}.dq-trend-head>strong{display:inline-block;margin-top:8px}.dq-trend-row{grid-template-columns:1fr 1fr}.dq-trend-row b{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    const snapshot = collectSnapshot();
    const history = saveDailySnapshot(snapshot);
    const result = analyze(history);
    render(history, result);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-data-quality-trend-updated", { detail: { snapshot, history, analysis: result } }));
    return { snapshot, history, analysis: result };
  }

  function install() {
    ensureStyle();
    refresh();
    ["chappy:venue-frame-data-quality-alerts-updated", "chappy:venue-frame-quarantine-updated", "chappy:venue-frame-restore-approved"].forEach(name => window.addEventListener(name, refresh));
    window.addEventListener("storage", refresh);
    setInterval(refresh, 60000);
  }

  window.ChappyVenueFrameDataQualityTrend = { collectSnapshot, saveDailySnapshot, analyze, refresh, render };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();