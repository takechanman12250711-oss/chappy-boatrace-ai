// js/venue-frame-recovery-audit-report.js
// 隔離・復帰・再隔離の運用状況を集計する監査レポート。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const APPROVAL_KEY = "chappy_venue_frame_restore_approval_v1";
  const CANDIDATE_KEY = "chappy_venue_frame_restore_candidates_v1";

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function summarize() {
    const quarantine = list(read(QUARANTINE_KEY, []));
    const approvals = list(read(APPROVAL_KEY, []));
    const candidates = list(read(CANDIDATE_KEY, []));

    const approved = approvals.filter(row => row?.status === "approved" || row?.status === "restored");
    const restored = approvals.filter(row => row?.status === "restored" || row?.result === "restored");
    const requarantined = approvals.filter(row => row?.status === "requarantined" || row?.result === "requarantined");
    const pending = candidates.filter(row => row?.grade === "restorable" || row?.status === "restorable");
    const review = candidates.filter(row => row?.grade === "review" || row?.status === "review");
    const impossible = candidates.filter(row => row?.grade === "blocked" || row?.status === "blocked");

    const successRate = approved.length ? Number((restored.length * 100 / approved.length).toFixed(1)) : 0;
    const requarantineRate = approved.length ? Number((requarantined.length * 100 / approved.length).toFixed(1)) : 0;

    return {
      quarantine: quarantine.length,
      approvals: approved.length,
      restored: restored.length,
      requarantined: requarantined.length,
      pending: pending.length,
      review: review.length,
      impossible: impossible.length,
      successRate,
      requarantineRate,
      recent: approvals.slice(0, 10)
    };
  }

  function dateLabel(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameRecoveryAuditReport");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameRestoreApproval") ||
      document.getElementById("venueFrameRestoreCandidates") ||
      document.getElementById("venueFrameDataQuarantine") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameRecoveryAuditReport";
    holder.className = "venue-frame-recovery-audit";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const summary = summarize();
    holder.innerHTML = `
      <div class="recovery-audit-head">
        <div><h3>📋 データ復旧監査レポート</h3><p>隔離から復帰までの安全性と処理状況をまとめます。</p></div>
        <strong>${summary.successRate}% 復帰成功</strong>
      </div>
      <div class="recovery-audit-summary">
        <span>隔離中 ${summary.quarantine}件</span>
        <span>承認 ${summary.approvals}件</span>
        <span>復帰成功 ${summary.restored}件</span>
        <span>再隔離 ${summary.requarantined}件</span>
        <span>未処理 ${summary.pending}件</span>
        <span>要確認 ${summary.review}件</span>
        <span>復帰不可 ${summary.impossible}件</span>
      </div>
      <div class="recovery-audit-rates">
        <div><small>復帰成功率</small><strong>${summary.successRate}%</strong></div>
        <div><small>再隔離率</small><strong>${summary.requarantineRate}%</strong></div>
      </div>
      ${summary.recent.length ? `<div class="recovery-audit-list">${summary.recent.map(row => `
        <div class="recovery-audit-row status-${row.status || row.result || "unknown"}">
          <b>${row.place || row.jcd || "-"} ${row.raceNo || "-"}R</b>
          <strong>${row.status === "requarantined" || row.result === "requarantined" ? "再隔離" : row.status === "restored" || row.result === "restored" ? "復帰成功" : "承認"}</strong>
          <small>${row.reason || row.note || "-"}</small>
          <em>${dateLabel(row.updatedAt || row.approvedAt || row.createdAt)}</em>
        </div>`).join("")}</div>` : `<small>復帰承認履歴が蓄積されると表示します。</small>`}
      <p class="recovery-audit-note">このレポートはデータ管理専用です。予想ロジック・印・配点・買い目には使用しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-recovery-audit-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-recovery-audit-style";
    style.textContent = `
      .venue-frame-recovery-audit{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .recovery-audit-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.recovery-audit-head h3{margin:0 0 4px;font-size:17px}.recovery-audit-head p{margin:0;color:#64748b;font-size:12px}.recovery-audit-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#eefbf3;font-size:12px}
      .recovery-audit-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.recovery-audit-summary span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px}
      .recovery-audit-rates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.recovery-audit-rates div{padding:10px;border:1px solid #e2e8f0;border-radius:12px}.recovery-audit-rates small,.recovery-audit-rates strong{display:block}.recovery-audit-rates strong{margin-top:3px;font-size:20px}
      .recovery-audit-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.recovery-audit-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.recovery-audit-row b,.recovery-audit-row strong,.recovery-audit-row small,.recovery-audit-row em{display:block}.recovery-audit-row small,.recovery-audit-row em{margin-top:4px;font-size:11px}.recovery-audit-row small{color:#475569}.recovery-audit-row em{color:#64748b;font-style:normal}.status-restored{background:#f2fbf6}.status-requarantined{background:#fff7f7}.recovery-audit-note{margin:10px 0 0;color:#64748b;font-size:11px;line-height:1.6}
      @media(max-width:640px){.recovery-audit-head{display:block}.recovery-audit-head>strong{display:inline-block;margin-top:8px}.recovery-audit-list,.recovery-audit-rates{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function loadHiyoriRuntime() {
    if (window.ChappyHiyoriRuntimeLoader || document.getElementById("chappy-hiyori-runtime-bootstrap")) return;
    const script = document.createElement("script");
    script.id = "chappy-hiyori-runtime-bootstrap";
    script.src = "js/hiyori-runtime-loader.js?v=20260725-compact4";
    script.async = false;
    document.head.appendChild(script);
  }

  function install() {
    ensureStyle();
    render();
    loadHiyoriRuntime();
    window.addEventListener("storage", render);
    window.addEventListener("chappy:venue-frame-quarantine-updated", render);
    window.addEventListener("chappy:venue-frame-restore-updated", render);
    setInterval(render, 60000);
  }

  window.ChappyVenueFrameRecoveryAuditReport = { summarize, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();