// js/hiyori-adoption-proposals.js
// 採用候補から変更提案書を生成する。承認前は予想ロジックへ一切反映しない。
(function () {
  "use strict";

  const SOURCE_KEYS = [
    "chappy_hiyori_adoption_candidates_v1",
    "chappy_hiyori_learning_adoption_candidates_v1",
    "chappy_hiyori_correlation_confidence_v1"
  ];
  const PROPOSAL_KEY = "chappy_hiyori_adoption_proposals_v1";

  function read(key, fallback = null) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function sourceData() {
    for (const key of SOURCE_KEYS) {
      const value = read(key, null);
      if (value) return value;
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function targetFor(group) {
    if (/展示|一周/.test(group)) return "展示・足の補正候補";
    if (/ST/.test(group)) return "ST・スリットの補正候補";
    if (/気象|水面/.test(group)) return "当地・水面の補正候補";
    if (/エンジン|燃料/.test(group)) return "モーター評価の補助候補";
    if (/オッズ/.test(group)) return "表示・分類専用候補";
    return "参考情報候補";
  }

  function maxImpact(group, score) {
    if (/オッズ/.test(group)) return 0;
    if (/エンジン|燃料/.test(group)) return score >= 85 ? 2 : 1;
    if (/気象|水面/.test(group)) return score >= 85 ? 3 : 2;
    return score >= 90 ? 4 : score >= 80 ? 3 : 2;
  }

  function normalizeRows(source) {
    const rows = Array.isArray(source?.rows) ? source.rows :
      Array.isArray(source?.candidates) ? source.candidates :
      Array.isArray(source) ? source : [];

    return rows.map((row, index) => {
      const status = row?.status || row?.decision || row?.category || "";
      const candidate = status === "candidate" || status === "採用候補" || row?.isCandidate === true;
      const score = clamp(row?.reliabilityScore ?? row?.learningValueScore ?? row?.score, 0, 100);
      const group = row?.group || row?.metric || row?.categoryName || "未分類";
      const label = row?.label || row?.name || `候補${index + 1}`;
      const samples = Number(row?.samples || 0);
      const adjusted = row?.adjusted || {};
      return {
        id: row?.id || `${group}:${label}`,
        group,
        label,
        candidate,
        score,
        samples,
        adjusted,
        target: targetFor(group),
        maxImpact: maxImpact(group, score)
      };
    });
  }

  function buildProposal(row) {
    const disabledReasons = [];
    if (row.samples < 120) disabledReasons.push("サンプル120艇未満");
    if (row.score < 72) disabledReasons.push("信頼度72点未満");
    if (/オッズ/.test(row.group)) disabledReasons.push("オッズは予想生成へ使わず表示・分類専用");

    const proposed = row.candidate && disabledReasons.length === 0;
    return {
      id: row.id,
      group: row.group,
      label: row.label,
      createdAt: new Date().toISOString(),
      status: proposed ? "proposal_ready" : "hold",
      target: row.target,
      proposedImpact: proposed ? row.maxImpact : 0,
      maxImpact: row.maxImpact,
      samples: row.samples,
      reliabilityScore: row.score,
      adjusted: row.adjusted,
      safeguards: [
        "展開→コース→ST→展示→残し→当地→技量→モーターの優先順位を変更しない",
        "買い目を数字だけで追加・削除しない",
        "1項目あたりの補正は上限内に制限する",
        "新エンジン期はモーター数字を過信しない",
        "承認されるまで有効化しない"
      ],
      disabledReasons,
      approved: false,
      enabled: false
    };
  }

  function build() {
    const source = sourceData();
    if (!source) return null;
    const proposals = normalizeRows(source).map(buildProposal);
    const result = {
      createdAt: new Date().toISOString(),
      summary: {
        ready: proposals.filter(p => p.status === "proposal_ready").length,
        hold: proposals.filter(p => p.status === "hold").length,
        enabled: 0
      },
      proposals
    };
    localStorage.setItem(PROPOSAL_KEY, JSON.stringify(result));
    render(result);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-adoption-proposals-updated", { detail: result }));
    return result;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriAdoptionProposals");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriAdoptionCandidates") ||
      document.getElementById("hiyoriCorrelationConfidence") ||
      document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriAdoptionProposals";
    holder.className = "hiyori-adoption-proposals";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(result = read(PROPOSAL_KEY, null)) {
    const holder = ensureHolder();
    if (!holder || !result) return;
    const rows = (result.proposals || []).slice(0, 20);
    holder.innerHTML = `
      <div class="hap-head"><div><h3>📝 採用候補・変更提案書</h3><p>予想へ反映する場合の影響範囲と安全上限だけを提示します。</p></div><strong>反映中 0件</strong></div>
      <div class="hap-summary"><span>提案可能 ${result.summary.ready}</span><span>保留 ${result.summary.hold}</span><span>未承認 ${result.proposals.length}</span></div>
      <div class="hap-list">${rows.map(row => `
        <article class="hap-row status-${row.status}">
          <div class="hap-title"><b>${row.group}｜${row.label}</b><span>${row.status === "proposal_ready" ? "提案可能" : "保留"}</span></div>
          <small>${row.samples}艇・信頼度 ${row.reliabilityScore}点</small>
          <p>対象：${row.target}</p>
          <p>補正案：${row.proposedImpact === 0 ? "予想値への加点なし" : `最大±${row.proposedImpact}点以内`}</p>
          ${row.disabledReasons.length ? `<p class="hap-reason">保留理由：${row.disabledReasons.join("／")}</p>` : ""}
          <p class="hap-lock">🔒 未承認・無効</p>
        </article>`).join("")}</div>
      <p class="hap-note">この画面は提案書のみです。承認操作・予想反映機能は実装していません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-adoption-proposals-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-adoption-proposals-style";
    style.textContent = `.hiyori-adoption-proposals{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hap-head{display:flex;justify-content:space-between;gap:12px}.hap-head h3{margin:0 0 4px;font-size:17px}.hap-head p{margin:0;color:#64748b;font-size:12px}.hap-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#fff7ed;font-size:12px}.hap-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.hap-summary span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px}.hap-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hap-row{padding:11px;border:1px solid #e2e8f0;border-radius:12px}.hap-title{display:flex;justify-content:space-between;gap:8px}.hap-title span{font-size:11px;font-weight:700}.hap-row small,.hap-row p{margin:5px 0 0;font-size:11px}.hap-row small,.hap-reason{color:#64748b}.hap-lock{font-weight:700;color:#b45309}.status-proposal_ready{background:#f0fdf4}.status-hold{background:#f8fafc}.hap-note{margin:10px 0 0;color:#64748b;font-size:11px}@media(max-width:720px){.hap-list{grid-template-columns:1fr}.hap-head{display:block}.hap-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    ["chappy:hiyori-adoption-candidates-updated", "chappy:hiyori-correlation-confidence-updated"].forEach(name => window.addEventListener(name, build));
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriAdoptionProposals = { build, render, buildProposal, normalizeRows };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
