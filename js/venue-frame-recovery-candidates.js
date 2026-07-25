// js/venue-frame-recovery-candidates.js
// 隔離中の場別枠検証データを復帰可能・要確認・復帰不可に分類する。
// 自動修正・自動復帰は行わず、予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const QUARANTINE_KEY = "chappy_venue_frame_quarantine_v1";
  const RECOVERY_KEY = "chappy_venue_frame_recovery_candidates_v1";
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
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  }

  function classify(item) {
    const reasons = Array.isArray(item?.reasons) ? item.reasons : [];
    const hard = reasons.some(reason => /浮上枠と沈下枠が同一|場コードが不正|日付が不正|レース番号が不正/.test(reason));
    const fixable = reasons.every(reason => /重複|結果判定が欠損|識別情報が不足/.test(reason));

    if (!reasons.length || item?.canRestore === true) {
      return {
        status: "ready",
        label: "復帰可能",
        condition: "次回健全性チェックで正常判定を確認後、集計へ戻せます。"
      };
    }

    if (hard) {
      return {
        status: "blocked",
        label: "復帰不可",
        condition: "元データの場・日付・レース番号・枠情報を修正し、再検証が必要です。"
      };
    }

    if (fixable || item?.severity === "repair") {
      return {
        status: "review",
        label: "要確認",
        condition: "重複整理または結果判定の補完後、再チェックしてください。"
      };
    }

    return {
      status: "review",
      label: "要確認",
      condition: "隔離理由を修正し、健全性チェックを再実行してください。"
    };
  }

  function build() {
    const quarantine = Array.isArray(read(QUARANTINE_KEY, [])) ? read(QUARANTINE_KEY, []) : [];
    const previous = Array.isArray(read(RECOVERY_KEY, [])) ? read(RECOVERY_KEY, []) : [];
    const previousById = new Map(previous.map(item => [item.id, item]));

    const rows = quarantine.map(item => {
      const decision = classify(item);
      const prior = previousById.get(item.id);
      return {
        id: item.id,
        raceKey: item.raceKey || "",
        place: item.place || item.jcd || "-",
        jcd: item.jcd || "",
        raceNo: item.raceNo || "",
        date: item.date || "",
        severity: item.severity || "exclude",
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
        recoveryStatus: decision.status,
        recoveryLabel: decision.label,
        recoveryCondition: decision.condition,
        firstCheckedAt: prior?.firstCheckedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    write(rows);
    render(rows);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-recovery-updated", {
      detail: { count: rows.length }
    }));
    return rows;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameRecoveryCandidates");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameDataQuarantine") ||
      document.getElementById("venueFrameDataHealth") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameRecoveryCandidates";
    holder.className = "venue-frame-recovery-candidates";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(input) {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = Array.isArray(input) ? input : read(RECOVERY_KEY, []);
    const ready = rows.filter(item => item.recoveryStatus === "ready");
    const review = rows.filter(item => item.recoveryStatus === "review");
    const blocked = rows.filter(item => item.recoveryStatus === "blocked");

    holder.innerHTML = `
      <div class="recovery-head">
        <div><h3>♻️ 隔離データ 復旧候補一覧</h3><p>隔離データを復帰可能・要確認・復帰不可に分類します。</p></div>
        <strong>${rows.length}件</strong>
      </div>
      <div class="recovery-summary">
        <span>復帰可能 ${ready.length}件</span>
        <span>要確認 ${review.length}件</span>
        <span>復帰不可 ${blocked.length}件</span>
      </div>
      ${rows.length ? `<div class="recovery-list">${rows.slice(0, 24).map(item => `
        <div class="recovery-row recovery-${item.recoveryStatus}">
          <b>${item.place} ${item.raceNo || "-"}R</b>
          <strong>${item.recoveryLabel}</strong>
          <small>${item.reasons.join("・") || "異常原因は解消済み"}</small>
          <em>${item.recoveryCondition}</em>
        </div>`).join("")}</div>` : `<small>復旧候補はありません。</small>`}
      <p class="recovery-note">自動修正・自動復帰は行いません。元データを保持したまま確認用に表示します。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-recovery-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-recovery-style";
    style.textContent = `
      .venue-frame-recovery-candidates{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .recovery-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.recovery-head h3{margin:0 0 4px;font-size:17px}.recovery-head p{margin:0;color:#64748b;font-size:12px}.recovery-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .recovery-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.recovery-summary span{padding:5px 8px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px}
      .recovery-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.recovery-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px}.recovery-row b,.recovery-row strong,.recovery-row small,.recovery-row em{display:block}.recovery-row small,.recovery-row em{margin-top:4px;font-size:11px}.recovery-row small{color:#475569}.recovery-row em{color:#64748b;font-style:normal}.recovery-ready{background:#f2fbf6}.recovery-review{background:#fffaf0}.recovery-blocked{background:#fff7f7}.recovery-note{margin:10px 0 0;color:#64748b;font-size:11px;line-height:1.6}
      @media(max-width:640px){.recovery-list{grid-template-columns:1fr}.recovery-head{display:block}.recovery-head>strong{display:inline-block;margin-top:8px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    window.addEventListener("storage", build);
    window.addEventListener("chappy:venue-frame-quarantine-updated", build);
    setInterval(build, 60000);
  }

  window.ChappyVenueFrameRecoveryCandidates = { build, classify, render };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();

(function () {
  "use strict";
  if (window.ChappyHiyoriRuntimeLoader || document.getElementById("chappy-hiyori-runtime-bridge")) return;
  const script = document.createElement("script");
  script.id = "chappy-hiyori-runtime-bridge";
  script.src = "js/hiyori-runtime-loader.js?v=20260725-runtime2";
  script.async = false;
  script.onerror = () => console.warn("[hiyori-runtime-bridge] loader failed");
  document.head.appendChild(script);
})();
