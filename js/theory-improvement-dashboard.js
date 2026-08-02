(function (root) {
  "use strict";

  if (root.ChappyTheoryImprovementDashboard) return;

  const SOURCES = {
    performance: "data/stats/theory-performance-report.json",
    proposals: "data/stats/theory-improvement-proposals.json",
    production: "data/stats/theory-shadow-production-gate.json"
  };

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadJson(url) {
    const response = await fetch(`${url}?v=20260802-theory-dashboard1`, {
      cache: "no-cache"
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  function topTheoryRows(performance) {
    return (Array.isArray(performance?.byTheory) ? performance.byTheory : [])
      .slice()
      .sort((a, b) =>
        number(b.raceCount) - number(a.raceCount) ||
        number(b.recoveryRate) - number(a.recoveryRate)
      )
      .slice(0, 5);
  }

  function statusLabel(production) {
    if (production?.productionCandidate === true) return "本番採用候補あり";
    const comparable = number(production?.evidence?.overall?.comparableCount || production?.overall?.comparableCount);
    return comparable > 0 ? `検証中（${comparable}R）` : "データ蓄積中";
  }

  function renderHtml(data) {
    const performance = data.performance || {};
    const proposals = data.proposals || {};
    const production = data.production || {};
    const approved = Array.isArray(proposals?.approvalGate?.approvedCandidates)
      ? proposals.approvalGate.approvedCandidates.length
      : number(proposals?.approvedCandidateCount);
    const proposalCount = number(proposals?.proposalCount);
    const rows = topTheoryRows(performance);

    return `
      <details class="theory-improvement-dashboard" id="theoryImprovementDashboard">
        <summary>
          <span>理論改善ダッシュボード</span>
          <strong>${escapeHtml(statusLabel(production))}</strong>
        </summary>
        <div class="theory-improvement-dashboard__body">
          <div class="theory-improvement-dashboard__metrics">
            <div><span>集計理論</span><strong>${number(performance?.byTheory?.length)}</strong></div>
            <div><span>改善提案</span><strong>${proposalCount}</strong></div>
            <div><span>承認候補</span><strong>${approved}</strong></div>
            <div><span>本番候補</span><strong>${production?.productionCandidate === true ? 1 : 0}</strong></div>
          </div>
          <p class="theory-improvement-dashboard__note">表示専用。予想・印・買い目への自動反映は行いません。</p>
          ${rows.length ? `
            <div class="theory-improvement-dashboard__table-wrap">
              <table>
                <thead><tr><th>理論</th><th>使用R</th><th>的中率</th><th>展開一致</th><th>回収率</th></tr></thead>
                <tbody>${rows.map(row => `
                  <tr>
                    <td>${escapeHtml(row.label || row.theoryKey)}</td>
                    <td>${number(row.raceCount)}</td>
                    <td>${number(row.hitRate)}%</td>
                    <td>${number(row.scenarioMatchRate)}%</td>
                    <td>${number(row.recoveryRate)}%</td>
                  </tr>`).join("")}</tbody>
              </table>
            </div>` : `<p class="theory-improvement-dashboard__empty">理論成績を蓄積中です。</p>`}
        </div>
      </details>`;
  }

  function ensureStyle() {
    if (document.getElementById("theoryImprovementDashboardStyle")) return;
    const style = document.createElement("style");
    style.id = "theoryImprovementDashboardStyle";
    style.textContent = `
      .theory-improvement-dashboard{margin:16px 0;border:1px solid #d7dde6;border-radius:12px;background:#fff;overflow:hidden}
      .theory-improvement-dashboard summary{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;font-weight:700;background:#f7f9fc}
      .theory-improvement-dashboard summary strong{font-size:12px;color:#355b8c}
      .theory-improvement-dashboard__body{padding:14px 16px}
      .theory-improvement-dashboard__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .theory-improvement-dashboard__metrics div{padding:10px;border-radius:10px;background:#f7f9fc;text-align:center}
      .theory-improvement-dashboard__metrics span{display:block;font-size:11px;color:#667085}
      .theory-improvement-dashboard__metrics strong{display:block;margin-top:3px;font-size:20px}
      .theory-improvement-dashboard__note,.theory-improvement-dashboard__empty{font-size:12px;color:#667085}
      .theory-improvement-dashboard__table-wrap{overflow-x:auto}
      .theory-improvement-dashboard table{width:100%;border-collapse:collapse;font-size:12px}
      .theory-improvement-dashboard th,.theory-improvement-dashboard td{padding:8px;border-bottom:1px solid #e8ecf2;text-align:right;white-space:nowrap}
      .theory-improvement-dashboard th:first-child,.theory-improvement-dashboard td:first-child{text-align:left}
      @media(max-width:640px){.theory-improvement-dashboard__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  async function mount() {
    const area = document.getElementById("statsArea");
    if (!area || document.getElementById("theoryImprovementDashboard")) return;
    try {
      const [performance, proposals, production] = await Promise.all(
        Object.values(SOURCES).map(loadJson)
      );
      ensureStyle();
      area.insertAdjacentHTML("beforeend", renderHtml({ performance, proposals, production }));
    } catch (error) {
      console.warn("理論改善ダッシュボードを表示できません", error);
    }
  }

  root.ChappyTheoryImprovementDashboard = Object.freeze({
    mount,
    renderHtml,
    topTheoryRows,
    statusLabel
  });

  root.addEventListener("chappy:stats-runtime-ready", () => {
    setTimeout(mount, 0);
  });
})(window);
