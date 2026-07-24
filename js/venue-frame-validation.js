// js/venue-frame-validation.js
// 場別枠傾向を予想時点で保存し、結果履歴と照合して参考度を検証する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const REPORT_URL = "data/stats/frame-rise-sink-patterns.json";
  const STORAGE_KEY = "chappy_venue_frame_validation_v1";
  const MIN_FRAME_STARTS = 50;
  const PLACE_TO_JCD = {
    桐生:"01",戸田:"02",江戸川:"03",平和島:"04",多摩川:"05",浜名湖:"06",
    蒲郡:"07",常滑:"08",津:"09",三国:"10",びわこ:"11",住之江:"12",
    尼崎:"13",鳴門:"14",丸亀:"15",児島:"16",宮島:"17",徳山:"18",
    下関:"19",若松:"20",芦屋:"21",福岡:"22",唐津:"23",大村:"24"
  };

  let report = null;

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeStore(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 1000)));
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function selectedRaceMeta() {
    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    const jcd = PLACE_TO_JCD[place] || "";
    const raceNo = Number(String(document.getElementById("raceSelect")?.value || "").replace(/\D/g, ""));
    const date = normalizeDate(document.getElementById("dateInput")?.value);
    const raceKey = date && jcd && raceNo ? `${date}-${jcd}-${raceNo}` : "";
    return { place, jcd, raceNo, date, raceKey };
  }

  function usableRows(venue) {
    return Object.values(venue?.frames || {})
      .filter(row => Number(row?.starts || 0) >= MIN_FRAME_STARTS);
  }

  function selectSignals(venue) {
    const rows = usableRows(venue);
    if (rows.length < 2) return null;
    const rising = rows.slice().sort((a,b) => Number(b.riseRate || 0) - Number(a.riseRate || 0))[0];
    const sinking = rows.slice().sort((a,b) => Number(b.sinkRate || 0) - Number(a.sinkRate || 0))[0];
    return {
      rising: { frameNo:Number(rising.frameNo), rate:Number(rising.riseRate || 0), starts:Number(rising.starts || 0) },
      sinking: { frameNo:Number(sinking.frameNo), rate:Number(sinking.sinkRate || 0), starts:Number(sinking.starts || 0) }
    };
  }

  function capture() {
    if (!report) return;
    const meta = selectedRaceMeta();
    if (!meta.raceKey) return;
    const venue = report?.byVenue?.[meta.jcd];
    const signals = selectSignals(venue);
    if (!signals) return;

    const rows = readStore();
    const existing = rows.find(item => item.raceKey === meta.raceKey);
    const snapshot = {
      ...(existing || {}),
      ...meta,
      sourceGeneratedAt: report.generatedAt || null,
      capturedAt: existing?.capturedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      signals,
      status: existing?.status || "pending"
    };
    const next = [snapshot, ...rows.filter(item => item.raceKey !== meta.raceKey)];
    writeStore(next);
    evaluate();
  }

  function resultRankMap(result) {
    const finishers = result?.finishers || result?.result?.finishers || [];
    const map = new Map();
    for (const item of finishers) {
      const boat = Number(item?.boat ?? item?.boatNo ?? item?.frameNo);
      const rank = Number(item?.rank ?? item?.finish ?? item?.order);
      if (boat >= 1 && boat <= 6 && rank >= 1 && rank <= 6) map.set(boat, rank);
    }
    if (map.size === 6) return map;

    const order = result?.order || result?.resultOrder || result?.result;
    if (Array.isArray(order)) {
      order.forEach((boat, index) => {
        const n = Number(boat);
        if (n >= 1 && n <= 6) map.set(n, index + 1);
      });
    }
    return map;
  }

  function evaluate() {
    const storage = window.ChappyStorage;
    if (!storage?.loadResults) return;
    const results = storage.loadResults();
    const byKey = new Map(results.map(result => [storage.buildRaceKey(result), result]));
    let changed = false;
    const rows = readStore().map(item => {
      if (!item?.raceKey || item.status === "evaluated") return item;
      const result = byKey.get(item.raceKey);
      if (!result) return item;
      const rankMap = resultRankMap(result);
      if (rankMap.size < 6) return item;
      const riseFrame = Number(item.signals?.rising?.frameNo);
      const sinkFrame = Number(item.signals?.sinking?.frameNo);
      const riseRank = rankMap.get(riseFrame);
      const sinkRank = rankMap.get(sinkFrame);
      changed = true;
      return {
        ...item,
        status: "evaluated",
        evaluatedAt: new Date().toISOString(),
        outcome: {
          riseRank,
          sinkRank,
          riseHit: Number.isFinite(riseRank) ? riseRank < riseFrame : false,
          sinkHit: Number.isFinite(sinkRank) ? sinkRank > sinkFrame : false
        }
      };
    });
    if (changed) writeStore(rows);
    renderReport(rows);
  }

  function percent(hit, total) {
    return total ? Number((hit * 100 / total).toFixed(1)) : 0;
  }

  function referenceGrade(rate, samples) {
    if (samples < 10) return { key:"collecting", label:"蓄積中" };
    if (rate >= 60) return { key:"high", label:"参考度 高" };
    if (rate >= 45) return { key:"medium", label:"参考度 中" };
    return { key:"low", label:"参考度 低" };
  }

  function aggregate(rows) {
    const evaluated = rows.filter(item => item.status === "evaluated" && item.outcome);
    const riseHits = evaluated.filter(item => item.outcome.riseHit).length;
    const sinkHits = evaluated.filter(item => item.outcome.sinkHit).length;
    const combinedHits = evaluated.filter(item => item.outcome.riseHit && item.outcome.sinkHit).length;
    const byVenue = {};
    const byFrame = {};

    for (const item of evaluated) {
      const venue = byVenue[item.jcd] ||= { place:item.place, samples:0, riseHits:0, sinkHits:0 };
      venue.samples += 1;
      venue.riseHits += item.outcome.riseHit ? 1 : 0;
      venue.sinkHits += item.outcome.sinkHit ? 1 : 0;

      const riseKey = `rise-${item.signals.rising.frameNo}`;
      const sinkKey = `sink-${item.signals.sinking.frameNo}`;
      const rise = byFrame[riseKey] ||= { type:"rise", frameNo:item.signals.rising.frameNo, samples:0, hits:0 };
      const sink = byFrame[sinkKey] ||= { type:"sink", frameNo:item.signals.sinking.frameNo, samples:0, hits:0 };
      rise.samples += 1; rise.hits += item.outcome.riseHit ? 1 : 0;
      sink.samples += 1; sink.hits += item.outcome.sinkHit ? 1 : 0;
    }

    return {
      samples:evaluated.length,
      riseRate:percent(riseHits, evaluated.length),
      sinkRate:percent(sinkHits, evaluated.length),
      combinedRate:percent(combinedHits, evaluated.length),
      byVenue,
      byFrame
    };
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameValidationReport");
    if (holder) return holder;
    const anchor = document.getElementById("frameRiseSinkReport") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameValidationReport";
    holder.className = "venue-frame-validation-card";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function renderReport(rows) {
    const holder = ensureHolder();
    if (!holder) return;
    const summary = aggregate(rows);
    const overallRate = summary.samples ? Number(((summary.riseRate + summary.sinkRate) / 2).toFixed(1)) : 0;
    const grade = referenceGrade(overallRate, summary.samples);
    const venueRows = Object.entries(summary.byVenue)
      .map(([jcd, value]) => ({ jcd, ...value, rate:Number(((percent(value.riseHits,value.samples)+percent(value.sinkHits,value.samples))/2).toFixed(1)) }))
      .sort((a,b) => b.samples - a.samples)
      .slice(0, 8);

    holder.innerHTML = `
      <h3>🧪 場別枠傾向の検証</h3>
      <p>予想時点の上がりやすい枠・沈みやすい枠を結果と自動照合します。</p>
      <div class="venue-frame-validation-summary">
        <span>照合 ${summary.samples}レース</span>
        <span>浮上判定 ${summary.riseRate}%</span>
        <span>沈下判定 ${summary.sinkRate}%</span>
        <strong class="grade-${grade.key}">${grade.label}</strong>
      </div>
      ${venueRows.length ? `
        <div class="venue-frame-validation-list">
          ${venueRows.map(row => {
            const rowGrade = referenceGrade(row.rate, row.samples);
            return `<span><b>${row.place || row.jcd}</b><small>${row.samples}件・精度 ${row.rate}%・${rowGrade.label}</small></span>`;
          }).join("")}
        </div>
      ` : `<small>予想と結果が蓄積されると、場別・枠別の精度を表示します。</small>`}
      <p class="venue-frame-validation-note">参考度が低い傾向は表示上で格下げします。予想ロジック・印・配点・買い目には自動反映しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-validation-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-validation-style";
    style.textContent = `
      .venue-frame-validation-card{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-validation-card h3{margin:0 0 5px;font-size:17px}.venue-frame-validation-card>p{margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.6}
      .venue-frame-validation-summary{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.venue-frame-validation-summary span,.venue-frame-validation-summary strong{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .venue-frame-validation-summary .grade-high{background:#e8f7ee}.venue-frame-validation-summary .grade-medium{background:#fff7dd}.venue-frame-validation-summary .grade-low{background:#fff0f0}
      .venue-frame-validation-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.venue-frame-validation-list span{padding:8px;border:1px solid #e2e8f0;border-radius:11px}.venue-frame-validation-list b,.venue-frame-validation-list small{display:block}.venue-frame-validation-list small{margin-top:3px;color:#64748b}
      .venue-frame-validation-note{margin-top:10px!important}@media(max-width:640px){.venue-frame-validation-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function install() {
    ensureStyle();
    try {
      const response = await fetch(`${REPORT_URL}?v=${Date.now()}`, { cache:"no-store" });
      if (!response.ok) throw new Error(`場別枠統計を取得できません (${response.status})`);
      report = await response.json();
      evaluate();
      document.getElementById("fetchRaceBtn")?.addEventListener("click", () => setTimeout(capture, 2500));
      document.getElementById("placeSelect")?.addEventListener("change", evaluate);
      window.addEventListener("storage", evaluate);
      setInterval(evaluate, 60000);
    } catch (error) {
      console.warn("[venue-frame-validation]", error);
    }
  }

  window.ChappyVenueFrameValidation = { capture, evaluate, aggregate, referenceGrade };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
