// js/hiyori-learning-adoption-candidates.js
// 相関信頼度から採用候補・保留・除外を自動分類する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const CONFIDENCE_KEY = "chappy_hiyori_correlation_confidence_v1";
  const SNAPSHOT_KEY = "chappy_hiyori_learning_snapshots_v1";
  const ADOPTION_KEY = "chappy_hiyori_learning_adoption_candidates_v1";

  function read(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function daysAgo(dateString) {
    const time = Date.parse(dateString || "");
    return Number.isFinite(time) ? (Date.now() - time) / 86400000 : Infinity;
  }

  function metricKey(row) {
    return `${row?.group || "-"}::${row?.label || "-"}`;
  }

  function recentSampleCount(group, label, snapshots) {
    const cutoff = Date.now() - 30 * 86400000;
    return snapshots.filter(row => {
      const time = Date.parse(row?.matchedAt || row?.capturedAt || "");
      return Number.isFinite(time) && time >= cutoff && row?.status === "matched";
    }).length;
  }

  function classify(row, recentCount) {
    const score = Number(row?.reliabilityScore || 0);
    const samples = Number(row?.samples || 0);
    const level = row?.confidence?.code || "reference";
    const top3 = Number(row?.adjusted?.top3Rate || 0);
    const top2 = Number(row?.adjusted?.top2Rate || 0);

    if (samples >= 120 && score >= 72 && top3 >= 45 && top2 >= 25) {
      return {
        code: "candidate",
        label: "採用候補",
        reason: `十分なサンプル（${samples}艇）と信頼度${score}点を確認。補正後3連対率${top3}%で継続観察に値します。`
      };
    }

    if ((level === "strong" || level === "enough") && score >= 58 && samples >= 60) {
      return {
        code: "hold",
        label: "保留",
        reason: `傾向は見えていますが、採用基準には未達です。サンプル${samples}艇・信頼度${score}点のため追加蓄積します。`
      };
    }

    if (samples < 20) {
      return {
        code: "hold",
        label: "保留",
        reason: `サンプル${samples}艇で不足しています。少数データの高率を採用しません。`
      };
    }

    if (score < 40 || top3 < 25) {
      return {
        code: "exclude",
        label: "除外",
        reason: `信頼度${score}点、補正後3連対率${top3}%で採用価値が低いため除外します。`
      };
    }

    return {
      code: "hold",
      label: "保留",
      reason: `現時点では判定材料が不足しています。サンプル${samples}艇・直近30日照合${recentCount}Rを継続確認します。`
    };
  }

  function build() {
    const confidence = read(CONFIDENCE_KEY, null);
    if (!confidence || !Array.isArray(confidence.rows)) return null;
    const snapshots = Array.isArray(read(SNAPSHOT_KEY, [])) ? read(SNAPSHOT_KEY, []) : [];

    const rows = confidence.rows.map(row => {
      const recentCount = recentSampleCount(row.group, row.label, snapshots);
      const decision = classify(row, recentCount);
      return {
        id: metricKey(row),
        group: row.group,
        label: row.label,
        samples: Number(row.samples || 0),
        reliabilityScore: Number(row.reliabilityScore || 0),
        confidenceLabel: row?.confidence?.label || "参考",
        adjusted: row.adjusted || {},
        recent30MatchedRaces: recentCount,
        lastUpdatedAt: confidence.createdAt || new Date().toISOString(),
        status: decision.code,
        statusLabel: decision.label,
        reason: decision.reason
      };
    });

    const result = {
      createdAt: new Date().toISOString(),
      summary: {
        candidate: rows.filter(row => row.status === "candidate").length,
        hold: rows.filter(row => row.status === "hold").length,
        exclude: rows.filter(row => row.status === "exclude").length
      },
      rows: rows.sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    };

    localStorage.setItem(ADOPTION_KEY, JSON.stringify(result));
    render(result);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-learning-adoption-updated", { detail: result }));
    return result;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriLearningAdoptionCandidates");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriCorrelationConfidence") || document.getElementById("hiyoriLearningCorrelation") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriLearningAdoptionCandidates";
    holder.className = "hiyori-learning-adoption";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(result = read(ADOPTION_KEY, null)) {
    const holder = ensureHolder();
    if (!holder || !result) return;
    holder.innerHTML = `
      <div class="hla-head">
        <div><h3>✅ 学習データ採用候補</h3><p>分析結果を採用候補・保留・除外へ自動分類します。</p></div>
        <strong>候補 ${result.summary.candidate}／保留 ${result.summary.hold}／除外 ${result.summary.exclude}</strong>
      </div>
      <div class="hla-list">
        ${result.rows.map(row => `
          <article class="hla-row status-${row.status}">
            <div class="hla-title"><b>${row.group}｜${row.label}</b><span>${row.statusLabel}</span></div>
            <div class="hla-meta"><span>${row.samples}艇</span><span>信頼度 ${row.reliabilityScore}点</span><span>${row.confidenceLabel}</span><span>直近30日 ${row.recent30MatchedRaces}R</span></div>
            <p>${row.reason}</p>
            <small>補正後：1着 ${row.adjusted.winRate || 0}%／2連対 ${row.adjusted.top2Rate || 0}%／3連対 ${row.adjusted.top3Rate || 0}%</small>
          </article>`).join("")}
      </div>
      <p class="hla-note">候補判定は提案材料のみです。予想への反映には、あっくんの承認が必要です。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-learning-adoption-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-learning-adoption-style";
    style.textContent = `.hiyori-learning-adoption{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hla-head{display:flex;justify-content:space-between;gap:12px}.hla-head h3{margin:0 0 4px;font-size:17px}.hla-head p{margin:0;color:#64748b;font-size:12px}.hla-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#f1f5f9;font-size:12px}.hla-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.hla-row{padding:11px;border:1px solid #e2e8f0;border-radius:12px}.hla-title{display:flex;justify-content:space-between;gap:8px}.hla-title span{font-size:11px;font-weight:700}.hla-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.hla-meta span{font-size:10px;padding:3px 6px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0}.hla-row p{margin:8px 0 4px;font-size:11px;line-height:1.6}.hla-row small{color:#64748b;font-size:10px}.status-candidate{background:#f0fdf4}.status-hold{background:#fffbeb}.status-exclude{background:#f8fafc}.hla-note{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hla-list{grid-template-columns:1fr}.hla-head{display:block}.hla-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    window.addEventListener("chappy:hiyori-correlation-confidence-updated", build);
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriLearningAdoptionCandidates = { build, render, classify };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();