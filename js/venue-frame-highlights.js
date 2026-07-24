// js/venue-frame-highlights.js
// 場別枠データから上がりやすい枠・沈みやすい枠を参考表示する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const REPORT_URL = "data/stats/frame-rise-sink-patterns.json";
  const PLACE_TO_JCD = {
    桐生:"01",戸田:"02",江戸川:"03",平和島:"04",多摩川:"05",浜名湖:"06",
    蒲郡:"07",常滑:"08",津:"09",三国:"10",びわこ:"11",住之江:"12",
    尼崎:"13",鳴門:"14",丸亀:"15",児島:"16",宮島:"17",徳山:"18",
    下関:"19",若松:"20",芦屋:"21",福岡:"22",唐津:"23",大村:"24"
  };

  let report = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pct(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "-";
  }

  function selectedVenue() {
    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    const jcd = PLACE_TO_JCD[place];
    return { place, venue: jcd ? report?.byVenue?.[jcd] : null };
  }

  function usableRows(venue) {
    return Object.values(venue?.frames || {})
      .filter(row => Number(row?.starts || 0) >= 50);
  }

  function pickHighlights(rows) {
    if (!rows.length) return { rising: null, sinking: null };
    const rising = rows.slice().sort((a,b) => Number(b.riseRate || 0) - Number(a.riseRate || 0))[0];
    const sinking = rows.slice().sort((a,b) => Number(b.sinkRate || 0) - Number(a.sinkRate || 0))[0];
    return { rising, sinking };
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameHighlights");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameReference") || document.getElementById("referenceTagsArea") || document.getElementById("raceInfoArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameHighlights";
    holder.setAttribute("aria-label", "場別枠データ要点");
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder || !report) return;

    const { place, venue } = selectedVenue();
    const rows = usableRows(venue);
    if (!venue?.raceCount || rows.length < 2) {
      holder.hidden = true;
      holder.innerHTML = "";
      return;
    }

    const { rising, sinking } = pickHighlights(rows);
    if (!rising || !sinking) {
      holder.hidden = true;
      return;
    }

    holder.hidden = false;
    holder.innerHTML = `
      <div class="venue-frame-highlights-head">
        <strong>📌 ${esc(place)} 枠傾向の要点</strong>
        <small>各枠50走以上のみ</small>
      </div>
      <div class="venue-frame-highlights-grid">
        <div class="venue-frame-highlight rise">
          <span>⬆️ 上がりやすい</span>
          <b>${esc(rising.frameNo)}枠</b>
          <small>浮上率 ${esc(pct(rising.riseRate))}・${esc(rising.starts)}走</small>
        </div>
        <div class="venue-frame-highlight sink">
          <span>⬇️ 沈みやすい</span>
          <b>${esc(sinking.frameNo)}枠</b>
          <small>沈下率 ${esc(pct(sinking.sinkRate))}・${esc(sinking.starts)}走</small>
        </div>
      </div>
      <p>場別の長期傾向を見やすくした補足です。展開・コース・ST・展示より優先せず、単独で買い目を変えません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-highlights-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-highlights-style";
    style.textContent = `
      #venueFrameHighlights{margin:10px 0;padding:12px;border:1px solid #dbe6f3;border-radius:14px;background:#fff}
      .venue-frame-highlights-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:9px}
      .venue-frame-highlights-head strong{font-size:14px}.venue-frame-highlights-head small{color:#64748b}
      .venue-frame-highlights-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .venue-frame-highlight{padding:10px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0}
      .venue-frame-highlight span,.venue-frame-highlight small{display:block;color:#64748b;font-size:11px}
      .venue-frame-highlight b{display:block;margin:3px 0;font-size:18px}
      .venue-frame-highlight.rise{background:#f2fbf6}.venue-frame-highlight.sink{background:#fff7f7}
      #venueFrameHighlights p{margin:9px 0 0;color:#64748b;font-size:11px;line-height:1.5}
      @media(max-width:640px){.venue-frame-highlights-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function install() {
    ensureStyle();
    try {
      const response = await fetch(`${REPORT_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`場別枠データを取得できません (${response.status})`);
      report = await response.json();
      render();
      document.getElementById("placeSelect")?.addEventListener("change", render);
      const target = document.getElementById("predictionSection") || document.body;
      new MutationObserver(render).observe(target, { childList:true, subtree:true });
    } catch (error) {
      console.warn("[venue-frame-highlights]", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();