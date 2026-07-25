// js/venue-frame-data-quality-alerts.js
// 場別枠データの隔離・復旧状況から品質アラートを生成する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const APPROVAL_KEY = "chappy_venue_frame_restore_approval_v1";
  const ALERT_KEY = "chappy_venue_frame_data_quality_alerts_v1";
  const MAX_HISTORY = 300;

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(rows) {
    localStorage.setItem(ALERT_KEY, JSON.stringify(rows.slice(0, MAX_HISTORY)));
  }

  function pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  function collectMetrics() {
    const validation = Array.isArray(read(VALIDATION_KEY, [])) ? read(VALIDATION_KEY, []) : [];
    const quarantine = Array.isArray(read(QUARANTINE_KEY, [])) ? read(QUARANTINE_KEY, []) : [];
    const approvals = Array.isArray(read(APPROVAL_KEY, [])) ? read(APPROVAL_KEY, []) : [];

    const approved = approvals.filter(row => row?.status === "approved" || row?.action === "approved");
    const restored = approvals.filter(row => row?.status === "restored" || row?.action === "restored");
    const requarantined = approvals.filter(row => row?.status === "requarantined" || row?.action === "requarantined");
    const pending = quarantine.filter(row => row?.restoreStatus === "review" || row?.restoreStatus === "restorable");

    return {
      total: validation.length,
      quarantined: quarantine.length,
      excluded: quarantine.filter(row => row?.severity === "exclude").length,
      repair: quarantine.filter(row => row?.severity === "repair").length,
      approved: approved.length,
      restored: restored.length,
      requarantined: requarantined.length,
      pending: pending.length,
      quarantineRate: pct(quarantine.length, validation.length),
      requarantineRate: pct(requarantined.length, Math.max(1, restored.length + requarantined.length))
    };
  }

  function evaluate(metrics) {
    const alerts = [];
    const add = (level, code, title, detail) => alerts.push({ level, code, title, detail });

    if (metrics.total >= 20 && metrics.quarantineRate >= 20) {
      add("critical", "QUARANTINE_RATE_CRITICAL", "隔離率が高すぎます", `隔離率 ${metrics.quarantineRate}%（${metrics.quarantined}/${metrics.total}件）`);
    } else if (metrics.total >= 20 && metrics.quarantineRate >= 10) {
      add("warning", "QUARANTINE_RATE_WARNING", "隔離率が上昇しています", `隔離率 ${metrics.quarantineRate}%（${metrics.quarantined}/${metrics.total}件）`);
    }

    if (metrics.requarantineRate >= 30 && metrics.restored + metrics.requarantined >= 3) {
      add("critical", "REQUARANTINE_RATE_CRITICAL", "再隔離率が高すぎます", `再隔離率 ${metrics.requarantineRate}%`);
    } else if (metrics.requarantineRate >= 15 && metrics.restored + metrics.requarantined >= 3) {
      add("warning", "REQUARANTINE_RATE_WARNING", "再隔離が増えています", `再隔離率 ${metrics.requarantineRate}%`);
    }

    if (metrics.pending >= 10) {
      add("warning", "PENDING_REVIEW_HIGH", "未処理の復旧候補が多いです", `未処理 ${metrics.pending}件`);
    } else if (metrics.pending >= 5) {
      add("notice", "PENDING_REVIEW_NOTICE", "復旧候補の確認が必要です", `未処理 ${metrics.pending}件`);
    }

    if (metrics.excluded >= 10) {
      add("warning", "EXCLUDED_DATA_HIGH", "集計対象外データが増えています", `集計対象外 ${metrics.excluded}件`);
    }

    if (!alerts.length) {
      add("normal", "DATA_QUALITY_NORMAL", "データ品質は安定しています", "重大な隔離・復旧異常は検出されていません");
    }

    return alerts;
  }

  function saveSnapshot(metrics, alerts) {
    const previous = Array.isArray(read(ALERT_KEY, [])) ? read(ALERT_KEY, []) : [];
    const signature = alerts.map(row => `${row.code}:${row.level}`).sort().join("|");
    const latest = previous[0];
    if (latest?.signature === signature) return previous;

    const next = [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      signature,
      metrics,
      alerts
    }, ...previous];
    write(next);
    return next;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameDataQualityAlerts");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameRecoveryAuditReport") ||
      document.getElementById("venueFrameRestoreApproval") ||
      document.getElementById("venueFrameDataQuarantine") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameDataQualityAlerts";
    holder.className = "venue-frame-data-quality-alerts";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(metrics, alerts) {
    const holder = ensureHolder();
    if (!holder) return;
    const worst = alerts.some(row => row.level === "critical") ? "critical" :
      alerts.some(row => row.level === "warning") ? "warning" :
      alerts.some(row => row.level === "notice") ? "notice" : "normal";

    holder.innerHTML = `
      <div class="dq-alert-head">
        <div><h3>🚨 データ品質アラート</h3><p>隔離・復旧の異常増加を監視します。予想処理は停止しません。</p></div>
        <strong class="dq-level-${worst}">${worst === "critical" ? "要対応" : worst === "warning" ? "注意" : worst === "notice" ? "確認" : "正常"}</strong>
      </div>
      <div class="dq-alert-metrics">
        <span>隔離率 ${metrics.quarantineRate}%</span>
        <span>再隔離率 ${metrics.requarantineRate}%</span>
        <span>未処理 ${metrics.pending}件</span>
        <span>集計対象外 ${metrics.excluded}件</span>
      </div>
      <div class="dq-alert-list">
        ${alerts.map(row => `
          <div class="dq-alert-row dq-${row.level}">
            <b>${row.title}</b>
            <small>${row.detail}</small>
          </div>`).join("")}
      </div>
      <p class="dq-alert-note">監査表示専用です。予想ロジック・印・配点・買い目には影響しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-data-quality-alerts-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-data-quality-alerts-style";
    style.textContent = `
      .venue-frame-data-quality-alerts{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .dq-alert-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dq-alert-head h3{margin:0 0 4px;font-size:17px}.dq-alert-head p{margin:0;color:#64748b;font-size:12px}.dq-alert-head>strong{padding:5px 9px;border-radius:999px;font-size:12px;white-space:nowrap}
      .dq-level-critical{background:#fee2e2;color:#991b1b}.dq-level-warning{background:#ffedd5;color:#9a3412}.dq-level-notice{background:#fef3c7;color:#92400e}.dq-level-normal{background:#dcfce7;color:#166534}
      .dq-alert-metrics{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.dq-alert-metrics span{padding:5px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}
      .dq-alert-list{display:grid;gap:7px}.dq-alert-row{padding:10px;border-radius:11px;border:1px solid #e2e8f0}.dq-alert-row b,.dq-alert-row small{display:block}.dq-alert-row small{margin-top:4px;color:#475569;font-size:11px}.dq-critical{background:#fff1f2}.dq-warning{background:#fff7ed}.dq-notice{background:#fffbeb}.dq-normal{background:#f0fdf4}.dq-alert-note{margin:10px 0 0;color:#64748b;font-size:11px}
      @media(max-width:640px){.dq-alert-head{display:block}.dq-alert-head>strong{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    const metrics = collectMetrics();
    const alerts = evaluate(metrics);
    saveSnapshot(metrics, alerts);
    render(metrics, alerts);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-data-quality-alerts-updated", { detail: { metrics, alerts } }));
    return { metrics, alerts };
  }

  function install() {
    ensureStyle();
    refresh();
    [
      "chappy:venue-frame-quarantine-updated",
      "chappy:venue-frame-restore-approved",
      "chappy:venue-frame-recovery-audit-updated"
    ].forEach(name => window.addEventListener(name, refresh));
    window.addEventListener("storage", refresh);
    setInterval(refresh, 60000);
  }

  window.ChappyVenueFrameDataQualityAlerts = { collectMetrics, evaluate, refresh, render };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
