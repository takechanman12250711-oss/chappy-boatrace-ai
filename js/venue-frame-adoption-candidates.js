// js/venue-frame-adoption-candidates.js
// 場別枠傾向の検証結果を採用候補・保留・除外に整理する。
// 予想ロジック・印・配点・買い目には反映しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_venue_frame_validation_v1";

  function readRows() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function pct(hit, total) {
    return total ? Number((hit * 100 / total).toFixed(1)) : 0;
  }

  function grade(rate, samples) {
    if (samples < 10) return { key: "collecting", label: "蓄積中" };
    if (rate >= 60) return { key: "high", label: "採用候補" };
    if (rate >= 45) return { key: "medium", label: "保留" };
    return { key: "low", label: "除外候補" };
  }

  function aggregate(rows) {
    const map = new Map();
    rows.filter(row => row?.status === "evaluated" && row?.outcome).forEach(row => {
      const signals = [
        { type: "rise", frameNo: Number(row.signals?.rising?.frameNo), hit: !!row.outcome.riseHit },
        { type: "sink", frameNo: Number(row.signals?.sinking?.frameNo), hit: !!row.outcome.sinkHit }
      ];
      signals.forEach(signal => {
        if (!(signal.frameNo >= 1 && signal.frameNo <= 6)) return;
        const key = `${row.jcd}-${signal.type}-${signal.frameNo}`;
        const item = map.get(key) || {
          key,
          jcd: row.jcd,
          place: row.place || row.jcd,
          type: signal.type,
          frameNo: signal.frameNo,
          samples: 0,
          hits: 0,
          lastEvaluatedAt: null
        };
        item.samples += 1;
        item.hits += signal.hit ? 1 : 0;
        const date = row.evaluatedAt || row.updatedAt || row.capturedAt || null;
        if (date && (!item.lastEvaluatedAt || String(date) > String(item.lastEvaluatedAt))) item.lastEvaluatedAt = date;
        map.set(key, item);
      });
    });

    return Array.from(map.values()).map(item => {
      const rate = pct(item.hits, item.samples);
      return { ...item, rate, grade: grade(rate, item.samples) };
    }).sort((a, b) => {
      const order = { high: 0, medium: 1, collecting: 2, low: 3 };
      return order[a.grade.key] - order[b.grade.key] || b.samples - a.samples || b.rate - a.rate;
    });
  }

  function dateLabel(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameAdoptionCandidates");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameValidationReport") || document.getElementById("frameRiseSinkReport") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameAdoptionCandidates";
    holder.className = "venue-frame-adoption-card";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function groupHtml(title, key, items) {
    const rows = items.filter(item => item.grade.key === key);
    return `
      <div class="venue-frame-adoption-group group-${key}">
        <h4>${title}<span>${rows.length}件</span></h4>
        ${rows.length ? `<div class="venue-frame-adoption-list">${rows.slice(0, 18).map(item => `
          <div class="venue-frame-adoption-row">
            <b>${item.place} ${item.frameNo}枠</b>
            <span>${item.type === "rise" ? "⬆️ 浮上" : "⬇️ 沈下"}</span>
            <small>${item.samples}件・的中 ${item.rate}%・更新 ${dateLabel(item.lastEvaluatedAt)}</small>
          </div>`).join("")}</div>` : `<small>該当データなし</small>`}
      </div>`;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const items = aggregate(readRows());
    holder.innerHTML = `
      <div class="venue-frame-adoption-head">
        <div><h3>✅ 場別枠傾向 採用候補一覧</h3><p>検証済みデータを採用候補・保留・除外候補に整理します。</p></div>
        <strong>${items.length}傾向</strong>
      </div>
      ${groupHtml("採用候補（10件以上・60%以上）", "high", items)}
      ${groupHtml("保留（10件以上・45〜59.9%）", "medium", items)}
      ${groupHtml("蓄積中（10件未満）", "collecting", items)}
      ${groupHtml("除外候補（10件以上・45%未満）", "low", items)}
      <p class="venue-frame-adoption-note">採用候補は今後の展開コメント連携を検討するための一覧です。買い目・印・配点には自動反映しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-adoption-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-adoption-style";
    style.textContent = `
      .venue-frame-adoption-card{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-adoption-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.venue-frame-adoption-head h3{margin:0 0 4px;font-size:17px}.venue-frame-adoption-head p{margin:0;color:#64748b;font-size:12px}.venue-frame-adoption-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .venue-frame-adoption-group{margin-top:12px;padding:10px;border-radius:12px;border:1px solid #e2e8f0}.venue-frame-adoption-group h4{display:flex;justify-content:space-between;gap:8px;margin:0 0 8px;font-size:13px}.venue-frame-adoption-group h4 span{color:#64748b;font-weight:500}.group-high{background:#f2fbf6}.group-medium{background:#fffaf0}.group-collecting{background:#f8fafc}.group-low{background:#fff7f7}
      .venue-frame-adoption-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.venue-frame-adoption-row{padding:8px;border-radius:10px;background:#fff;border:1px solid rgba(148,163,184,.28)}.venue-frame-adoption-row b,.venue-frame-adoption-row span,.venue-frame-adoption-row small{display:block}.venue-frame-adoption-row span{margin:2px 0;font-size:12px}.venue-frame-adoption-row small{color:#64748b;font-size:11px}.venue-frame-adoption-note{margin:12px 0 0;color:#64748b;font-size:11px;line-height:1.5}
      @media(max-width:640px){.venue-frame-adoption-list{grid-template-columns:1fr}.venue-frame-adoption-head{display:block}.venue-frame-adoption-head>strong{display:inline-block;margin-top:8px}}
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

  window.ChappyVenueFrameAdoptionCandidates = { aggregate, grade, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
