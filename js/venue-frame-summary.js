// js/venue-frame-summary.js
// 場別枠データを一文の参考コメントへ整理する。
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

  function buildSummary(place, venue) {
    const rows = usableRows(venue);
    if (!venue?.raceCount || rows.length < 2) return "";

    const rising = rows.slice().sort((a,b) => Number(b.riseRate || 0) - Number(a.riseRate || 0))[0];
    const sinking = rows.slice().sort((a,b) => Number(b.sinkRate || 0) - Number(a.sinkRate || 0))[0];
    if (!rising || !sinking) return "";

    if (Number(rising.frameNo) === Number(sinking.frameNo)) {
      return `${place}は${rising.frameNo}枠の着順変動が大きく、浮上率${pct(rising.riseRate)}・沈下率${pct(sinking.sinkRate)}。展開確認を優先したい場別傾向。`;
    }

    return `${place}は${rising.frameNo}枠が上がりやすく（浮上率${pct(rising.riseRate)}）、${sinking.frameNo}枠が沈みやすい（沈下率${pct(sinking.sinkRate)}）傾向。展開・コース判断の補足として確認。`;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameSummary");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameHighlights") || document.getElementById("venueFrameReference") || document.getElementById("raceInfoArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameSummary";
    holder.setAttribute("aria-label", "場別枠傾向コメント");
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder || !report) return;
    const { place, venue } = selectedVenue();
    const summary = buildSummary(place, venue);
    if (!summary) {
      holder.hidden = true;
      holder.innerHTML = "";
      return;
    }
    holder.hidden = false;
    holder.innerHTML = `<strong>📝 場別傾向コメント</strong><p>${esc(summary)}</p><small>参考表示のみ。単独で予想・買い目・配点を変更しません。</small>`;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-summary-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-summary-style";
    style.textContent = `
      #venueFrameSummary{margin:10px 0;padding:12px 13px;border-left:4px solid #94a3b8;border-radius:10px;background:#f8fafc;color:#334155}
      #venueFrameSummary strong{font-size:13px}
      #venueFrameSummary p{margin:6px 0;font-size:13px;line-height:1.65}
      #venueFrameSummary small{color:#64748b;font-size:10px}
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
      console.warn("[venue-frame-summary]", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
