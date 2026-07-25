// js/venue-frame-data-quarantine.js
// 健全性に問題がある場別枠検証データを削除せず隔離し、集計対象から外す。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const MAX_ROWS = 1000;

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(rows) {
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function raceKey(row) {
    if (row?.raceKey) return String(row.raceKey);
    const date = normalizeDate(row?.date || row?.raceDate);
    const jcd = String(row?.jcd || "").padStart(2, "0");
    const raceNo = Number(row?.raceNo || row?.rno || 0);
    return date && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function inspect(row, duplicateCount) {
    const reasons = [];
    const key = raceKey(row);
    const jcd = Number(row?.jcd);
    const raceNo = Number(row?.raceNo || row?.rno);
    const date = normalizeDate(row?.date || row?.raceDate);
    const rise = Number(row?.signals?.rising?.frameNo);
    const sink = Number(row?.signals?.sinking?.frameNo);

    if (!key) reasons.push("レース識別情報が不足");
    if (!(jcd >= 1 && jcd <= 24)) reasons.push("場コードが不正");
    if (!(raceNo >= 1 && raceNo <= 12)) reasons.push("レース番号が不正");
    if (!/^\d{8}$/.test(date)) reasons.push("日付が不正");
    if (!(rise >= 1 && rise <= 6)) reasons.push("浮上枠が不正");
    if (!(sink >= 1 && sink <= 6)) reasons.push("沈下枠が不正");
    if (rise && sink && rise === sink) reasons.push("浮上枠と沈下枠が同一");
    if (key && duplicateCount > 1) reasons.push("同一レースの重複");

    const hasOutcome = row?.status !== "evaluated" || !!row?.outcome;
    if (!hasOutcome) reasons.push("評価済みだが結果判定が欠損");

    const severity = reasons.some(reason => /不正|不足|同一|欠損/.test(reason))
      ? "exclude"
      : reasons.length
        ? "repair"
        : "normal";

    return { key, reasons, severity };
  }

  function buildQuarantine() {
    const rows = Array.isArray(read(VALIDATION_KEY, [])) ? read(VALIDATION_KEY, []) : [];
    const counts = new Map();
    rows.forEach(row => {
      const key = raceKey(row);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });

    const previous = Array.isArray(read(QUARANTINE_KEY, [])) ? read(QUARANTINE_KEY, []) : [];
    const previousById = new Map(previous.map(item => [item.id, item]));
    const quarantined = [];

    rows.forEach((row, index) => {
      const check = inspect(row, counts.get(raceKey(row)) || 0);
      if (check.severity === "normal") return;
      const id = check.key ? `${check.key}-${index}` : `row-${index}`;
      const prior = previousById.get(id);
      quarantined.push({
        id,
        raceKey: check.key,
        rowIndex: index,
        place: row?.place || row?.jcd || "-",
        jcd: row?.jcd || "",
        raceNo: row?.raceNo || row?.rno || "",
        date: normalizeDate(row?.date || row?.raceDate),
        severity: check.severity,
        reasons: check.reasons,
        quarantinedAt: prior?.quarantinedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        canRestore: check.reasons.length === 0,
        original: row
      });
    });

    write(quarantined);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-quarantine-updated", {
      detail: { count: quarantined.length }
    }));
    render(quarantined, rows.length);
    return quarantined;
  }

  function activeValidationRows() {
    const rows = Array.isArray(read(VALIDATION_KEY, [])) ? read(VALIDATION_KEY, []) : [];
    const quarantined = buildQuarantine();
    const excludedIndexes = new Set(quarantined.map(item => item.rowIndex));
    return rows.filter((_, index) => !excludedIndexes.has(index));
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameDataQuarantine");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameDataHealth") ||
      document.getElementById("venueFrameOperationsDashboard") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameDataQuarantine";
    holder.className = "venue-frame-data-quarantine";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(input, totalInput) {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = Array.isArray(input) ? input : read(QUARANTINE_KEY, []);
    const total = Number.isFinite(totalInput)
      ? totalInput
      : (Array.isArray(read(VALIDATION_KEY, [])) ? read(VALIDATION_KEY, []).length : 0);
    const excluded = rows.filter(item => item.severity === "exclude");
    const repair = rows.filter(item => item.severity === "repair");
    const active = Math.max(0, total - rows.length);

    holder.innerHTML = `
      <div class="quarantine-head">
        <div><h3>🛡️ 場別枠データ隔離ゲート</h3><p>異常データは削除せず、検証集計から安全に除外します。</p></div>
        <strong>${rows.length}件隔離</strong>
      </div>
      <div class="quarantine-summary">
        <span>全体 ${total}件</span>
        <span>有効 ${active}件</span>
        <span>要修正 ${repair.length}件</span>
        <span>集計対象外 ${excluded.length}件</span>
      </div>
      ${rows.length ? `<div class="quarantine-list">${rows.slice(0, 20).map(item => `
        <div class="quarantine-row severity-${item.severity}">
          <b>${item.place} ${item.raceNo || "-"}R</b>
          <strong>${item.severity === "exclude" ? "集計対象外" : "要修正"}</strong>
          <small>${item.reasons.join("・")}</small>
          <em>復帰条件：原因を修正し、次回健全性チェックで正常判定</em>
        </div>`).join("")}</div>` : `<small>隔離対象はありません。</small>`}
      <p class="quarantine-note">元データは保持します。予想ロジック・印・配点・買い目には影響しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-data-quarantine-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-data-quarantine-style";
    style.textContent = `
      .venue-frame-data-quarantine{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .quarantine-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.quarantine-head h3{margin:0 0 4px;font-size:17px}.quarantine-head p{margin:0;color:#64748b;font-size:12px}.quarantine-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .quarantine-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.quarantine-summary span{padding:5px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}
      .quarantine-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.quarantine-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px}.quarantine-row b,.quarantine-row strong,.quarantine-row small,.quarantine-row em{display:block}.quarantine-row small,.quarantine-row em{margin-top:4px;font-size:11px}.quarantine-row small{color:#475569}.quarantine-row em{color:#64748b;font-style:normal}.severity-exclude{background:#fff7f7}.severity-repair{background:#fffaf0}.quarantine-note{margin:10px 0 0;color:#64748b;font-size:11px;line-height:1.6}
      @media(max-width:640px){.quarantine-list{grid-template-columns:1fr}.quarantine-head{display:block}.quarantine-head>strong{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    buildQuarantine();
    window.addEventListener("storage", buildQuarantine);
    window.addEventListener("chappy:venue-frame-health-updated", buildQuarantine);
    setInterval(buildQuarantine, 60000);
  }

  window.ChappyVenueFrameDataQuarantine = {
    buildQuarantine,
    activeValidationRows,
    inspect,
    render
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();