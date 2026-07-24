// js/venue-frame-comment-audit.js
// 展開コメントへ表示した場別枠傾向を保存し、結果と照合して効果を確認する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const VALIDATION_KEY = "chappy_venue_frame_validation_v1";
  const AUDIT_KEY = "chappy_venue_frame_comment_audit_v1";
  const PLACE_TO_JCD = {
    桐生:"01",戸田:"02",江戸川:"03",平和島:"04",多摩川:"05",浜名湖:"06",
    蒲郡:"07",常滑:"08",津:"09",三国:"10",びわこ:"11",住之江:"12",
    尼崎:"13",鳴門:"14",丸亀:"15",児島:"16",宮島:"17",徳山:"18",
    下関:"19",若松:"20",芦屋:"21",福岡:"22",唐津:"23",大村:"24"
  };

  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function write(rows) {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(rows.slice(0, 1000)));
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function raceMeta() {
    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    const jcd = PLACE_TO_JCD[place] || "";
    const raceNo = Number(String(document.getElementById("raceSelect")?.value || "").replace(/\D/g, ""));
    const date = normalizeDate(document.getElementById("dateInput")?.value);
    return {
      place,
      jcd,
      raceNo,
      date,
      raceKey: date && jcd && raceNo ? `${date}-${jcd}-${raceNo}` : ""
    };
  }

  function aggregateCandidates(rows) {
    const map = new Map();
    rows.filter(row => row?.status === "evaluated" && row?.outcome).forEach(row => {
      [
        { type:"rise", frameNo:Number(row.signals?.rising?.frameNo), hit:!!row.outcome.riseHit },
        { type:"sink", frameNo:Number(row.signals?.sinking?.frameNo), hit:!!row.outcome.sinkHit }
      ].forEach(signal => {
        if (!(signal.frameNo >= 1 && signal.frameNo <= 6)) return;
        const key = `${row.jcd}-${signal.type}-${signal.frameNo}`;
        const item = map.get(key) || { jcd:row.jcd, place:row.place || row.jcd, type:signal.type, frameNo:signal.frameNo, samples:0, hits:0 };
        item.samples += 1;
        item.hits += signal.hit ? 1 : 0;
        map.set(key, item);
      });
    });
    return Array.from(map.values()).map(item => ({
      ...item,
      rate: item.samples ? Number((item.hits * 100 / item.samples).toFixed(1)) : 0
    })).filter(item => item.samples >= 10 && item.rate >= 60);
  }

  function capture() {
    const meta = raceMeta();
    if (!meta.raceKey) return;
    const candidates = aggregateCandidates(read(VALIDATION_KEY)).filter(item => item.jcd === meta.jcd);
    if (!candidates.length) return;

    const rows = read(AUDIT_KEY);
    const existing = rows.find(row => row.raceKey === meta.raceKey);
    const snapshot = {
      ...(existing || {}),
      ...meta,
      displayedAt: existing?.displayedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: existing?.status || "pending",
      signals: candidates.map(item => ({
        type:item.type,
        frameNo:item.frameNo,
        validationSamples:item.samples,
        validationRate:item.rate
      }))
    };
    write([snapshot, ...rows.filter(row => row.raceKey !== meta.raceKey)]);
    evaluate();
  }

  function rankMap(result) {
    const finishers = result?.finishers || result?.result?.finishers || [];
    const map = new Map();
    finishers.forEach(item => {
      const boat = Number(item?.boat ?? item?.boatNo ?? item?.frameNo);
      const rank = Number(item?.rank ?? item?.finish ?? item?.order);
      if (boat >= 1 && boat <= 6 && rank >= 1 && rank <= 6) map.set(boat, rank);
    });
    if (map.size === 6) return map;
    const order = result?.order || result?.resultOrder || result?.result;
    if (Array.isArray(order)) order.forEach((boat, index) => {
      const n = Number(boat);
      if (n >= 1 && n <= 6) map.set(n, index + 1);
    });
    return map;
  }

  function evaluate() {
    const storage = window.ChappyStorage;
    if (!storage?.loadResults || !storage?.buildRaceKey) return render();
    const results = new Map(storage.loadResults().map(result => [storage.buildRaceKey(result), result]));
    let changed = false;
    const rows = read(AUDIT_KEY).map(row => {
      if (row.status === "evaluated" || !row.raceKey) return row;
      const result = results.get(row.raceKey);
      if (!result) return row;
      const ranks = rankMap(result);
      if (ranks.size < 6) return row;
      changed = true;
      return {
        ...row,
        status:"evaluated",
        evaluatedAt:new Date().toISOString(),
        outcomes:(row.signals || []).map(signal => {
          const rank = ranks.get(Number(signal.frameNo));
          const hit = signal.type === "rise" ? rank < Number(signal.frameNo) : rank > Number(signal.frameNo);
          return { ...signal, rank, hit };
        })
      };
    });
    if (changed) write(rows);
    render(rows);
  }

  function summarize(rows) {
    const evaluated = rows.filter(row => row.status === "evaluated" && Array.isArray(row.outcomes));
    const outcomes = evaluated.flatMap(row => row.outcomes);
    const hits = outcomes.filter(item => item.hit).length;
    return {
      races:evaluated.length,
      signals:outcomes.length,
      hits,
      rate:outcomes.length ? Number((hits * 100 / outcomes.length).toFixed(1)) : 0,
      recent:evaluated.slice(0, 8)
    };
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameCommentAudit");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameAdoptionCandidates") || document.getElementById("venueFrameValidationReport") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameCommentAudit";
    holder.className = "venue-frame-comment-audit";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(inputRows) {
    const holder = ensureHolder();
    if (!holder) return;
    const summary = summarize(inputRows || read(AUDIT_KEY));
    holder.innerHTML = `
      <h3>📝 展開コメント連携の結果</h3>
      <p>実際に表示した採用候補コメントだけを結果と照合します。</p>
      <div class="venue-frame-comment-audit-summary">
        <span>照合 ${summary.races}レース</span>
        <span>判定 ${summary.signals}件</span>
        <strong>的中 ${summary.rate}%</strong>
      </div>
      ${summary.recent.length ? `<div class="venue-frame-comment-audit-list">${summary.recent.map(row => `
        <div><b>${row.place} ${row.raceNo}R</b><small>${(row.outcomes || []).map(item => `${item.type === "rise" ? "浮上" : "沈下"}${item.frameNo}枠:${item.hit ? "○" : "×"}`).join("・")}</small></div>
      `).join("")}</div>` : `<small>採用候補コメントと結果が蓄積されると表示します。</small>`}
      <p class="venue-frame-comment-audit-note">この結果はコメント品質の検証専用です。印・配点・買い目には反映しません。</p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-comment-audit-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-comment-audit-style";
    style.textContent = `
      .venue-frame-comment-audit{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-comment-audit h3{margin:0 0 5px;font-size:17px}.venue-frame-comment-audit>p{margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.6}
      .venue-frame-comment-audit-summary{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}.venue-frame-comment-audit-summary span,.venue-frame-comment-audit-summary strong{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .venue-frame-comment-audit-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.venue-frame-comment-audit-list div{padding:8px;border:1px solid #e2e8f0;border-radius:11px}.venue-frame-comment-audit-list b,.venue-frame-comment-audit-list small{display:block}.venue-frame-comment-audit-list small{margin-top:3px;color:#64748b}
      .venue-frame-comment-audit-note{margin-top:10px!important}@media(max-width:640px){.venue-frame-comment-audit-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    evaluate();
    document.getElementById("fetchRaceBtn")?.addEventListener("click", () => setTimeout(capture, 3000));
    document.getElementById("placeSelect")?.addEventListener("change", render);
    window.addEventListener("storage", evaluate);
    setInterval(evaluate, 60000);
  }

  window.ChappyVenueFrameCommentAudit = { capture, evaluate, summarize, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
