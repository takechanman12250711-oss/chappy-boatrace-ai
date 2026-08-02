(function (root, factory) {
  "use strict";
  const api = factory();
  root.ChappySkipAiShadow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function n(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function build(input = {}) {
    const scenarios = Array.isArray(input?.scenarioAiV6Shadow?.scenarios)
      ? input.scenarioAiV6Shadow.scenarios
      : [];
    const likelihoods = scenarios.map(row => n(row?.likelihood)).sort((a, b) => b - a);
    const top = likelihoods[0] || 0;
    const second = likelihoods[1] || 0;
    const gap = Math.max(0, top - second);
    const confidence = n(input?.selectionScore ?? input?.mainLineConfidence ?? input?.confidence);
    const evidenceCompleteness = n(input?.evidenceCompleteness ?? input?.dataCompleteness ?? 100);
    const reasons = [];
    let riskScore = 0;

    if (scenarios.length < 2) {
      riskScore += 30;
      reasons.push("展開シナリオの比較材料が不足");
    }
    if (gap < 8) {
      riskScore += 30;
      reasons.push("上位展開シナリオが拮抗");
    } else if (gap < 15) {
      riskScore += 15;
      reasons.push("上位展開の差が小さい");
    }
    if (confidence > 0 && confidence < 60) {
      riskScore += 25;
      reasons.push("本線信頼度が基準未満");
    }
    if (evidenceCompleteness < 70) {
      riskScore += 25;
      reasons.push("展示・STなどの判断材料が不足");
    }

    riskScore = Math.min(100, riskScore);
    const decision = riskScore >= 55 ? "skip" : riskScore >= 35 ? "caution" : "bet-candidate";

    return {
      version: "1.0.1-display",
      decision,
      riskScore,
      scenarioGap: Math.round(gap * 10) / 10,
      topScenarioLikelihood: top,
      secondScenarioLikelihood: second,
      reasons,
      status: scenarios.length ? "shadow-ready" : "insufficient-scenario-data",
      applicationMode: "display-only",
      usableForPrediction: false,
      automaticApplication: false,
      affectsTickets: false,
      affectsMarks: false,
      affectsRaceSelection: false
    };
  }

  return { build };
});