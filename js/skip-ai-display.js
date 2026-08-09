(function (root) {
  "use strict";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensureStyle() {
    if (document.getElementById("skipAiDisplayStyle")) return;
    const style = document.createElement("style");
    style.id = "skipAiDisplayStyle";
    style.textContent = `
      .skip-ai-panel{margin:0 0 14px;padding:14px 16px;border-radius:16px;border:1px solid #d7dce3;background:#fff;box-shadow:0 6px 18px rgba(18,38,63,.08)}
      .skip-ai-panel[data-decision="bet-candidate"]{border-left:7px solid #22a06b;background:#f1fbf6}
      .skip-ai-panel[data-decision="caution"]{border-left:7px solid #e6a700;background:#fff9e8}
      .skip-ai-panel[data-decision="skip"]{border-left:7px solid #d9363e;background:#fff2f3}
      .skip-ai-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .skip-ai-title{font-weight:800;font-size:1.05rem}
      .skip-ai-risk{font-size:.78rem;color:#5b6470;font-weight:700}
      .skip-ai-reasons{margin:9px 0 0;padding-left:1.2em;color:#333;line-height:1.55;font-size:.92rem}
      .skip-ai-note{margin-top:8px;font-size:.76rem;color:#6d7480}
    `;
    document.head.appendChild(style);
  }

  function confidenceOf(prediction) {
    return Number(
      prediction?.selectionScore ??
      prediction?.mainLineConfidence ??
      prediction?.confidence ??
      prediction?.practicalSelection?.selectionScore ??
      prediction?.practicalSelection?.score ??
      0
    ) || 0;
  }

  function completenessOf(prediction) {
    const dataQualityScore =
      prediction?.dataQuality?.score;
    if (
      dataQualityScore !== null &&
      dataQualityScore !== undefined &&
      String(dataQualityScore).trim() !== "" &&
      Number.isFinite(Number(dataQualityScore))
    ) {
      return Math.max(0, Math.min(100, Number(dataQualityScore)));
    }
    const explicitCompleteness =
      prediction?.evidenceCompleteness;
    if (
      explicitCompleteness !== null &&
      explicitCompleteness !== undefined &&
      String(explicitCompleteness).trim() !== "" &&
      Number.isFinite(Number(explicitCompleteness))
    ) {
      return Math.max(0, Math.min(100, Number(explicitCompleteness)));
    }
    const evidence = prediction?.verificationEvidence || {};
    let points = 45;
    if (Array.isArray(evidence?.scenarios) && evidence.scenarios.length) points += 25;
    if (evidence?.marks) points += 15;
    if (prediction?.exhibition || prediction?.exhibitionData) points += 10;
    if (prediction?.weather || prediction?.raceInfo?.weather) points += 5;
    return Math.min(100, points);
  }

  function buildDecision(prediction) {
    const scenarioBuilder = root.ChappyScenarioAiV6Shadow;
    const skipBuilder = root.ChappySkipAiShadow;
    if (!scenarioBuilder?.build || !skipBuilder?.build) return null;

    const scenarioAiV6Shadow = prediction?.scenarioAiV6Shadow || scenarioBuilder.build(prediction || {});
    const decision = skipBuilder.build({
      ...prediction,
      scenarioAiV6Shadow,
      selectionScore: confidenceOf(prediction),
      evidenceCompleteness: completenessOf(prediction)
    });
    prediction.scenarioAiV6Shadow = scenarioAiV6Shadow;
    prediction.skipAiDisplay = decision;
    return decision;
  }

  function labelOf(decision) {
    if (decision === "skip") return { icon: "🔴", label: "見送り" };
    if (decision === "caution") return { icon: "🟡", label: "注意" };
    return { icon: "🟢", label: "勝負候補" };
  }

  function renderPanel(prediction) {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return;
    resultArea.querySelector(".skip-ai-panel")?.remove();

    const data = buildDecision(prediction);
    if (!data) return;
    ensureStyle();

    const view = labelOf(data.decision);
    const reasons = data.reasons?.length
      ? data.reasons
      : [data.decision === "bet-candidate" ? "展開差と本線信頼度が基準内" : "追加の確認が必要"];

    const panel = document.createElement("section");
    panel.className = "skip-ai-panel";
    panel.dataset.decision = data.decision;
    panel.innerHTML = `
      <div class="skip-ai-head">
        <div class="skip-ai-title">${view.icon} 見送りAI：${esc(view.label)}</div>
        <div class="skip-ai-risk">参考リスク ${esc(Math.round(data.riskScore))}点</div>
      </div>
      <ul class="skip-ai-reasons">${reasons.slice(0,3).map(reason => `<li>${esc(reason)}</li>`).join("")}</ul>
      <div class="skip-ai-note">表示専用。印・買い目・実戦厳選は変更しません。</div>
    `;
    resultArea.prepend(panel);
  }

  function wrap(name) {
    const original = root[name];
    if (typeof original !== "function" || original.__skipAiWrapped) return;
    const wrapped = function (prediction) {
      const result = original.apply(this, arguments);
      try { renderPanel(prediction || {}); }
      catch (error) { console.warn("見送りAI表示エラー", error); }
      return result;
    };
    wrapped.__skipAiWrapped = true;
    root[name] = wrapped;
  }

  wrap("renderAll");
  wrap("renderPrediction");
  root.ChappySkipAiDisplay = Object.freeze({ render: renderPanel, buildDecision, completenessOf });
})(window);
