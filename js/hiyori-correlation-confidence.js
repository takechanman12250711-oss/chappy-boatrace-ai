// js/hiyori-correlation-confidence.js
// 日和データ相関をサンプル数と率の安定性で評価し、少数データの過大評価を防ぐ。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const ANALYSIS_KEY = "chappy_hiyori_learning_correlation_v1";
  const CONFIDENCE_KEY = "chappy_hiyori_correlation_confidence_v1";

  function read(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function confidenceLevel(samples) {
    if (samples >= 120) return { code: "enough", label: "十分", score: 100 };
    if (samples >= 60) return { code: "strong", label: "有力", score: 75 };
    if (samples >= 20) return { code: "watching", label: "観察中", score: 50 };
    return { code: "reference", label: "参考", score: 25 };
  }

  function conservativeRate(rate, samples) {
    const n = Number(samples || 0);
    const p = clamp(Number(rate || 0), 0, 100) / 100;
    if (!n) return 0;
    const z = 1.96;
    const denominator = 1 + (z * z) / n;
    const center = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return Math.round(((center - margin) / denominator) * 1000) / 10;
  }

  function gradeRow(group, row) {
    const level = confidenceLevel(Number(row?.samples || 0));
    const adjustedWinRate = conservativeRate(row?.winRate, row?.samples);
    const adjustedTop2Rate = conservativeRate(row?.top2Rate, row?.samples);
    const adjustedTop3Rate = conservativeRate(row?.top3Rate, row?.samples);
    const reliabilityScore = Math.round(
      level.score * 0.55 +
      clamp(adjustedTop3Rate, 0, 100) * 0.25 +
      clamp(adjustedTop2Rate, 0, 100) * 0.15 +
      clamp(adjustedWinRate, 0, 100) * 0.05
    );

    return {
      group,
      label: row?.label || "-",
      samples: Number(row?.samples || 0),
      raw: {
        winRate: Number(row?.winRate || 0),
        top2Rate: Number(row?.top2Rate || 0),
        top3Rate: Number(row?.top3Rate || 0)
      },
      adjusted: {
        winRate: adjustedWinRate,
        top2Rate: adjustedTop2Rate,
        top3Rate: adjustedTop3Rate
      },
      confidence: level,
      reliabilityScore
    };
  }

  function build() {
    const analysis = read(ANALYSIS_KEY, null);
    if (!analysis) return null;

    const groups = [
      ["展示順位", analysis.exhibition],
      ["一周順位", analysis.lapTimes],
      ["合成オッズ順位", analysis.combinedOdds],
      ["ST展示順位", analysis.startExhibition],
      ["気象・水面", analysis.weather],
      ["新エンジン", analysis.newEngine],
      ["新燃料", analysis.newFuel]
    ];

    const rows = groups.flatMap(([group, values]) =>
      (Array.isArray(values) ? values : []).map(row => gradeRow(group, row))
    );

    const summary = {
      reference: rows.filter(row => row.confidence.code === "reference").length,
      watching: rows.filter(row => row.confidence.code === "watching").length,
      strong: rows.filter(row => row.confidence.code === "strong").length,
      enough: rows.filter(row => row.confidence.code === "enough").length
    };

    const result = {
      createdAt: new Date().toISOString(),
      matchedRaces: Number(analysis.matchedRaces || 0),
      summary,
      rows: rows.sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    };

    localStorage.setItem(CONFIDENCE_KEY, JSON.stringify(result));
    render(result);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-correlation-confidence-updated", { detail: result }));
    return result;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriCorrelationConfidence");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriLearningCorrelation") ||
      document.getElementById("hiyoriLearningDashboard") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriCorrelationConfidence";
    holder.className = "hiyori-correlation-confidence";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(result = read(CONFIDENCE_KEY, null)) {
    const holder = ensureHolder();
    if (!holder || !result) return;
    const rows = Array.isArray(result.rows) ? result.rows : [];
    holder.innerHTML = `
      <div class="hcc-head">
        <div><h3>🧪 相関サンプル信頼度</h3><p>少数データの高率を過大評価しないため、率を保守補正して評価します。</p></div>
        <strong>${result.matchedRaces}R照合</strong>
      </div>
      <div class="hcc-summary">
        <span>参考 ${result.summary.reference}</span>
        <span>観察中 ${result.summary.watching}</span>
        <span>有力 ${result.summary.strong}</span>
        <span>十分 ${result.summary.enough}</span>
      </div>
      <div class="hcc-list">
        ${rows.slice(0, 20).map(row => `
          <div class="hcc-row level-${row.confidence.code}">
            <div><b>${row.group}｜${row.label}</b><small>${row.samples}艇・信頼度 ${row.reliabilityScore}点</small></div>
            <strong>${row.confidence.label}</strong>
            <small>補正後：1着 ${row.adjusted.winRate}%／2連対 ${row.adjusted.top2Rate}%／3連対 ${row.adjusted.top3Rate}%</small>
          </div>`).join("")}
      </div>
      <p class="hcc-note">観察専用です。「有力」「十分」でも予想へ自動反映しません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-correlation-confidence-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-correlation-confidence-style";
    style.textContent = `.hiyori-correlation-confidence{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hcc-head{display:flex;justify-content:space-between;gap:12px}.hcc-head h3{margin:0 0 4px;font-size:17px}.hcc-head p{margin:0;color:#64748b;font-size:12px}.hcc-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}.hcc-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.hcc-summary span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px}.hcc-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hcc-row{padding:10px;border:1px solid #e2e8f0;border-radius:12px}.hcc-row>div{display:flex;justify-content:space-between;gap:8px}.hcc-row b,.hcc-row small,.hcc-row strong{display:block}.hcc-row small{margin-top:4px;color:#64748b;font-size:11px}.hcc-row>strong{margin-top:6px;font-size:12px}.level-reference{background:#f8fafc}.level-watching{background:#fffbeb}.level-strong{background:#eff6ff}.level-enough{background:#f0fdf4}.hcc-note{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hcc-list{grid-template-columns:1fr}.hcc-head{display:block}.hcc-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    window.addEventListener("chappy:hiyori-learning-correlation-updated", build);
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriCorrelationConfidence = {
    build,
    render,
    confidenceLevel,
    conservativeRate,
    gradeRow
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();