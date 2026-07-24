// js/reference-tag-report.js
// 参考タグの検証結果を表示する。予想ロジック・配点・買い目には使用しない。
(function () {
  "use strict";

  const REPORTS = [
    {
      key: "tag",
      url: "data/analysis/reference-tag-effectiveness.json",
      title: "参考タグ実績"
    },
    {
      key: "hiyori",
      url: "data/analysis/hiyori-official-comparison.json",
      title: "日和データ・公式結果比較"
    }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function rate(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)}%` : "-";
  }

  function statusClass(status) {
    if (/高|有効/.test(status || "")) return "is-high";
    if (/要検証|低/.test(status || "")) return "is-low";
    if (/不足|蓄積/.test(status || "")) return "is-wait";
    return "is-mid";
  }

  function normalizeRows(report) {
    const rows = report?.tags || report?.metrics || report?.items || report?.comparisons || [];
    if (!Array.isArray(rows)) return [];
    return rows.map(item => ({
      label: item.label || item.name || item.metric || item.key || "-",
      samples: Number(item.samples ?? item.count ?? item.races ?? 0),
      winnerRate: item.winnerRate ?? item.winRate ?? item.firstRate,
      top3Rate: item.top3Rate ?? item.podiumRate ?? item.placeRate,
      ticketHitRate: item.ticketHitRate ?? item.hitRate,
      status: item.status || item.judgement || item.level || "データ蓄積中"
    }));
  }

  function renderReport(report, definition) {
    const rows = normalizeRows(report);
    const matched = Number(report?.matchedRaceCount ?? report?.raceCount ?? report?.samples ?? 0);

    if (!rows.length) {
      return `
        <article class="reference-report-card">
          <h3>${escapeHtml(definition.title)}</h3>
          <p class="reference-report-empty">検証データを蓄積中です。</p>
        </article>
      `;
    }

    return `
      <article class="reference-report-card">
        <div class="reference-report-head">
          <h3>${escapeHtml(definition.title)}</h3>
          <span>${escapeHtml(matched)}レース</span>
        </div>
        <div class="reference-report-table-wrap">
          <table class="reference-report-table">
            <thead>
              <tr>
                <th>情報</th>
                <th>件数</th>
                <th>1着率</th>
                <th>3着内率</th>
                <th>厳選的中率</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <td><strong>${escapeHtml(row.label)}</strong></td>
                  <td>${escapeHtml(row.samples)}</td>
                  <td>${escapeHtml(rate(row.winnerRate))}</td>
                  <td>${escapeHtml(rate(row.top3Rate))}</td>
                  <td>${escapeHtml(rate(row.ticketHitRate))}</td>
                  <td><span class="reference-report-status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function ensureStyles() {
    if (document.getElementById("reference-tag-report-style")) return;
    const style = document.createElement("style");
    style.id = "reference-tag-report-style";
    style.textContent = `
      .reference-report-section{margin-top:16px;padding:14px;border:1px solid #dbe6f3;border-radius:14px;background:#f8fbff}
      .reference-report-title{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:12px}
      .reference-report-title h3{margin:0;font-size:16px}.reference-report-title small{color:#64748b}
      .reference-report-grid{display:grid;gap:12px}.reference-report-card{padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .reference-report-card h3{margin:0;font-size:14px}.reference-report-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}.reference-report-head span{font-size:12px;color:#64748b}
      .reference-report-table-wrap{overflow-x:auto}.reference-report-table{width:100%;border-collapse:collapse;min-width:620px;font-size:12px}.reference-report-table th,.reference-report-table td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}
      .reference-report-status{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef2f7}.reference-report-status.is-high{background:#dcfce7;color:#166534}.reference-report-status.is-mid{background:#e0f2fe;color:#075985}.reference-report-status.is-low{background:#fee2e2;color:#991b1b}.reference-report-status.is-wait{background:#f1f5f9;color:#475569}
      .reference-report-empty{margin:8px 0 0;color:#64748b;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  async function fetchReport(definition) {
    try {
      const response = await fetch(`${definition.url}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn(`[reference-report] ${definition.url}`, error);
      return null;
    }
  }

  async function render() {
    const target = document.getElementById("statsArea");
    if (!target) return;
    ensureStyles();

    const reports = await Promise.all(REPORTS.map(fetchReport));
    let area = document.getElementById("referenceTagReportArea");
    if (!area) {
      area = document.createElement("section");
      area.id = "referenceTagReportArea";
      area.className = "reference-report-section";
      target.insertAdjacentElement("afterend", area);
    }

    area.innerHTML = `
      <div class="reference-report-title">
        <h3>📎 参考情報の検証</h3>
        <small>公式結果との照合実績。予想ロジックには未反映</small>
      </div>
      <div class="reference-report-grid">
        ${REPORTS.map((definition, index) => renderReport(reports[index] || {}, definition)).join("")}
      </div>
    `;
  }

  function install() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
    window.addEventListener("chappy:stats-updated", render);
  }

  window.ChappyReferenceTagReport = { install, render };
  install();
})();