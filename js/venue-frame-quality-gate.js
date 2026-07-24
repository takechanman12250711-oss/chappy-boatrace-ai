// js/venue-frame-quality-gate.js
// 検証済みの精度に応じて場別枠参考表示を強調・注意・非表示へ切り替える。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_venue_frame_validation_v1";
  const PLACE_TO_JCD = {
    桐生:"01",戸田:"02",江戸川:"03",平和島:"04",多摩川:"05",浜名湖:"06",
    蒲郡:"07",常滑:"08",津:"09",三国:"10",びわこ:"11",住之江:"12",
    尼崎:"13",鳴門:"14",丸亀:"15",児島:"16",宮島:"17",徳山:"18",
    下関:"19",若松:"20",芦屋:"21",福岡:"22",唐津:"23",大村:"24"
  };

  function readRows() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function selectedVenue() {
    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    return { place, jcd: PLACE_TO_JCD[place] || "" };
  }

  function percent(hit, total) {
    return total ? Number((hit * 100 / total).toFixed(1)) : 0;
  }

  function grade(rate, samples) {
    if (samples < 10) return { key:"collecting", label:"検証蓄積中", visible:true };
    if (rate >= 60) return { key:"high", label:"検証参考度 高", visible:true };
    if (rate >= 45) return { key:"medium", label:"検証参考度 中", visible:true };
    return { key:"low", label:"検証参考度 低", visible:false };
  }

  function venueScore(jcd) {
    const rows = readRows().filter(item =>
      item?.status === "evaluated" &&
      item?.outcome &&
      String(item?.jcd || "").padStart(2, "0") === jcd
    );
    const samples = rows.length;
    const riseHits = rows.filter(item => item.outcome.riseHit).length;
    const sinkHits = rows.filter(item => item.outcome.sinkHit).length;
    const rate = samples
      ? Number(((percent(riseHits, samples) + percent(sinkHits, samples)) / 2).toFixed(1))
      : 0;
    return { samples, rate, grade:grade(rate, samples) };
  }

  function ensureBadge(target) {
    let badge = target.querySelector(":scope > .venue-frame-quality-badge");
    if (badge) return badge;
    badge = document.createElement("div");
    badge.className = "venue-frame-quality-badge";
    target.prepend(badge);
    return badge;
  }

  function apply() {
    const { place, jcd } = selectedVenue();
    if (!jcd) return;
    const score = venueScore(jcd);
    const targets = [
      document.getElementById("venueFrameReference"),
      document.getElementById("venueFrameHighlights"),
      document.getElementById("venueFrameSummary")
    ].filter(Boolean);

    for (const target of targets) {
      target.dataset.validationGrade = score.grade.key;
      const badge = ensureBadge(target);
      badge.textContent = `${score.grade.label}・${score.samples}件${score.samples ? `・精度 ${score.rate}%` : ""}`;
      badge.title = `${place}の過去検証結果に基づく表示品質判定`;
    }

    const reference = document.getElementById("venueFrameReference");
    const highlights = document.getElementById("venueFrameHighlights");
    const summary = document.getElementById("venueFrameSummary");

    if (score.grade.key === "low") {
      if (highlights) highlights.hidden = true;
      if (summary) summary.hidden = true;
      if (reference) {
        reference.hidden = false;
        reference.classList.add("validation-muted");
      }
    } else {
      if (reference) reference.classList.remove("validation-muted");
      if (highlights && highlights.innerHTML.trim()) highlights.hidden = false;
      if (summary && summary.innerHTML.trim()) summary.hidden = false;
    }
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-quality-gate-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-quality-gate-style";
    style.textContent = `
      .venue-frame-quality-badge{margin:0 0 8px;padding:5px 8px;border-radius:999px;background:#eef2f7;color:#475569;font-size:11px;font-weight:700;display:inline-block}
      [data-validation-grade="high"]>.venue-frame-quality-badge{background:#e8f7ee;color:#166534}
      [data-validation-grade="medium"]>.venue-frame-quality-badge{background:#fff7dd;color:#92400e}
      [data-validation-grade="low"]>.venue-frame-quality-badge{background:#fff0f0;color:#991b1b}
      [data-validation-grade="collecting"]>.venue-frame-quality-badge{background:#f1f5f9;color:#64748b}
      .validation-muted{opacity:.58;filter:grayscale(.2)}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    apply();
    document.getElementById("placeSelect")?.addEventListener("change", () => setTimeout(apply, 50));
    window.addEventListener("storage", event => {
      if (!event.key || event.key === STORAGE_KEY) apply();
    });
    const target = document.getElementById("predictionSection") || document.body;
    new MutationObserver(() => apply()).observe(target, { childList:true, subtree:true });
    setInterval(apply, 60000);
  }

  window.ChappyVenueFrameQualityGate = { apply, venueScore, grade };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
