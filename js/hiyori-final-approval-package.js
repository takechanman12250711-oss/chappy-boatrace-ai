// js/hiyori-final-approval-package.js
// 最終承認待ちの提案を、根拠・補正上限・安全条件付きの承認パッケージとして固定保存する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const GATE_KEY = "chappy_hiyori_production_gate_v1";
  const PROPOSAL_KEY = "chappy_hiyori_change_proposals_v1";
  const SHADOW_SCORE_KEY = "chappy_hiyori_shadow_scorecard_v1";
  const PACKAGE_KEY = "chappy_hiyori_final_approval_packages_v1";
  const MAX_PACKAGES = 200;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function signature(value) {
    const text = stable(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `FAP-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function listOf(value) {
    return Array.isArray(value) ? value : value?.items || value?.rows || [];
  }

  function buildPackage(gateRow) {
    const proposals = listOf(read(PROPOSAL_KEY, []));
    const scorecards = listOf(read(SHADOW_SCORE_KEY, []));
    const id = gateRow?.proposalId || gateRow?.id;
    const proposal = proposals.find(row => (row?.id || row?.proposalId) === id) || {};
    const shadow = scorecards.find(row => (row?.proposalId || row?.id) === id) || {};

    const payload = {
      proposalId: id,
      group: proposal.group || gateRow.group || "-",
      label: proposal.label || gateRow.label || "-",
      target: proposal.target || gateRow.target || "表示・分析専用",
      maxAdjustment: Number(proposal.maxAdjustment ?? proposal.limit ?? gateRow.maxAdjustment ?? 0),
      direction: Number(proposal.direction ?? proposal.suggestedDirection ?? 1) < 0 ? -1 : 1,
      reliabilityScore: Number(gateRow.reliabilityScore ?? proposal.reliabilityScore ?? 0),
      correlationSamples: Number(gateRow.correlationSamples ?? proposal.samples ?? 0),
      shadowSamples: Number(gateRow.shadowSamples ?? shadow.samples ?? 0),
      shadowScore: Number(gateRow.shadowScore ?? shadow.score ?? shadow.shadowScore ?? 0),
      improvedRate: Number(shadow.improvedRate ?? 0),
      worsenedRate: Number(shadow.worsenedRate ?? 0),
      netEffectRate: Number(shadow.netEffectRate ?? 0),
      averageRankGain: Number(shadow.averageRankGain ?? 0),
      readinessScore: Number(gateRow.readinessScore ?? 0),
      gateStatus: gateRow.status || gateRow.gateStatus || "blocked",
      safety: {
        productionApplied: false,
        appliedToPrediction: false,
        applicationLock: true,
        globalProductionLock: true,
        maxAdjustmentLocked: true,
        oddsCannotCreateOrDeleteTickets: true,
        predictionPriorityUnchanged: true
      },
      stopConditions: [
        "相関信頼度が72点未満へ低下",
        "相関サンプルが120艇未満",
        "シャドー検証が120件未満",
        "シャドー悪化率が18%以上",
        "シャドー判定が採用検討未満",
        "提案内容または補正上限が変更",
        "最終承認から30日経過"
      ]
    };

    return {
      id: `${id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "awaiting_final_approval",
      payload,
      signature: signature(payload),
      immutable: true,
      finalApproved: false,
      productionApplied: false,
      appliedToPrediction: false
    };
  }

  function build() {
    const gates = listOf(read(GATE_KEY, []));
    const targets = gates.filter(row => ["awaiting_final_approval", "final_approval_waiting", "最終承認待ち"].includes(row?.status || row?.gateStatus));
    const current = listOf(read(PACKAGE_KEY, []));
    const latestByProposal = new Map(current.map(row => [row?.payload?.proposalId, row]));
    const created = [];

    targets.forEach(row => {
      const next = buildPackage(row);
      const previous = latestByProposal.get(next.payload.proposalId);
      if (!previous || previous.signature !== next.signature) created.push(next);
    });

    if (created.length) {
      const nextRows = [...created, ...current].slice(0, MAX_PACKAGES);
      localStorage.setItem(PACKAGE_KEY, JSON.stringify(nextRows));
      window.dispatchEvent(new CustomEvent("chappy:hiyori-final-approval-package-updated", { detail: { created: created.length } }));
    }

    render();
    return created;
  }

  function verify(pkg) {
    return Boolean(pkg?.payload && pkg?.signature === signature(pkg.payload));
  }

  function ensureHolder() {
    let holder = document.getElementById("hiyoriFinalApprovalPackage");
    if (holder) return holder;
    const anchor = document.getElementById("hiyoriProductionGate") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "hiyoriFinalApprovalPackage";
    holder.className = "hiyori-final-approval-package";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = listOf(read(PACKAGE_KEY, [])).slice(0, 10);
    holder.innerHTML = `
      <div class="hfap-head"><div><h3>📦 最終承認パッケージ</h3><p>最終承認待ちの提案を署名付きで固定保存します。</p></div><strong>${rows.length}件</strong></div>
      <div class="hfap-list">
        ${rows.length ? rows.map(row => {
          const p = row.payload || {};
          const valid = verify(row);
          return `<article class="hfap-card ${valid ? "is-valid" : "is-invalid"}">
            <div class="hfap-title"><b>${p.group}｜${p.label}</b><span>${valid ? "署名一致" : "変更検知"}</span></div>
            <p>対象：${p.target}／補正上限：±${Math.abs(Number(p.maxAdjustment || 0))}点</p>
            <p>相関 ${p.correlationSamples}艇・シャドー ${p.shadowSamples}件・準備度 ${p.readinessScore}点</p>
            <p>改善 ${p.improvedRate}%／悪化 ${p.worsenedRate}%／差引 ${p.netEffectRate}%</p>
            <code>${row.signature}</code>
            <small>最終承認前・本番反映なし・全ロックON</small>
          </article>`;
        }).join("") : "<p class=\"hfap-empty\">最終承認待ちの提案はありません。</p>"}
      </div>
      <p class="hfap-note">署名不一致を検知したパッケージは承認対象外です。予想へ自動反映しません。</p>`;
  }

  function ensureStyle() {
    if (document.getElementById("hiyori-final-approval-package-style")) return;
    const style = document.createElement("style");
    style.id = "hiyori-final-approval-package-style";
    style.textContent = `.hiyori-final-approval-package{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}.hfap-head{display:flex;justify-content:space-between;gap:12px}.hfap-head h3{margin:0 0 4px;font-size:17px}.hfap-head p{margin:0;color:#64748b;font-size:12px}.hfap-head>strong{white-space:nowrap;padding:5px 9px;border-radius:999px;background:#eef2ff;font-size:12px}.hfap-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.hfap-card{padding:11px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.hfap-card.is-valid{background:#f0fdf4;border-color:#bbf7d0}.hfap-card.is-invalid{background:#fef2f2;border-color:#fecaca}.hfap-title{display:flex;justify-content:space-between;gap:8px}.hfap-title b{font-size:13px}.hfap-title span{font-size:11px}.hfap-card p{margin:6px 0;font-size:11px;color:#475569}.hfap-card code{display:block;margin-top:7px;font-size:10px}.hfap-card small{display:block;margin-top:6px;color:#64748b;font-size:10px}.hfap-empty,.hfap-note{color:#64748b;font-size:11px}@media(max-width:720px){.hfap-list{grid-template-columns:1fr}.hfap-head{display:block}.hfap-head>strong{display:inline-block;margin-top:8px}}`;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    build();
    ["chappy:hiyori-production-gate-updated", "chappy:hiyori-shadow-scorecard-updated", "storage"].forEach(name => window.addEventListener(name, build));
    setInterval(build, 60000);
  }

  window.ChappyHiyoriFinalApprovalPackage = { build, render, verify, signature };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();