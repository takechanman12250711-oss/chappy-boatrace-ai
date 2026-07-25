// js/venue-frame-status-history.js
// 場別枠コメント連携の継続・保留・停止の変化を履歴化する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const RECHECK_KEY = "chappy_venue_frame_comment_recheck_v1";
  const HISTORY_KEY = "chappy_venue_frame_status_history_v1";
  const MAX_HISTORY = 500;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeHistory(rows) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, MAX_HISTORY)));
  }

  function normalizeCurrent(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      if (Array.isArray(value.items)) return value.items;
      return Object.values(value).filter(Boolean);
    }
    return [];
  }

  function itemKey(item) {
    const jcd = String(item?.jcd || "").padStart(2, "0");
    const type = String(item?.type || "");
    const frameNo = Number(item?.frameNo || 0);
    return jcd && type && frameNo ? `${jcd}-${type}-${frameNo}` : "";
  }

  function statusOf(item) {
    return String(item?.status || item?.grade?.key || item?.decision || "observing");
  }

  function labelOf(status) {
    return ({
      continue: "連携継続",
      observing: "継続観察",
      hold: "連携保留",
      stop: "連携停止",
      high: "連携継続",
      medium: "連携保留",
      low: "連携停止"
    })[status] || status || "未判定";
  }

  function snapshot() {
    const current = normalizeCurrent(read(RECHECK_KEY, []));
    const previous = read(HISTORY_KEY, []);
    const latestByKey = new Map();
    previous.forEach(row => {
      if (row?.key && !latestByKey.has(row.key)) latestByKey.set(row.key, row);
    });

    const additions = [];
    current.forEach(item => {
      const key = itemKey(item);
      if (!key) return;
      const status = statusOf(item);
      const latest = latestByKey.get(key);
      if (latest?.toStatus === status) return;
      additions.push({
        id: `${Date.now()}-${key}`,
        key,
        jcd: String(item.jcd || "").padStart(2, "0"),
        place: item.place || item.jcd || "",
        type: item.type,
        frameNo: Number(item.frameNo),
        fromStatus: latest?.toStatus || null,
        toStatus: status,
        samples: Number(item.samples || item.auditSamples || 0),
        hits: Number(item.hits || 0),
        rate: Number(item.rate || item.auditRate || 0),
        changedAt: new Date().toISOString()
      });
    });

    if (additions.length) writeHistory([...additions, ...previous]);
    render(additions.length ? [...additions, ...previous] : previous);
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameStatusHistory");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameCommentAudit") || document.getElementById("venueFrameAdoptionCandidates") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameStatusHistory";
    holder.className = "venue-frame-status-history";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function dateLabel(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  function render(input) {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = Array.isArray(input) ? input : read(HISTORY_KEY, []);
    holder.innerHTML = `
      <h3>🪜 場別枠傾向の昇格・降格履歴</h3>
      <p>コメント連携の判定が変わった時だけ記録します。</p>
      ${rows.length ? `<div class="venue-frame-status-history-list">${rows.slice(0,20).map(row => `
        <div class="history-row status-${row.toStatus}">
          <b>${row.place || row.jcd} ${row.frameNo}枠</b>
          <span>${row.type === "rise" ? "⬆️ 浮上" : "⬇️ 沈下"}</span>
          <strong>${row.fromStatus ? `${labelOf(row.fromStatus)} → ` : ""}${labelOf(row.toStatus)}</strong>
          <small>${row.samples}件・${row.rate}%・${dateLabel(row.changedAt)}</small>
        </div>`).join("")}</div>` : `<small>判定変更が発生すると履歴を表示します。</small>`}
      <p class="history-note">履歴は説明・監査用です。予想ロジック・印・配点・買い目には使用しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-status-history-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-status-history-style";
    style.textContent = `
      .venue-frame-status-history{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-status-history h3{margin:0 0 5px;font-size:17px}.venue-frame-status-history>p{margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.6}
      .venue-frame-status-history-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.history-row{padding:9px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.history-row b,.history-row span,.history-row strong,.history-row small{display:block}.history-row span,.history-row small{margin-top:3px}.history-row small{color:#64748b;font-size:11px}.status-continue,.status-high{background:#f2fbf6}.status-hold,.status-medium{background:#fffaf0}.status-stop,.status-low{background:#fff7f7}.history-note{margin-top:10px!important}@media(max-width:640px){.venue-frame-status-history-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    snapshot();
    window.addEventListener("storage", snapshot);
    document.getElementById("placeSelect")?.addEventListener("change", render);
    setInterval(snapshot, 60000);
  }

  window.ChappyVenueFrameStatusHistory = { snapshot, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();