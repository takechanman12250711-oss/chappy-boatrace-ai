// js/hiyori-learning-correlation.js
// 日和互換スナップショットと結果から、展示・一周・合成オッズ・気象・新エンジン別の相関を集計する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_hiyori_learning_snapshots_v1";
  const ANALYSIS_KEY = "chappy_hiyori_learning_correlation_v1";

  function read(key, fallback = []) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function pct(part, total) {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
  }

  function numeric(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function finishOrder(result) {
    const source = result?.order || result?.finishOrder || result?.resultOrder || result?.boats || result?.ranking;
    if (Array.isArray(source)) {
      return source.map(item => Number(item?.boatNo ?? item?.frameNo ?? item?.number ?? item)).filter(n => n >= 1 && n <= 6).slice(0, 6);
    }
    const trifecta = String(result?.trifecta || result?.sanrentan || result?.result || "").match(/[1-6]/g);
    return trifecta ? trifecta.map(Number).slice(0, 3) : [];
  }

  function rankArray(values, lowerIsBetter = true) {
    const parsed = (Array.isArray(values) ? values : []).map((value, index) => ({ boatNo: index + 1, value: numeric(value) })).filter(row => row.value !== null);
    parsed.sort((a, b) => lowerIsBetter ? a.value - b.value : b.value - a.value);
    const ranks = {};
    parsed.forEach((row, index) => { ranks[row.boatNo] = index + 1; });
    return ranks;
  }

  function emptyBucket(label) {
    return { label, samples: 0, wins: 0, top2: 0, top3: 0, winRate: 0, top2Rate: 0, top3Rate: 0 };
  }

  function finalize(bucket) {
    bucket.winRate = pct(bucket.wins, bucket.samples);
    bucket.top2Rate = pct(bucket.top2, bucket.samples);
    bucket.top3Rate = pct(bucket.top3, bucket.samples);
    return bucket;
  }

  function addBoat(bucket, boatNo, order) {
    const finish = order.indexOf(boatNo) + 1;
    if (!finish) return;
    bucket.samples += 1;
    if (finish === 1) bucket.wins += 1;
    if (finish <= 2) bucket.top2 += 1;
    if (finish <= 3) bucket.top3 += 1;
  }

  function analyzeRankMetric(rows, field, lowerIsBetter = true) {
    const buckets = Array.from({ length: 6 }, (_, i) => emptyBucket(`${i + 1}位`));
    rows.forEach(row => {
      const order = finishOrder(row.result);
      if (!order.length) return;
      const ranks = rankArray(row[field], lowerIsBetter);
      Object.entries(ranks).forEach(([boatNo, rank]) => addBoat(buckets[rank - 1], Number(boatNo), order));
    });
    return buckets.map(finalize);
  }

  function analyzeBoolean(rows, field, labels) {
    const buckets = [emptyBucket(labels[0]), emptyBucket(labels[1])];
    rows.forEach(row => {
      const order = finishOrder(row.result);
      if (!order.length) return;
      const bucket = buckets[row[field] ? 1 : 0];
      for (let boatNo = 1; boatNo <= 6; boatNo += 1) addBoat(bucket, boatNo, order);
    });
    return buckets.map(finalize);
  }

  function weatherBand(row) {
    const wind = Number(row?.weather?.windSpeed || 0);
    const wave = Number(row?.weather?.waveHeight || 0);
    if (wind >= 6 || wave >= 6) return "強風・高波";
    if (wind >= 3 || wave >= 3) return "中程度";
    return "穏やか";
  }

  function analyzeWeather(rows) {
    const map = new Map(["穏やか", "中程度", "強風・高波"].map(label => [label, emptyBucket(label)]));
    rows.forEach(row => {
      const order = finishOrder(row.result);
      if (!order.length) return;
      const bucket = map.get(weatherBand(row));
      for (let boatNo = 1; boatNo <= 6; boatNo += 1) addBoat(bucket, boatNo, order);
    });
    return [...map.values()].map(finalize);
  }

  function build() {
    const all = Array.isArray(read(STORAGE_KEY, [])) ? read(STORAGE_KEY, []) : [];
    const rows = all.filter(row => row?.status === "matched" && row?.result && finishOrder(row.result).length);
    const analysis = {
      createdAt: new Date().toISOString(),
      matchedRaces: rows.length,
      exhibition: analyzeRankMetric(rows, "exhibition", true),
      lapTimes: analyzeRankMetric(rows, "lapTimes", true),
      combinedOdds: analyzeRankMetric(rows, "combinedOdds", true),
      startExhibition: analyzeRankMetric(rows, "startExhibition", true),
      weather: analyzeWeather(rows),
      newEngine: analyzeBoolean(rows, "isNewEngine", ["通常エンジン", "新エンジン"]),
      newFuel: analyzeBoolean(rows, "isNewFuel", ["通常燃料", "新燃料"])
    };
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analysis));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-learning-correlation-updated", { detail: analysis }));
    render(analysis);
    return analysis;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriLearningCorrelation");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriLearningDashboard") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriLearningCorrelation";
    holder.className = "hiyori-learning-correlation";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function metricTable(title, rows) {
    return `<div class="hlc-card"><h4>${title}</h4><div class="hlc-table">${rows.map(row => `<div class="hlc-row"><b>${row.label}</b><span>${row.samples}艇</span><span>1着 ${row.winRate}%</span><span>2連対 ${row.top2Rate}%</span><span>3連対 ${row.top3Rate}%</span></div>`).join("")}</div></div>`;
  }

  function render(analysis = read(ANALYSIS_KEY, null)) {
    const holder = ensureHolder();
    if (!holder || !analysis) return;
    holder.innerHTML = `
      <div class="hlc-head"><div><h3>📊 日和データ結果相関</h3><p>保存データが結果へどの程度結び付いたかを集計します。</p></div><strong>${analysis.matchedRaces}R照合</strong></div>
      <div class="hlc-grid">
        ${metricTable("展示順位", analysis.exhibition)}
        ${metricTable("一周順位", analysis.lapTimes)}
        ${metricTable("合成オッズ順位", analysis.combinedOdds)}
        ${metricTable("ST展示順位", analysis.startExhibition)}
        ${metricTable("気象・水面", analysis.weather)}
        ${metricTable("新エンジン", analysis.newEngine)}
        ${metricTable("新燃料", analysis.newFuel)}
      </div>
      <p class="hlc-note">分析・観察専用です。予想ロジックへの自動反映はしません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-learning-correlation-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-learning-correlation-style";
    style.textContent = `.hiyori-learning-correlation{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hlc-head{display:flex;justify-content:space-between;gap:12px}.hlc-head h3{margin:0 0 4px;font-size:17px}.hlc-head p{margin:0;color:#64748b;font-size:12px}.hlc-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#eef2ff;font-size:12px}.hlc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.hlc-card{padding:10px;border:1px solid #e2e8f0;border-radius:12px}.hlc-card h4{margin:0 0 7px;font-size:13px}.hlc-table{display:grid;gap:5px}.hlc-row{display:grid;grid-template-columns:1.2fr .7fr repeat(3,1fr);gap:5px;align-items:center;font-size:11px}.hlc-row b{font-size:11px}.hlc-note{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hlc-grid{grid-template-columns:1fr}.hlc-row{grid-template-columns:1fr 1fr}.hlc-row span:nth-child(n+3){font-size:10px}.hlc-head{display:block}.hlc-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    ["chappy:hiyori-learning-snapshot-saved", "chappy:hiyori-learning-result-matched"].forEach(name => window.addEventListener(name, build));
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriLearningCorrelation = { build, render, finishOrder, rankArray };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();