(function (root) {
  "use strict";
  if (root.ChappyTheoryImprovementDashboard) return;

  const SOURCES = {
    performance: "data/stats/theory-performance-report.json",
    proposals: "data/stats/theory-improvement-proposals.json",
    production: "data/stats/theory-shadow-production-gate.json",
    approval: "data/stats/theory-adoption-approval-status.json",
    rollout: "data/stats/theory-adoption-rollout.json",
    monitor: "data/stats/theory-adoption-monitor.json",
    stopDecision: "data/stats/theory-stop-decision-report.json"
  };

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function loadJson(url) {
    const response = await fetch(`${url}?v=20260802-theory-operation1`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  function topTheoryRows(performance) {
    return (Array.isArray(performance?.byTheory) ? performance.byTheory : [])
      .slice().sort((a, b) => number(b.raceCount) - number(a.raceCount) || number(b.recoveryRate) - number(a.recoveryRate)).slice(0, 5);
  }

  function operationState(data) {
    if (data.stopDecision?.status === "operator-action-required" || data.monitor?.stopRequested === true) return "停止対応が必要";
    if (data.rollout?.enabled === true && number(data.rollout?.rolloutPercent) > 0) return "カナリア監視中";
    if (data.approval?.humanApproved === true || data.approval?.adoptionAllowed === true) return "承認済み・停止中";
    return "未承認";
  }

  function statusLabel(production, data) {
    const operation = operationState(data || {});
    if (operation !== "未承認") return operation;
    if (production?.productionCandidate === true) return "本番採用候補あり";
    const comparable = number(production?.evidence?.overall?.comparableCount || production?.overall?.comparableCount);
    return comparable > 0 ? `検証中（${comparable}R）` : "データ蓄積中";
  }

  function renderHtml(data) {
    const performance = data.performance || {};
    const proposals = data.proposals || {};
    const production = data.production || {};
    const approval = data.approval || {};
    const rollout = data.rollout || {};
    const monitor = data.monitor || {};
    const stopDecision = data.stopDecision || {};
    const approved = Array.isArray(proposals?.approvalGate?.approvedCandidates) ? proposals.approvalGate.approvedCandidates.length : number(proposals?.approvedCandidateCount);
    const rows = topTheoryRows(performance);
    const nextAction = stopDecision?.nextAction || stopDecision?.recommendedAction || (monitor?.status === "healthy" ? "監視継続" : "データ蓄積を継続");

    return `
      <details class="theory-improvement-dashboard" id="theoryImprovementDashboard">
        <summary><span>理論改善ダッシュボード</span><strong>${escapeHtml(statusLabel(production, data))}</strong></summary>
        <div class="theory-improvement-dashboard__body">
          <section class="theory-operation-panel">
            <h3>運用管理</h3>
            <div class="theory-operation-panel__state">${escapeHtml(operationState(data))}</div>
            <div class="theory-improvement-dashboard__metrics">
              <div><span>本番候補</span><strong>${production?.productionCandidate === true ? "あり" : "なし"}</strong></div>
              <div><span>承認状態</span><strong>${approval?.humanApproved === true ? "承認済み" : "未承認"}</strong></div>
              <div><span>反映率</span><strong>${number(rollout?.rolloutPercent)}%</strong></div>
              <div><span>監視状態</span><strong>${escapeHtml(monitor?.status || "未稼働")}</strong></div>
            </div>
            <div class="theory-operation-panel__detail">
              <span>A勝ち ${number(monitor?.summary?.aWins || production?.overall?.aWins)}</span>
              <span>B勝ち ${number(monitor?.summary?.bWins || production?.overall?.bWins)}</span>
              <span>比較 ${number(monitor?.summary?.comparableCount || production?.overall?.comparableCount)}R</span>
            </div>
            <p><strong>次の操作：</strong>${escapeHtml(nextAction)}</p>
          </section>
          <div class="theory-improvement-dashboard__metrics">
            <div><span>集計理論</span><strong>${number(performance?.byTheory?.length)}</strong></div>
            <div><span>改善提案</span><strong>${number(proposals?.proposalCount)}</strong></div>
            <div><span>承認候補</span><strong>${approved}</strong></div>
            <div><span>本番候補</span><strong>${production?.productionCandidate === true ? 1 : 0}</strong></div>
          </div>
          <p class="theory-improvement-dashboard__note">表示専用。予想・印・買い目への自動反映は行いません。</p>
          ${rows.length ? `<div class="theory-improvement-dashboard__table-wrap"><table><thead><tr><th>理論</th><th>使用R</th><th>的中率</th><th>展開一致</th><th>回収率</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.label || row.theoryKey)}</td><td>${number(row.raceCount)}</td><td>${number(row.hitRate)}%</td><td>${number(row.scenarioMatchRate)}%</td><td>${number(row.recoveryRate)}%</td></tr>`).join("")}</tbody></table></div>` : `<p class="theory-improvement-dashboard__empty">理論成績を蓄積中です。</p>`}
        </div>
      </details>`;
  }

  function ensureStyle() {
    if (document.getElementById("theoryImprovementDashboardStyle")) return;
    const style = document.createElement("style");
    style.id = "theoryImprovementDashboardStyle";
    style.textContent = `.theory-improvement-dashboard{margin:16px 0;border:1px solid #d7dde6;border-radius:12px;background:#fff;overflow:hidden}.theory-improvement-dashboard summary{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;font-weight:700;background:#f7f9fc}.theory-improvement-dashboard summary strong{font-size:12px;color:#355b8c}.theory-improvement-dashboard__body{padding:14px 16px}.theory-improvement-dashboard__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.theory-improvement-dashboard__metrics div{padding:10px;border-radius:10px;background:#f7f9fc;text-align:center}.theory-improvement-dashboard__metrics span{display:block;font-size:11px;color:#667085}.theory-improvement-dashboard__metrics strong{display:block;margin-top:3px;font-size:16px}.theory-operation-panel{margin-bottom:14px;padding:12px;border:1px solid #dce5f1;border-radius:10px;background:#fbfcfe}.theory-operation-panel h3{margin:0 0 8px;font-size:14px}.theory-operation-panel__state{margin-bottom:10px;font-weight:700;color:#264f7d}.theory-operation-panel__detail{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;font-size:12px}.theory-operation-panel__detail span{padding:4px 8px;border-radius:999px;background:#eef3f8}.theory-improvement-dashboard__note,.theory-improvement-dashboard__empty{font-size:12px;color:#667085}.theory-improvement-dashboard__table-wrap{overflow-x:auto}.theory-improvement-dashboard table{width:100%;border-collapse:collapse;font-size:12px}.theory-improvement-dashboard th,.theory-improvement-dashboard td{padding:8px;border-bottom:1px solid #e8ecf2;text-align:right;white-space:nowrap}.theory-improvement-dashboard th:first-child,.theory-improvement-dashboard td:first-child{text-align:left}@media(max-width:640px){.theory-improvement-dashboard__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
    document.head.appendChild(style);
  }

  async function mount() {
    const area = document.getElementById("statsArea");
    if (!area || document.getElementById("theoryImprovementDashboard")) return;
    try {
      const entries = await Promise.all(Object.entries(SOURCES).map(async ([key, url]) => {
        try { return [key, await loadJson(url)]; } catch { return [key, {}]; }
      }));
      ensureStyle();
      area.insertAdjacentHTML("beforeend", renderHtml(Object.fromEntries(entries)));
    } catch (error) { console.warn("理論改善ダッシュボードを表示できません", error); }
  }

  root.ChappyTheoryImprovementDashboard = Object.freeze({ mount, renderHtml, topTheoryRows, statusLabel, operationState });
  root.addEventListener("chappy:stats-runtime-ready", () => setTimeout(mount, 0));
})(window);
