// js/venue-frame-reference.js
// 信頼度が足りる場別枠データだけを予想画面へ参考表示する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const REPORT_URL = "data/stats/frame-rise-sink-patterns.json";
  const PLACE_TO_JCD = {
    桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04", 多摩川: "05", 浜名湖: "06",
    蒲郡: "07", 常滑: "08", 津: "09", 三国: "10", びわこ: "11", 住之江: "12",
    尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16", 宮島: "17", 徳山: "18",
    下関: "19", 若松: "20", 芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
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

  function confidence(starts) {
    const n = Number(starts || 0);
    if (n >= 100) return { key: "high", label: "高", usable: true };
    if (n >= 50) return { key: "medium", label: "中", usable: true };
    if (n >= 20) return { key: "low", label: "低", usable: false };
    return { key: "collecting", label: "蓄積中", usable: false };
  }

  function selectedVenue() {
    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    const jcd = PLACE_TO_JCD[place];
    return { place, venue: jcd ? report?.byVenue?.[jcd] : null };
  }

  function usefulRows(venue) {
    return Object.values(venue?.frames || {})
      .map(row => ({ ...row, confidence: confidence(row?.starts) }))
      .filter(row => row.confidence.usable)
      .sort((a, b) => Number(a.frameNo) - Number(b.frameNo));
  }

  function render() {
    const holder = document.getElementById("venueFrameReference");
    if (!holder || !report) return;

    const { place, venue } = selectedVenue();
    if (!venue?.raceCount) {
      holder.innerHTML = `<small>${esc(place || "選択中の場")}の場別枠データは蓄積中です。</small>`;
      holder.dataset.state = "collecting";
      return;
    }

    const rows = usefulRows(venue);
    if (!rows.length) {
      holder.innerHTML = `
        <div class="venue-frame-reference-head">
          <strong>📊 ${esc(place)} 場別枠データ</strong>
          <span>対象 ${esc(venue.raceCount)}レース</span>
        </div>
        <small>各枠の走数が50走未満のため、予想画面では数値を強調しません。結果分析画面で蓄積状況を確認できます。</small>
      `;
      holder.dataset.state = "collecting";
      return;
    }

    holder.innerHTML = `
      <div class="venue-frame-reference-head">
        <strong>📊 ${esc(place)} 場別枠データ</strong>
        <span>対象 ${esc(venue.raceCount)}レース</span>
      </div>
      <div class="venue-frame-reference-list">
        ${rows.map(row => `
          <span class="venue-frame-reference-item confidence-${esc(row.confidence.key)}">
            <b>${esc(row.frameNo)}枠</b>
            <em>信頼度 ${esc(row.confidence.label)}</em>
            <small>1着 ${esc(pct(row.winRate))}・3着内 ${esc(pct(row.top3Rate))}・沈下 ${esc(pct(row.sinkRate))}</small>
          </span>
        `).join("")}
      </div>
      <p>場別傾向の補足表示です。展開・コース判断より優先せず、単独で買い目を変更しません。</p>
    `;
    holder.dataset.state = "ready";
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-reference-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-reference-style";
    style.textContent = `
      #venueFrameReference{margin:12px 0;padding:13px;border:1px solid #dbe6f3;border-radius:14px;background:#f8fbff;color:#334155}
      #venueFrameReference[data-state="collecting"]{background:#fafafa;color:#64748b}
      .venue-frame-reference-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px}
      .venue-frame-reference-head strong{font-size:14px}.venue-frame-reference-head span{font-size:11px;padding:4px 7px;border-radius:999px;background:#e8eef6}
      .venue-frame-reference-list{display:flex;gap:7px;flex-wrap:wrap}
      .venue-frame-reference-item{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 9px;border:1px solid #d8e1ec;border-radius:12px;background:#fff;font-size:12px}
      .venue-frame-reference-item em{font-style:normal;font-size:10px;color:#475569}.venue-frame-reference-item small{color:#64748b}
      #venueFrameReference p{margin:9px 0 0;font-size:11px;color:#64748b;line-height:1.5}
      @media(max-width:640px){.venue-frame-reference-item{width:100%}.venue-frame-reference-item small{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameReference");
    if (holder) return holder;
    const anchor = document.getElementById("referenceTagsArea") || document.getElementById("raceInfoArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameReference";
    holder.setAttribute("aria-label", "場別枠データ参考表示");
    holder.innerHTML = "<small>場別枠データを確認中…</small>";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  async function loadReport() {
    const response = await fetch(`${REPORT_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`場別枠データを取得できません (${response.status})`);
    return response.json();
  }

  async function install() {
    ensureStyle();
    ensureHolder();
    try {
      report = await loadReport();
      render();
      document.getElementById("placeSelect")?.addEventListener("change", render);

      const observer = new MutationObserver(() => {
        if (!document.getElementById("venueFrameReference")) ensureHolder();
        render();
      });
      const predictionArea = document.getElementById("predictionSection") || document.body;
      observer.observe(predictionArea, { childList: true, subtree: true });
    } catch (error) {
      const holder = ensureHolder();
      if (holder) holder.innerHTML = `<small>${esc(error?.message || "場別枠データを読み込めませんでした")}</small>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
