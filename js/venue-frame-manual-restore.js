// js/venue-frame-manual-restore.js
// 復帰可能な隔離データだけを手動承認し、承認履歴と再隔離理由を保存する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const CANDIDATE_KEY = "chappy_venue_frame_restore_candidates_v1";
  const APPROVAL_KEY = "chappy_venue_frame_restore_approvals_v1";
  const MAX_HISTORY = 500;

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function approvals() {
    const rows = read(APPROVAL_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function candidates() {
    const rows = read(CANDIDATE_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function quarantine() {
    const rows = read(QUARANTINE_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function findCandidate(id) {
    return candidates().find(item => item?.id === id) || null;
  }

  function isRestorable(item) {
    return !!item && ["restorable", "ready", "復帰可能"].includes(String(item.status || item.restoreStatus || ""));
  }

  function approve(id) {
    const item = findCandidate(id);
    if (!isRestorable(item)) return { ok: false, reason: "復帰可能データではありません" };

    const validationRows = read(VALIDATION_KEY, []);
    if (!Array.isArray(validationRows)) return { ok: false, reason: "検証データを読み込めません" };

    const index = Number(item.rowIndex);
    const original = item.original || quarantine().find(row => row?.id === id)?.original;
    if (!original || !(index >= 0)) return { ok: false, reason: "復帰元データが見つかりません" };

    const nextValidation = validationRows.slice();
    nextValidation[index] = {
      ...original,
      manualRestore: {
        approved: true,
        approvedAt: new Date().toISOString(),
        sourceId: id
      }
    };
    write(VALIDATION_KEY, nextValidation);

    const history = approvals();
    const record = {
      id: `${Date.now()}-${id}`,
      sourceId: id,
      raceKey: item.raceKey || original.raceKey || "",
      place: item.place || original.place || original.jcd || "-",
      raceNo: item.raceNo || original.raceNo || original.rno || "",
      date: item.date || original.date || original.raceDate || "",
      action: "approved",
      reason: "復帰候補一覧で復帰可能と判定され、手動承認",
      approvedAt: new Date().toISOString()
    };
    write(APPROVAL_KEY, [record, ...history].slice(0, MAX_HISTORY));

    window.dispatchEvent(new CustomEvent("chappy:venue-frame-manual-restore", { detail: record }));
    setTimeout(runSafetyCheck, 100);
    return { ok: true, record };
  }

  function runSafetyCheck() {
    const gate = window.ChappyVenueFrameDataQuarantine;
    const quarantined = typeof gate?.buildQuarantine === "function" ? gate.buildQuarantine() : quarantine();
    const activeIds = new Set((Array.isArray(quarantined) ? quarantined : []).map(item => item.id));
    const history = approvals();
    let changed = false;

    const next = history.map(row => {
      if (row.action !== "approved" || row.recheckedAt) return row;
      changed = true;
      const reQuarantined = activeIds.has(row.sourceId);
      const current = (Array.isArray(quarantined) ? quarantined : []).find(item => item.id === row.sourceId);
      return {
        ...row,
        recheckedAt: new Date().toISOString(),
        result: reQuarantined ? "re_quarantined" : "restored",
        reQuarantineReasons: reQuarantined ? (current?.reasons || ["再チェックで異常を検出"]) : []
      };
    });

    if (changed) write(APPROVAL_KEY, next.slice(0, MAX_HISTORY));
    render();
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameManualRestore");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameRestoreCandidates") ||
      document.getElementById("venueFrameDataQuarantine") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameManualRestore";
    holder.className = "venue-frame-manual-restore";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function dateLabel(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const list = candidates();
    const ready = list.filter(isRestorable);
    const history = approvals();

    holder.innerHTML = `
      <div class="manual-restore-head">
        <div><h3>✅ 隔離データ 手動復帰承認</h3><p>復帰可能と判定されたデータだけを手動で戻します。</p></div>
        <strong>${ready.length}件承認可能</strong>
      </div>
      ${ready.length ? `<div class="manual-restore-list">${ready.slice(0,20).map(item => `
        <div class="manual-restore-row">
          <b>${item.place || "-"} ${item.raceNo || "-"}R</b>
          <small>${(item.reasons || []).join("・") || "原因解消済み"}</small>
          <button type="button" data-restore-id="${item.id}">手動で復帰承認</button>
        </div>`).join("")}</div>` : `<small>現在、手動承認できる復帰候補はありません。</small>`}
      <h4>承認履歴</h4>
      ${history.length ? `<div class="manual-restore-history">${history.slice(0,15).map(row => `
        <div class="restore-history-row result-${row.result || "pending"}">
          <b>${row.place} ${row.raceNo || "-"}R</b>
          <strong>${row.result === "restored" ? "復帰完了" : row.result === "re_quarantined" ? "再隔離" : "再確認中"}</strong>
          <small>${row.result === "re_quarantined" ? (row.reQuarantineReasons || []).join("・") : row.reason}</small>
          <em>${dateLabel(row.approvedAt)}</em>
        </div>`).join("")}</div>` : `<small>承認履歴はありません。</small>`}
      <p class="manual-restore-note">復帰後は必ず隔離ゲートで再確認します。異常が残る場合は自動で再隔離し、理由を履歴へ残します。</p>
    `;

    holder.querySelectorAll("button[data-restore-id]").forEach(button => {
      button.addEventListener("click", () => {
        const result = approve(button.dataset.restoreId);
        if (!result.ok) window.alert(result.reason);
        render();
      });
    });
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-manual-restore-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-manual-restore-style";
    style.textContent = `
      .venue-frame-manual-restore{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .manual-restore-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.manual-restore-head h3{margin:0 0 4px;font-size:17px}.manual-restore-head p{margin:0;color:#64748b;font-size:12px}.manual-restore-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#ecfdf5;font-size:12px}
      .manual-restore-list,.manual-restore-history{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:12px}.manual-restore-row,.restore-history-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.manual-restore-row b,.manual-restore-row small,.restore-history-row b,.restore-history-row strong,.restore-history-row small,.restore-history-row em{display:block}.manual-restore-row small,.restore-history-row small,.restore-history-row em{margin-top:4px;font-size:11px;color:#64748b}.manual-restore-row button{margin-top:8px;width:100%;padding:8px;border:0;border-radius:9px;background:#166534;color:#fff;font-weight:700}.venue-frame-manual-restore h4{margin:16px 0 8px}.result-restored{background:#f2fbf6}.result-re_quarantined{background:#fff7f7}.manual-restore-note{margin:12px 0 0;color:#64748b;font-size:11px;line-height:1.6}
      @media(max-width:640px){.manual-restore-list,.manual-restore-history{grid-template-columns:1fr}.manual-restore-head{display:block}.manual-restore-head>strong{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    window.addEventListener("storage", render);
    window.addEventListener("chappy:venue-frame-quarantine-updated", render);
    window.addEventListener("chappy:venue-frame-restore-candidates-updated", render);
    setInterval(runSafetyCheck, 60000);
  }

  window.ChappyVenueFrameManualRestore = { approve, runSafetyCheck, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
