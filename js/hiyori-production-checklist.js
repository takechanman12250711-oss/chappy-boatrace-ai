// js/hiyori-production-checklist.js
// 本番反映直前の必須条件を検証する。予想本体には書き込まない。
(function () {
  "use strict";

  const PACKAGE_KEY = "chappy_hiyori_final_approval_packages_v1";
  const GATE_KEY = "chappy_hiyori_production_gate_v1";
  const SNAPSHOT_KEY = "chappy_hiyori_rollback_snapshots_v1";
  const CHECKLIST_KEY = "chappy_hiyori_production_checklist_v1";

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function asList(value) {
    return Array.isArray(value) ? value : value?.items || [];
  }

  function latestSignedSnapshot() {
    return asList(read(SNAPSHOT_KEY, [])).find(row => row?.signatureValid !== false) || null;
  }

  function evaluatePackage(pkg) {
    const gateRows = asList(read(GATE_KEY, []));
    const gate = gateRows.find(row => (row.proposalId || row.id) === pkg.proposalId) || {};
    const snapshot = latestSignedSnapshot();

    const checks = [
      { id: "package", label: "最終承認パッケージが存在", pass: Boolean(pkg) },
      { id: "signature", label: "パッケージ署名が一致", pass: pkg?.signatureValid !== false && Boolean(pkg?.signature) },
      { id: "gate", label: "最終判定ゲートが最終承認待ち", pass: gate?.status === "final_approval_pending" || gate?.label === "最終承認待ち" },
      { id: "readiness", label: "総合準備度85点以上", pass: Number(pkg?.readinessScore ?? gate?.readinessScore ?? 0) >= 85 },
      { id: "correlation", label: "相関信頼度72点以上", pass: Number(pkg?.correlationConfidence ?? 0) >= 72 },
      { id: "correlationSamples", label: "相関サンプル120以上", pass: Number(pkg?.correlationSamples ?? 0) >= 120 },
      { id: "shadowSamples", label: "シャドー検証120件以上", pass: Number(pkg?.shadowSamples ?? 0) >= 120 },
      { id: "shadowDecision", label: "シャドー判定が採用検討", pass: ["adoption_review", "採用検討"].includes(pkg?.shadowDecision) },
      { id: "worsened", label: "悪化率18%未満", pass: Number(pkg?.worsenedRate ?? 100) < 18 },
      { id: "rollback", label: "署名済み復元ポイントあり", pass: Boolean(snapshot) },
      { id: "lock", label: "本番ロックが有効", pass: pkg?.globalProductionLock !== false && pkg?.applicationLock !== false },
      { id: "notApplied", label: "未反映状態", pass: pkg?.productionApplied !== true && pkg?.appliedToPrediction !== true }
    ];

    const failed = checks.filter(row => !row.pass);
    return {
      proposalId: pkg.proposalId,
      packageId: pkg.id,
      checkedAt: new Date().toISOString(),
      checks,
      passed: checks.length - failed.length,
      total: checks.length,
      failed: failed.map(row => row.id),
      readyForPresentation: failed.length === 0,
      productionAllowed: false,
      requiresExplicitFinalApproval: true,
      globalProductionLock: true,
      appliedToPrediction: false
    };
  }

  function evaluateAll() {
    const packages = asList(read(PACKAGE_KEY, [])).filter(row => row?.status === "final_approval_pending" || row?.finalApproved === false);
    const rows = packages.map(evaluatePackage);
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-production-checklist-updated", { detail: rows }));
    return rows;
  }

  window.ChappyHiyoriProductionChecklist = { evaluateAll, evaluatePackage };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", evaluateAll, { once: true });
  else evaluateAll();
  setInterval(evaluateAll, 60000);
})();
