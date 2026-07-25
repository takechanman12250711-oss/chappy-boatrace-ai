// js/hiyori-production-readiness-gate.js
// 相関信頼度・候補判定・承認・シャドー成績を統合し、本番反映前の最終可否を判定する。
// 実予想・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const CONFIDENCE_KEY = "chappy_hiyori_correlation_confidence_v1";
  const CANDIDATE_KEY = "chappy_hiyori_adoption_candidates_v1";
  const APPROVAL_KEY = "chappy_hiyori_proposal_approvals_v1";
  const PROPOSAL_KEY = "chappy_hiyori_change_proposals_v1";
  const SHADOW_GRADE_KEY = "chappy_hiyori_shadow_performance_v1";
  const OUTPUT_KEY = "chappy_hiyori_production_readiness_v1";

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function list(value) {
    return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.rows) ? value.rows : [];
  }

  function byId(rows) {
    return new Map(list(rows).map(row => [String(row?.proposalId || row?.id || ""), row]));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || 0)));
  }

  function classify(context) {
    const reasons = [];
    let score = 0;

    if (!context.proposal) reasons.push("変更提案が存在しません");
    else score += 10;

    if (!context.candidate || context.candidate.status !== "candidate") reasons.push("採用候補判定を満たしていません");
    else score += 15;

    const reliability = Number(context.confidence?.reliabilityScore || context.proposal?.reliabilityScore || 0);
    if (reliability < 72) reasons.push(`相関信頼度が不足しています（${reliability}点）`);
    else score += Math.min(20, Math.round((reliability - 60) / 2));

    const samples = Number(context.confidence?.samples || context.candidate?.samples || 0);
    if (samples < 120) reasons.push(`相関サンプル不足です（${samples}艇）`);
    else score += Math.min(15, Math.round(samples / 40));

    if (context.approval?.status !== "approved") reasons.push("変更提案が承認済みではありません");
    else score += 15;

    const shadow = context.shadow;
    const shadowSamples = Number(shadow?.samples || shadow?.evaluated || 0);
    const shadowStatus = String(shadow?.status || shadow?.grade || shadow?.decision || "");
    if (shadowSamples < 120) reasons.push(`シャドー検証が不足しています（${shadowSamples}件）`);
    else score += 10;

    if (!/採用検討|ready|adoption/i.test(shadowStatus)) reasons.push(`シャドー判定が採用検討ではありません（${shadowStatus || "未判定"}）`);
    else score += 15;

    const worsenedRate = Number(shadow?.worsenedRate || shadow?.worseRate || 0);
    if (worsenedRate >= 18) reasons.push(`悪化率が高すぎます（${worsenedRate}%）`);
    else score += 5;

    score = clamp(score, 0, 100);

    let status = "blocked";
    let label = "反映不可";
    if (reasons.length === 0 && score >= 85) {
      status = "final_approval";
      label = "最終承認待ち";
    } else if (score >= 55 && context.approval?.status === "approved") {
      status = "continue_validation";
      label = "継続検証";
    }

    return {
      status,
      label,
      readinessScore: score,
      reasons: reasons.length ? reasons : ["全条件を満たしました。最終承認が必要です。"],
      productionApplied: false,
      applicationLock: true,
      requiresExplicitFinalApproval: true
    };
  }

  function build() {
    const confidenceRows = list(read(CONFIDENCE_KEY, []));
    const candidateRows = list(read(CANDIDATE_KEY, []));
    const approvalRows = list(read(APPROVAL_KEY, []));
    const proposalRows = list(read(PROPOSAL_KEY, []));
    const shadowRows = list(read(SHADOW_GRADE_KEY, []));

    const confidenceMap = byId(confidenceRows);
    const candidateMap = byId(candidateRows);
    const approvalMap = byId(approvalRows);
    const shadowMap = byId(shadowRows);

    const items = proposalRows.map(proposal => {
      const id = String(proposal?.proposalId || proposal?.id || "");
      const context = {
        proposal,
        confidence: confidenceMap.get(id),
        candidate: candidateMap.get(id),
        approval: approvalMap.get(id),
        shadow: shadowMap.get(id)
      };
      return {
        id,
        proposalId: id,
        group: proposal?.group || proposal?.target || "-",
        label: proposal?.label || proposal?.condition || "-",
        target: proposal?.target || proposal?.applyTarget || "-",
        maxAdjustment: Number(proposal?.maxAdjustment ?? proposal?.limit ?? 0),
        ...classify(context)
      };
    }).sort((a, b) => b.readinessScore - a.readinessScore);

    const output = {
      createdAt: new Date().toISOString(),
      summary: {
        blocked: items.filter(row => row.status === "blocked").length,
        continueValidation: items.filter(row => row.status === "continue_validation").length,
        finalApproval: items.filter(row => row.status === "final_approval").length
      },
      items,
      globalProductionLock: true,
      appliedToPrediction: false
    };

    localStorage.setItem(OUTPUT_KEY, JSON.stringify(output));
    render(output);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-production-readiness-updated", { detail: output }));
    return output;
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriProductionReadiness");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriShadowPerformance") || document.getElementById("hiyoriProposalApproval") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriProductionReadiness";
    holder.className = "hiyori-production-readiness";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(output = read(OUTPUT_KEY, null)) {
    const holder = ensureHolder();
    if (!holder || !output) return;
    holder.innerHTML = `
      <div class="hpr-head">
        <div><h3>🔒 本番反映 最終判定ゲート</h3><p>相関・候補・承認・シャドー成績を統合して判定します。</p></div>
        <strong>本番ロック ON</strong>
      </div>
      <div class="hpr-summary">
        <span>反映不可 ${output.summary.blocked}</span>
        <span>継続検証 ${output.summary.continueValidation}</span>
        <span>最終承認待ち ${output.summary.finalApproval}</span>
      </div>
      <div class="hpr-list">
        ${output.items.map(row => `
          <article class="hpr-row status-${row.status}">
            <div class="hpr-title"><b>${row.group}｜${row.label}</b><strong>${row.label ? row.readinessScore : 0}点</strong></div>
            <div class="hpr-badges"><span>${row.label}</span><span>対象 ${row.target}</span><span>上限 ±${Math.abs(row.maxAdjustment)}点</span></div>
            <ul>${row.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul>
            <small>本番適用：無効／最終承認必須／自動反映禁止</small>
          </article>`).join("")}
      </div>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-production-readiness-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-production-readiness-style";
    style.textContent = `.hiyori-production-readiness{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hpr-head{display:flex;justify-content:space-between;gap:12px}.hpr-head h3{margin:0 0 4px;font-size:17px}.hpr-head p{margin:0;color:#64748b;font-size:12px}.hpr-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px}.hpr-summary{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.hpr-summary span,.hpr-badges span{padding:5px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:11px}.hpr-list{display:grid;gap:8px}.hpr-row{padding:11px;border:1px solid #e2e8f0;border-radius:12px}.hpr-title{display:flex;justify-content:space-between;gap:8px}.hpr-title b,.hpr-title strong{font-size:12px}.hpr-badges{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.hpr-row ul{margin:7px 0;padding-left:18px;color:#475569;font-size:11px}.hpr-row small{color:#64748b;font-size:10px}.status-blocked{background:#fff7f7}.status-continue_validation{background:#fffbeb}.status-final_approval{background:#f0fdf4}@media(max-width:720px){.hpr-head{display:block}.hpr-head>strong{display:inline-block;margin-top:8px}.hpr-title{align-items:flex-start}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    [
      "chappy:hiyori-correlation-confidence-updated",
      "chappy:hiyori-adoption-candidates-updated",
      "chappy:hiyori-proposal-approval-updated",
      "chappy:hiyori-shadow-performance-updated"
    ].forEach(name => window.addEventListener(name, build));
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriProductionReadiness = { build, render, classify };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();