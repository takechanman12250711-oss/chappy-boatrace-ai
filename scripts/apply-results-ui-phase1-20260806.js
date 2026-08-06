"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const statsPath = path.join(root, "js", "stats.js");
const stylePath = path.join(root, "style.css");

let stats = fs.readFileSync(statsPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");

const oldKpis = `        <div class="result-kpi-grid">
          \${renderMetricCard({
            icon: "🎯",
            label: "厳選的中率",
            value: \`\${analysisHitRate}%\`,
            detail: \`\${resultHeadline.practicalHits}/\${resultHeadline.practicalCount}R\`,
            tone: "blue"
          })}
          \${renderMetricCard({
            icon: "💴",
            label: "回収率",
            value: \`\${recoveryRate}%\`,
            detail:
              \`投資\${formatMoney(resultHeadline.totalStake)}・払戻\${formatMoney(resultHeadline.totalReturn)}\`,
            tone:
              recoveryRate >= 100
                ? "green"
                : recoveryRate >= 80
                  ? "amber"
                  : "red"
          })}
          \${renderMetricCard({
            icon: "📊",
            label: "検証収支",
            value: formatMoney(
              resultHeadline.totalReturn -
                resultHeadline.totalStake
            ),
            detail: "1点100円で計算",
            tone:
              resultHeadline.totalReturn >=
              resultHeadline.totalStake
                ? "green"
                : "red"
          })}
        </div>`;

const newKpis = `        <div class="result-kpi-grid result-kpi-grid-five">
          \${renderMetricCard({
            icon: "🎯",
            label: "厳選的中率",
            value: \`\${analysisHitRate}%\`,
            detail: \`\${resultHeadline.practicalHits}/\${resultHeadline.practicalCount}R\`,
            tone: "blue"
          })}
          \${renderMetricCard({
            icon: "📈",
            label: "回収率",
            value: \`\${recoveryRate}%\`,
            detail: "1点100円の検証値",
            tone:
              recoveryRate >= 100
                ? "green"
                : recoveryRate >= 80
                  ? "amber"
                  : "red"
          })}
          \${renderMetricCard({
            icon: "💹",
            label: "検証収支",
            value: formatMoney(
              resultHeadline.totalReturn -
                resultHeadline.totalStake
            ),
            detail: "払戻－購入額",
            tone:
              resultHeadline.totalReturn >=
              resultHeadline.totalStake
                ? "green"
                : "red"
          })}
          \${renderMetricCard({
            icon: "🧾",
            label: "購入額",
            value: formatMoney(resultHeadline.totalStake),
            detail: \`対象\${resultHeadline.practicalCount}R\`,
            tone: "amber"
          })}
          \${renderMetricCard({
            icon: "💴",
            label: "払戻額",
            value: formatMoney(resultHeadline.totalReturn),
            detail: \`的中\${resultHeadline.practicalHits}R\`,
            tone:
              resultHeadline.totalReturn > 0
                ? "green"
                : "blue"
          })}
        </div>`;

if (!stats.includes("result-kpi-grid-five")) {
  if (!stats.includes(oldKpis)) throw new Error("KPI block not found");
  stats = stats.replace(oldKpis, newKpis);
}

const oldRecent = `      <section class="result-panel" aria-labelledby="recentResultTitle">
        <header class="result-panel-head">
          <div>
            <p class="result-kicker">RECENT</p>
            <h3 id="recentResultTitle">直近の結果</h3>
          </div>
          <span class="result-sample-badge">
            最新\${recentRows.length}R
          </span>
        </header>
        <div class="result-race-list">
          \${recentHtml}
        </div>
      </section>`;

const newRecent = `      <details
        class="result-accordion"
        data-result-panel="recent-results"
        \${panelOpen("recent-results", true)}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🗂️</span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">直近の結果</span>
            <small>予想・公式結果・的中／不的中を確認</small>
          </span>
          <span class="result-accordion-meta">
            最新\${recentRows.length}R
          </span>
        </summary>
        <div class="result-accordion-body">
          <div class="result-race-list">
            \${recentHtml}
          </div>
        </div>
      </details>`;

if (!stats.includes('data-result-panel="recent-results"')) {
  if (!stats.includes(oldRecent)) throw new Error("recent results block not found");
  stats = stats.replace(oldRecent, newRecent);
}

stats = stats.replace(
  /const STATS_REQUEST_TIMEOUT_MS = 30000;/,
  'const STATS_REQUEST_TIMEOUT_MS = 30000;\n  const RESULTS_UI_VERSION = "results-ui-phase1-20260806";'
);

const marker = "/* results analysis phase1 20260806 */";
if (!style.includes(marker)) {
  style += `\n\n${marker}\n.result-kpi-grid-five {\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n}\n.result-kpi-grid-five > :nth-child(3) {\n  grid-column: 1 / -1;\n}\n@media (min-width: 760px) {\n  .result-kpi-grid-five {\n    grid-template-columns: repeat(5, minmax(0, 1fr));\n  }\n  .result-kpi-grid-five > :nth-child(3) {\n    grid-column: auto;\n  }\n}\n`;
}

if (!stats.includes("results-ui-phase1-20260806")) throw new Error("version marker missing");
if (!stats.includes('data-result-panel="recent-results"')) throw new Error("recent accordion missing");
if (!style.includes(marker)) throw new Error("style marker missing");

fs.writeFileSync(statsPath, stats);
fs.writeFileSync(stylePath, style);
console.log("results UI phase1 applied");
