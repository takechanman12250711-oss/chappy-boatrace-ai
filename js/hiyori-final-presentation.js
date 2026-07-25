// js/hiyori-final-presentation.js
// 最終承認対象の根拠・変更幅・リスク・復元方法を一枚にまとめる。
// 予想ロジック・印・買い目には書き込まない。
(function () {
  "use strict";

  const PACKAGE_KEY = "chappy_hiyori_final_approval_packages_v1";
  const CHECKLIST_KEY = "chappy_hiyori_final_checklist_v1";
  const SHADOW_SCORE_KEY = "chappy_hiyori_shadow_scorecards_v1";
  const APPROVAL_KEY = "chappy_hiyori_final_approvals_v1";
  const PRESENTATION_KEY = "chappy_hiyori_final_presentations_v1";
  const MAX_ROWS = 200;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function listOf(value) {
    return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stable(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fp-${(h >>> 0).toString(16).padStart(8, "0")}`;
  }

  function latestChecklist(packageId) {
    const rows = listOf(read(CHECKLIST_KEY, []));
    return rows.find(row => row.packageId === packageId) || rows[0] || null;
  }

  function shadowCard(proposalId) {
    const rows = listOf(read(SHADOW_SCORE_KEY, []));
    return rows.find(row => row.proposalId === proposalId || row.id === proposalId) || null;
  }

  function createPresentation(pkg) {
    if (!pkg || pkg.finalApproved === true || pkg.productionApplied === true) return null;
    const checklist = latestChecklist(pkg.id || pkg.packageId);
    const proposalId = pkg.proposalId || pkg.id;
    const shadow = shadowCard(proposalId);
    const checklistPassed = Boolean(checklist?.passed || checklist?.allPassed || checklist?.status === "passed");
    const packageSignatureValid = pkg.signatureValid !== false && pkg.integrityValid !== false;

    const body = {
      packageId: pkg.id || pkg.packageId,
      proposalId,
      title: pkg.title || pkg.label || pkg.target || "日和データ補正提案",
      target: pkg.target || pkg.group || "未設定",
      condition: pkg.condition || pkg.label || "未設定",
      currentValue: pkg.currentValue ?? null,
      proposedValue: pkg.proposedValue ?? null,
      maxAdjustment: Number(pkg.maxAdjustment ?? pkg.limit ?? 0),
      direction: Number(pkg.direction ?? 1) < 0 ? "減点" : "加点",
      rationale: pkg.rationale || pkg.reason || pkg.evidence || "相関・信頼度・シャドー検証に基づく提案",
      correlationConfidence: Number(pkg.correlationConfidence ?? pkg.confidenceScore ?? 0),
      correlationSamples: Number(pkg.correlationSamples ?? pkg.sampleCount ?? 0),
      shadowSamples: Number(shadow?.evaluated ?? shadow?.samples ?? pkg.shadowSamples ?? 0),
      improvementRate: Number(shadow?.improvementRate ?? pkg.improvementRate ?? 0),
      worseningRate: Number(shadow?.worseningRate ?? pkg.worseningRate ?? 0),
      netEffectRate: Number(shadow?.netEffectRate ?? pkg.netEffectRate ?? 0),
      averageRankGain: Number(shadow?.averageRankGain ?? pkg.averageRankGain ?? 0),
      readinessScore: Number(pkg.readinessScore ?? checklist?.readinessScore ?? 0),
      benefits: [
        "展示・ST・水面などの補助情報を、蓄積結果に応じて限定的に補正できる",
        "展開・コース優先の基本ロジックは維持する",
        "補正上限を固定し、数字だけで買い目を変更しない"
      ],
      risks: [
        "特定条件への過適合",
        "サンプル偏りによる一時的な成績上振れ",
        "補正が重複した際の順位変動"
      ],
      stopConditions: pkg.stopConditions || [
        "悪化率18%以上",
        "差引効果がマイナス",
        "署名不一致またはデータ欠損",
        "展開・コース優先順位に反する変化"
      ],
      rollback: {
        available: true,
        method: "反映前スナップショットへ復元",
        productionLockRestored: true,
        appliedToPredictionAfterRollback: false
      },
      checklistPassed,
      packageSignatureValid,
      finalApprovalEligible: checklistPassed && packageSignatureValid,
      finalApproved: false,
      productionApplied: false,
      appliedToPrediction: false,
      globalProductionLock: true,
      generatedAt: new Date().toISOString()
    };

    const signatureTarget = { ...body };
    delete signatureTarget.generatedAt;
    body.signature = hash(JSON.stringify(stable(signatureTarget)));

    const rows = listOf(read(PRESENTATION_KEY, []));
    const next = [body, ...rows.filter(row => row.packageId !== body.packageId)].slice(0, MAX_ROWS);
    write(PRESENTATION_KEY, next);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-final-presentation-ready", { detail: body }));
    return body;
  }

  function generateAll() {
    const packages = listOf(read(PACKAGE_KEY, []));
    return packages.map(createPresentation).filter(Boolean);
  }

  function verify(presentation) {
    if (!presentation?.signature) return false;
    const target = { ...presentation };
    delete target.generatedAt;
    delete target.signature;
    return presentation.signature === hash(JSON.stringify(stable(target)));
  }

  function status() {
    const rows = listOf(read(PRESENTATION_KEY, []));
    const verified = rows.filter(verify);
    const eligible = verified.filter(row => row.finalApprovalEligible);
    return {
      total: rows.length,
      verified: verified.length,
      eligible: eligible.length,
      approved: listOf(read(APPROVAL_KEY, [])).filter(row => row.status === "final-approved").length,
      productionApplied: false,
      globalProductionLock: true
    };
  }

  function install() {
    generateAll();
    window.addEventListener("chappy:hiyori-final-package-ready", generateAll);
    window.addEventListener("chappy:hiyori-final-checklist-updated", generateAll);
    setInterval(generateAll, 60000);
  }

  window.ChappyHiyoriFinalPresentation = { createPresentation, generateAll, verify, status };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();