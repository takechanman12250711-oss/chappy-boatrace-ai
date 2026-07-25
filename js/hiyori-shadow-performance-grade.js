// js/hiyori-shadow-performance-grade.js
// シャドー検証結果を提案ごとに集計し、継続観察・有望・採用検討・中止候補へ分類する。
// 実予想・印・配点・買い目には一切反映しない。
(function () {
  "use strict";

  const SHADOW_KEY = "chappy_hiyori_shadow_validation_v1";
  const GRADE_KEY = "chappy_hiyori_shadow_performance_grade_v1";

  function read(key, fallback) {
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function wilsonLower(success, total) {
    if (!total) return 0;
    const z = 1.96;
    const p = success / total;
    const denominator = 1 + (z * z) / total;
    const center = p + (z * z) / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.round(((center - margin) / denominator) * 1000) / 10;
  }

  function position(order, boatNo) {
    const index = Array.isArray(order) ? order.indexOf(boatNo) : -1;
    return index >= 0 ? index + 1 : 7;
  }

  function evaluateProposal(proposalId, rows) {
    const evaluated = rows.filter(row => row?.evaluated && Array.isArray(row?.proposalIds) && row.proposalIds.includes(proposalId));
    let improved = 0;
    let worsened = 0;
    let neutral = 0;
    let totalRankGain = 0;
    let changed = 0;

    evaluated.forEach(row => {
      if (row.effect === "improved") improved += 1;
      else if (row.effect === "worsened") worsened += 1;
      else neutral += 1;
      if (row.changed) changed += 1;

      const winner = Number(row?.result?.order?.[0] || 0);
      if (winner) {
        const basePos = position(row.baseOrder, winner);
        const shadowPos = position(row.shadowOrder, winner);
        totalRankGain += basePos - shadowPos;
      }
    });

    const samples = evaluated.length;
    const improvementRate = pct(improved, samples);
    const worseningRate = pct(worsened, samples);
    const neutralRate = pct(neutral, samples);
    const changeRate = pct(changed, samples);
    const netRate = Math.round((improvementRate - worseningRate) * 10) / 10;
    const averageRankGain = samples ? Math.round((totalRankGain / samples) * 100) / 100 : 0;
    const conservativeImprovement = wilsonLower(improved, samples);

    const sampleScore = clamp((samples / 120) * 40, 0, 40);
    const netScore = clamp((netRate + 20) * 0.75, 0, 30);
    const rankScore = clamp((averageRankGain + 0.5) * 12, 0, 20);
    const stabilityScore = clamp((100 - worseningRate) * 0.1, 0, 10);
    const performanceScore = Math.round(sampleScore + netScore + rankScore + stabilityScore);

    let grade = { code: "watch", label: "継続観察" };
    let reason = "サンプルを蓄積しながら改善・悪化の差を観察します。";

    if (samples >= 60 && worseningRate >= 18 && netRate <= -5) {
      grade = { code: "stop", label: "中止候補" };
      reason = "悪化率が高く、改善との差引もマイナスです。";
    } else if (samples >= 120 && netRate >= 8 && averageRankGain >= 0.15 && conservativeImprovement >= 8) {
      grade = { code: "consider", label: "採用検討" };
      reason = "十分なサンプルで改善優位と順位上昇が確認されています。";
    } else if (samples >= 60 && netRate >= 5 && averageRankGain > 0) {
      grade = { code: "promising", label: "有望" };
      reason = "改善が悪化を上回り、平均順位も上向いています。";
    } else if (samples < 30) {
      reason = "サンプル不足のため結論を出さず継続観察します。";
    } else if (Math.abs(netRate) < 5) {
      reason = "改善と悪化の差が小さく、現時点では中立です。";
    }

    return {
      proposalId,
      samples,
      improved,
      worsened,
      neutral,
      improvementRate,
      worseningRate,
      neutralRate,
      changeRate,
      netRate,
      averageRankGain,
      conservativeImprovement,
      performanceScore,
      grade,
      reason,
      shadowOnly: true,
      appliedToPrediction: false
    };
  }

  function build() {
    const rows = read(SHADOW_KEY, []);
    const list = Array.isArray(rows) ? rows : [];
    const ids = [...new Set(list.flatMap(row => Array.isArray(row?.proposalIds) ? row.proposalIds : []).filter(Boolean))];
    const grades = ids.map(id => evaluateProposal(id, list)).sort((a, b) => b.performanceScore - a.performanceScore);
    const result = {
      createdAt: new Date().toISOString(),
      totalShadowRows: list.length,
      evaluatedRows: list.filter(row => row?.evaluated).length,
      summary: {
        watch: grades.filter(row => row.grade.code === "watch").length,
        promising: grades.filter(row => row.grade.code === "promising").length,
        consider: grades.filter(row => row.grade.code === "consider").length,
        stop: grades.filter(row => row.grade.code === "stop").length
      },
      grades,
      shadowOnly: true,
      appliedToPrediction: false
    };
    localStorage.setItem(GRADE_KEY, JSON.stringify(result));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-shadow-performance-updated", { detail: result }));
    return result;
  }

  function install() {
    build();
    window.addEventListener("chappy:hiyori-shadow-simulated", build);
    window.addEventListener("chappy:hiyori-shadow-evaluated", build);
    window.addEventListener("storage", build);
    setInterval(build, 60000);
  }

  window.ChappyHiyoriShadowPerformanceGrade = { build, evaluateProposal, wilsonLower };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
