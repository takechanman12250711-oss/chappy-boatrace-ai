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
    if (document.getElementById("scenarioAiV6DisplayStyle")) return;
    const style = document.createElement("style");
    style.id = "scenarioAiV6DisplayStyle";
    style.textContent = `
      .scenario-v6-panel{margin:0 0 14px;padding:14px 16px;border-radius:16px;border:1px solid #cddff5;background:#f7fbff;box-shadow:0 6px 18px rgba(18,38,63,.07)}
      .scenario-v6-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
      .scenario-v6-title{font-size:1.02rem;font-weight:850;color:#124b84}
      .scenario-v6-note{font-size:.74rem;color:#68727e}
      .scenario-v6-list{display:grid;gap:8px}
      .scenario-v6-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border-radius:12px;background:#fff;border:1px solid #e0e8f1}
      .scenario-v6-rank{font-weight:900;white-space:nowrap}.scenario-v6-label{min-width:0}.scenario-v6-label strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scenario-v6-sub{margin-top:3px;font-size:.76rem;color:#65707d}
      .scenario-v6-rate{font-size:1rem;font-weight:900;color:#135fa8;white-space:nowrap}
      @media(max-width:520px){.scenario-v6-row{grid-template-columns:auto minmax(0,1fr);}.scenario-v6-rate{grid-column:2;justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function build(prediction) {
    const builder = root.ChappyScenarioAiV6Shadow;
    if (!builder?.build) return null;
    const data = prediction?.scenarioAiV6Shadow || builder.build(prediction || {});
    prediction.scenarioAiV6Shadow = data;
    return data;
  }

  function rankLabel(index) {
    return ["◎ 本命展開", "○ 対抗展開", "▲ 穴展開"][index] || `候補${index + 1}`;
  }

  function render(prediction) {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return;
    resultArea.querySelector(".scenario-v6-panel")?.remove();
    const data = build(prediction || {});
    const rows = Array.isArray(data?.scenarios) ? data.scenarios.slice(0, 3) : [];
    if (!rows.length) return;
    ensureStyle();

    const panel = document.createElement("section");
    panel.className = "scenario-v6-panel";
    panel.innerHTML = `
      <div class="scenario-v6-head">
        <div class="scenario-v6-title">🌊 展開AI v6</div>
        <div class="scenario-v6-note">表示専用</div>
      </div>
      <div class="scenario-v6-list">
        ${rows.map((row, index) => `
          <div class="scenario-v6-row">
            <div class="scenario-v6-rank">${esc(rankLabel(index))}</div>
            <div class="scenario-v6-label">
              <strong>${esc(row.label || row.scenarioType || `展開候補${index + 1}`)}</strong>
              <div class="scenario-v6-sub">${esc(row.representativeTicket ? `代表目 ${row.representativeTicket}` : "代表目は参考未設定")}</div>
            </div>
            <div class="scenario-v6-rate">${esc(Math.round(Number(row.likelihood) || 0))}%</div>
          </div>
        `).join("")}
      </div>
    `;

    const skipPanel = resultArea.querySelector(".skip-ai-panel");
    if (skipPanel?.nextSibling) resultArea.insertBefore(panel, skipPanel.nextSibling);
    else resultArea.prepend(panel);
  }

  function wrap(name) {
    const original = root[name];
    if (typeof original !== "function" || original.__scenarioV6DisplayWrapped) return;
    const wrapped = function (prediction) {
      const result = original.apply(this, arguments);
      try { render(prediction || {}); }
      catch (error) { console.warn("展開AI v6表示エラー", error); }
      return result;
    };
    wrapped.__scenarioV6DisplayWrapped = true;
    root[name] = wrapped;
  }

  wrap("renderAll");
  wrap("renderPrediction");
  root.ChappyScenarioAiV6Display = Object.freeze({ render, build });
})(window);
